"""
Testes da agenda de disponibilidade e do agendamento de slots (issue #78).

Cobrem o contrato consumido pela Parte 2 (web) e as regras de negócio:

- `GET  /api/professionals/{id}/agenda` — agenda pública, slots fatiados da
  grade semanal, reservas ativas/ passado omitidos, janela de até 60 dias;
- `POST /api/agendamentos` — reserva do cliente autenticado, com 401/403/404/
  409/422 conforme o caso, inclusive a corrida resolvida pelo índice único;
- `GET  /api/agendamentos/meus` — leitura escopada ao cliente do token;
- `PUT/GET /api/agendamentos/disponibilidade` — grade semanal do profissional.

Todos os testes usam SQLite em memória via `dependency_overrides` (conftest).
"""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError

import models
import routes.agendamentos as agenda_routes
from migrations import migrate_agenda_tables
from security import create_access_token, hash_senha

URL_AGENDA = "/api/professionals/{professional_id}/agenda"
URL_AGENDAMENTOS = "/api/agendamentos"
URL_MEUS = "/api/agendamentos/meus"
URL_DISPONIBILIDADE = "/api/agendamentos/disponibilidade"

DURACAO_PADRAO = 60

# Relógio fixo usado nos cenários que dependem de "agora" (slots passados).
DIA_FIXO = date(2030, 3, 5)
AGORA_FIXO = datetime.combine(DIA_FIXO, time(10, 30))

SAMPLE_PROF = {
    "name": "Mário Encanador",
    "email": "mario.encanador@exemplo.com",
    "phone": "(11) 97777-6666",
    "bio": "Especialista em encanamentos e detecção de vazamentos residenciais.",
    "service_radius_km": 10.0,
    "specialties": ["Encanamento", "Hidráulica"],
    "city": "São Paulo",
    "state": "SP",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def cpf_valido(base: str) -> str:
    """Gera um CPF com dígitos verificadores corretos a partir de 9 dígitos base."""
    assert len(base) == 9 and base.isdigit()

    def digito(digitos: str) -> str:
        pesos = range(len(digitos) + 1, 1, -1)
        resto = (sum(int(d) * p for d, p in zip(digitos, pesos)) * 10) % 11
        return "0" if resto >= 10 else str(resto)

    primeiro = digito(base)
    return base + primeiro + digito(base + primeiro)


def criar_cliente(client: TestClient, db_session, email: str, base_cpf: str) -> models.Cliente:
    """Cria um cliente pelo endpoint público e confirma o e-mail direto no banco."""
    payload = {
        "nome": "Cliente da Agenda",
        "email": email,
        "cpf": cpf_valido(base_cpf),
        "data_nascimento": "1990-03-15",
        "senha": "SenhaForte@2026",
        "confirmar_senha": "SenhaForte@2026",
        "endereco": {
            "cep": "01001000",
            "logradouro": "Praça da Sé",
            "numero": "100",
            "complemento": "Apto 42",
            "bairro": "Sé",
            "cidade": "São Paulo",
            "estado": "SP",
        },
    }
    resposta = client.post("/api/clientes", json=payload)
    assert resposta.status_code == 201, resposta.text

    cliente = (
        db_session.query(models.Cliente)
        .filter(models.Cliente.email == email)
        .first()
    )
    assert cliente is not None
    cliente.email_verificado = True
    db_session.commit()
    db_session.refresh(cliente)
    return cliente


def criar_profissional(
    client: TestClient,
    db_session,
    email: str,
    *,
    aprovado: bool = True,
    ativo: bool = True,
) -> models.Professional:
    """Cria um profissional pelo endpoint público e ajusta aprovação/atividade."""
    payload = dict(SAMPLE_PROF)
    payload["email"] = email
    resposta = client.post("/api/professionals", json=payload)
    assert resposta.status_code == 201, resposta.text

    profissional = (
        db_session.query(models.Professional)
        .filter(models.Professional.email == email)
        .first()
    )
    assert profissional is not None
    profissional.approval_status = (
        models.ProfessionalApprovalStatus.APPROVED.value
        if aprovado
        else models.ProfessionalApprovalStatus.PENDING.value
    )
    profissional.is_active = ativo
    db_session.commit()
    db_session.refresh(profissional)
    return profissional


def criar_grade(db_session, professional_id: int, janelas) -> None:
    """
    Insere a grade semanal direto no banco.

    Cada janela é uma tupla `(dia_semana, "HH:MM", "HH:MM", duracao_min)`.
    """
    for dia_semana, inicio, fim, duracao in janelas:
        db_session.add(
            models.DisponibilidadeProfissional(
                professional_id=professional_id,
                dia_semana=dia_semana,
                hora_inicio=time.fromisoformat(inicio),
                hora_fim=time.fromisoformat(fim),
                duracao_slot_min=duracao,
            )
        )
    db_session.commit()


def criar_agendamento_direto(
    db_session,
    professional_id: int,
    cliente_id: int,
    inicio: datetime,
    *,
    duracao_min: int = DURACAO_PADRAO,
    status: str = models.AgendamentoStatus.AGENDADO.value,
) -> models.Agendamento:
    """Insere um agendamento direto no banco (para montar cenários de ocupação)."""
    agendamento = models.Agendamento(
        professional_id=professional_id,
        cliente_id=cliente_id,
        data_hora_inicio=inicio,
        data_hora_fim=inicio + timedelta(minutes=duracao_min),
        status=status,
    )
    db_session.add(agendamento)
    db_session.commit()
    db_session.refresh(agendamento)
    return agendamento


def cabecalho(email: str, role: str = models.UserRole.CLIENT.value) -> dict:
    """Cabeçalho Bearer para o e-mail/papel informado."""
    token = create_access_token(data={"sub": email, "role": role})
    return {"Authorization": f"Bearer {token}"}


def slots_do_dia(corpo: list, dia: date) -> list[datetime]:
    """Extrai os inícios de slot do dia a partir da resposta da agenda."""
    for entrada in corpo:
        if entrada["data"] == dia.isoformat():
            return [
                datetime.fromisoformat(slot["data_hora_inicio"])
                for slot in entrada["slots"]
            ]
    raise AssertionError(f"Dia {dia.isoformat()} ausente na resposta da agenda.")


def amanha() -> date:
    """Data de amanhã (UTC) — sempre no futuro para o validador de reserva."""
    return agenda_routes._utcnow().date() + timedelta(days=1)


@pytest.fixture
def congelar_agora(monkeypatch):
    """Fixa o relógio do módulo de agenda (`_utcnow`) em um instante controlado."""

    def _fixar(momento: datetime) -> None:
        monkeypatch.setattr(agenda_routes, "_utcnow", lambda: momento)

    return _fixar


# ---------------------------------------------------------------------------
# GET /api/professionals/{id}/agenda
# ---------------------------------------------------------------------------


class TestAgendaPublica:
    """Geração de slots, filtros de disponibilidade e validação da janela."""

    def test_agenda_e_publica_e_devolve_slots_livres(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.agenda@exemplo.com")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        assert resposta.status_code == 200, resposta.text
        corpo = resposta.json()
        assert len(corpo) == 1
        assert corpo[0]["data"] == dia.isoformat()

        slots = corpo[0]["slots"]
        assert [slot["data_hora_inicio"] for slot in slots] == [
            f"{dia.isoformat()}T08:00:00",
            f"{dia.isoformat()}T09:00:00",
            f"{dia.isoformat()}T10:00:00",
            f"{dia.isoformat()}T11:00:00",
        ]
        assert [slot["data_hora_fim"] for slot in slots] == [
            f"{dia.isoformat()}T09:00:00",
            f"{dia.isoformat()}T10:00:00",
            f"{dia.isoformat()}T11:00:00",
            f"{dia.isoformat()}T12:00:00",
        ]
        assert all(slot["disponivel"] is True for slot in slots)

    def test_profissional_inexistente_retorna_404(self, client: TestClient):
        resposta = client.get(URL_AGENDA.format(professional_id=9999))
        assert resposta.status_code == 404

    def test_profissional_inativo_retorna_404(self, client: TestClient, db_session):
        profissional = criar_profissional(
            client, db_session, "prof.inativo@exemplo.com", ativo=False
        )
        criar_grade(db_session, profissional.id, [(DIA_FIXO.weekday(), "08:00", "12:00", 60)])

        resposta = client.get(URL_AGENDA.format(professional_id=profissional.id))
        assert resposta.status_code == 404

    def test_profissional_nao_aprovado_retorna_404(self, client: TestClient, db_session):
        profissional = criar_profissional(
            client, db_session, "prof.pendente@exemplo.com", aprovado=False
        )
        criar_grade(db_session, profissional.id, [(DIA_FIXO.weekday(), "08:00", "12:00", 60)])

        resposta = client.get(URL_AGENDA.format(professional_id=profissional.id))
        assert resposta.status_code == 404

    def test_janela_invertida_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.janela@exemplo.com")
        dia = amanha()

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={
                "data_inicio": (dia + timedelta(days=2)).isoformat(),
                "data_fim": dia.isoformat(),
            },
        )
        assert resposta.status_code == 422

    def test_janela_de_60_dias_e_aceita_e_61_nao(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.limite@exemplo.com")
        dia = amanha()

        aceita = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={
                "data_inicio": dia.isoformat(),
                "data_fim": (dia + timedelta(days=59)).isoformat(),
            },
        )
        assert aceita.status_code == 200
        assert len(aceita.json()) == 60

        recusada = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={
                "data_inicio": dia.isoformat(),
                "data_fim": (dia + timedelta(days=60)).isoformat(),
            },
        )
        assert recusada.status_code == 422

    def test_dias_sem_grade_aparecem_com_lista_vazia(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.vazio@exemplo.com")
        dia_com_grade = amanha()
        criar_grade(
            db_session,
            profissional.id,
            [(dia_com_grade.weekday(), "08:00", "10:00", 60)],
        )

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={
                "data_inicio": dia_com_grade.isoformat(),
                "data_fim": (dia_com_grade + timedelta(days=1)).isoformat(),
            },
        )

        assert resposta.status_code == 200
        corpo = resposta.json()
        assert len(corpo) == 2
        assert len(slots_do_dia(corpo, dia_com_grade)) == 2
        assert slots_do_dia(corpo, dia_com_grade + timedelta(days=1)) == []

    def test_profissional_sem_grade_devolve_agenda_vazia(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.sem.grade@exemplo.com")
        dia = amanha()

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        assert resposta.status_code == 200
        assert resposta.json()[0]["slots"] == []

    def test_slot_com_duracao_de_30_minutos_gera_oito_slots(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.30min@exemplo.com")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 30)])

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        slots = resposta.json()[0]["slots"]
        assert len(slots) == 8
        assert slots[0]["data_hora_inicio"] == f"{dia.isoformat()}T08:00:00"
        assert slots[0]["data_hora_fim"] == f"{dia.isoformat()}T08:30:00"
        assert slots[-1]["data_hora_inicio"] == f"{dia.isoformat()}T11:30:00"

    def test_slot_incompleto_no_fim_da_janela_e_descartado(self, client: TestClient, db_session):
        """Janela de 90 minutos com slots de 60 gera apenas um slot completo."""
        profissional = criar_profissional(client, db_session, "prof.incompleto@exemplo.com")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "09:30", 60)])

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        slots = resposta.json()[0]["slots"]
        assert [slot["data_hora_inicio"] for slot in slots] == [f"{dia.isoformat()}T08:00:00"]
        assert [slot["data_hora_fim"] for slot in slots] == [f"{dia.isoformat()}T09:00:00"]

    def test_dois_periodos_no_mesmo_dia_sao_concatenados_e_ordenados(
        self, client: TestClient, db_session
    ):
        profissional = criar_profissional(client, db_session, "prof.periodos@exemplo.com")
        dia = amanha()
        criar_grade(
            db_session,
            profissional.id,
            [
                (dia.weekday(), "08:00", "10:00", 60),
                (dia.weekday(), "14:00", "16:00", 60),
            ],
        )

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        inicios = [slot["data_hora_inicio"] for slot in resposta.json()[0]["slots"]]
        assert inicios == [
            f"{dia.isoformat()}T08:00:00",
            f"{dia.isoformat()}T09:00:00",
            f"{dia.isoformat()}T14:00:00",
            f"{dia.isoformat()}T15:00:00",
        ]

    def test_slot_reservado_nao_aparece_na_agenda(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.ocupado@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.ocupado@exemplo.com", "123456789")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])
        criar_agendamento_direto(
            db_session, profissional.id, cliente.id, datetime.combine(dia, time(9, 0))
        )

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        inicios = [slot["data_hora_inicio"] for slot in resposta.json()[0]["slots"]]
        assert inicios == [
            f"{dia.isoformat()}T08:00:00",
            f"{dia.isoformat()}T10:00:00",
            f"{dia.isoformat()}T11:00:00",
        ]

    def test_agendamento_cancelado_nao_bloqueia_o_slot(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.cancelado@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.cancelado@exemplo.com", "987654321")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])
        criar_agendamento_direto(
            db_session,
            profissional.id,
            cliente.id,
            datetime.combine(dia, time(9, 0)),
            status=models.AgendamentoStatus.CANCELADO.value,
        )

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        assert len(resposta.json()[0]["slots"]) == 4

    def test_horarios_passados_sao_omitidos(
        self, client: TestClient, db_session, congelar_agora
    ):
        profissional = criar_profissional(client, db_session, "prof.passado@exemplo.com")
        criar_grade(db_session, profissional.id, [(DIA_FIXO.weekday(), "08:00", "12:00", 60)])
        congelar_agora(AGORA_FIXO)

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": DIA_FIXO.isoformat(), "data_fim": DIA_FIXO.isoformat()},
        )

        assert resposta.status_code == 200
        inicios = [slot["data_hora_inicio"] for slot in resposta.json()[0]["slots"]]
        assert inicios == [f"{DIA_FIXO.isoformat()}T11:00:00"]

    def test_data_invalida_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.data@exemplo.com")

        resposta = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": "31/12/2030", "data_fim": "2030-12-31"},
        )
        assert resposta.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/agendamentos
# ---------------------------------------------------------------------------


class TestReservarSlot:
    """Reserva de slot pelo cliente autenticado."""

    def test_reserva_com_sucesso_retorna_201_e_persiste(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.reserva@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.reserva@exemplo.com", "123456789")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        corpo = resposta.json()
        assert corpo["professional_id"] == profissional.id
        assert corpo["cliente_id"] == cliente.id
        assert corpo["data_hora_inicio"] == f"{dia.isoformat()}T09:00:00"
        assert corpo["data_hora_fim"] == f"{dia.isoformat()}T10:00:00"
        assert corpo["status"] == models.AgendamentoStatus.AGENDADO.value
        assert corpo["orcamento_id"] is None
        assert corpo["criado_em"]

        persistido = db_session.get(models.Agendamento, corpo["id"])
        assert persistido is not None
        assert persistido.cliente_id == cliente.id
        assert persistido.data_hora_fim == datetime.combine(dia, time(10, 0))

    def test_sem_token_retorna_401(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.401@exemplo.com")
        dia = amanha()

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
        )
        assert resposta.status_code == 401

    def test_profissional_autenticado_retorna_403(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.403@exemplo.com")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value),
        )
        assert resposta.status_code == 403

    def test_administrador_retorna_403(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.admin@exemplo.com")
        admin = models.User(
            name="Administrador",
            email="admin.agenda@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()
        dia = amanha()

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(admin.email, models.UserRole.ADMIN.value),
        )
        assert resposta.status_code == 403

    def test_cliente_sem_cadastro_de_cliente_retorna_404(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.sem.cliente@exemplo.com")
        usuario = models.User(
            name="Cliente Incompleto",
            email="cliente.sem.cadastro@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(usuario)
        db_session.commit()
        dia = amanha()

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(usuario.email),
        )
        assert resposta.status_code == 404
        assert "cliente" in resposta.json()["detail"].lower()

    def test_double_booking_retorna_409(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.conflito@exemplo.com")
        cliente_a = criar_cliente(client, db_session, "cliente.a@exemplo.com", "111444777")
        cliente_b = criar_cliente(client, db_session, "cliente.b@exemplo.com", "222555888")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])
        payload = {
            "professional_id": profissional.id,
            "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
        }

        primeira = client.post(
            URL_AGENDAMENTOS, json=payload, headers=cabecalho(cliente_a.email)
        )
        segunda = client.post(
            URL_AGENDAMENTOS, json=payload, headers=cabecalho(cliente_b.email)
        )

        assert primeira.status_code == 201, primeira.text
        assert segunda.status_code == 409, segunda.text
        assert db_session.query(models.Agendamento).count() == 1

    def test_corrida_entre_requisicoes_e_barrada_pelo_indice_unico(
        self, client: TestClient, db_session, monkeypatch
    ):
        """
        Simula a corrida: a consulta de ocupação não vê a reserva concorrente e a
        segunda gravação precisa ser barrada pelo índice único parcial.
        """
        profissional = criar_profissional(client, db_session, "prof.corrida@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.corrida@exemplo.com", "333666999")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])
        payload = {
            "professional_id": profissional.id,
            "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
        }

        # Primeira reserva entra normalmente.
        primeira = client.post(
            URL_AGENDAMENTOS, json=payload, headers=cabecalho(cliente.email)
        )
        assert primeira.status_code == 201, primeira.text

        # Segunda requisição "não enxerga" a reserva já gravada (janela da corrida).
        monkeypatch.setattr(agenda_routes, "_slot_indisponivel", lambda *args, **kwargs: False)
        segunda = client.post(
            URL_AGENDAMENTOS, json=payload, headers=cabecalho(cliente.email)
        )

        assert segunda.status_code == 409, segunda.text
        assert db_session.query(models.Agendamento).count() == 1

    def test_horario_no_passado_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.passado.post@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.passado@exemplo.com", "444777111")
        criar_grade(db_session, profissional.id, [(6, "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": "2020-01-05T09:00:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422

    def test_horario_fora_da_grade_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.fora@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.fora@exemplo.com", "555888222")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T07:00:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422
        assert "agenda" in resposta.json()["detail"].lower()

    def test_horario_desalinhado_da_grade_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.desalinhado@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.desalinhado@exemplo.com", "666999333")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T08:30:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422

    def test_dia_sem_grade_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.semdia@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.semdia@exemplo.com", "777111444")
        dia = amanha()
        # Grade apenas no dia seguinte ao consultado.
        criar_grade(db_session, profissional.id, [((dia.weekday() + 1) % 7, "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422

    def test_slot_incompleto_no_fim_da_janela_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.incompleto.post@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.incompleto@exemplo.com", "888222555")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "09:30", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422

    def test_ultimo_slot_da_grade_e_aceito(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.ultimo@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.ultimo@exemplo.com", "999333666")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T11:00:00",
            },
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["data_hora_fim"] == f"{dia.isoformat()}T12:00:00"

    def test_datetime_com_fuso_e_convertido_para_utc(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.fuso@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.fuso@exemplo.com", "101010101")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        # 06:00 em UTC-3 == 09:00 UTC, um slot válido da grade.
        inicio_local = datetime.combine(dia, time(6, 0)).replace(
            tzinfo=timezone(timedelta(hours=-3))
        )

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": inicio_local.isoformat(),
            },
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["data_hora_inicio"] == f"{dia.isoformat()}T09:00:00"

    def test_profissional_inexistente_retorna_404(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.404@exemplo.com", "121212121")
        dia = amanha()

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": 9999,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 404

    def test_profissional_nao_aprovado_retorna_404(self, client: TestClient, db_session):
        profissional = criar_profissional(
            client, db_session, "prof.pendente.post@exemplo.com", aprovado=False
        )
        cliente = criar_cliente(client, db_session, "cliente.pendente@exemplo.com", "131313131")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 404

    def test_profissional_inativo_retorna_404(self, client: TestClient, db_session):
        profissional = criar_profissional(
            client, db_session, "prof.inativo.post@exemplo.com", ativo=False
        )
        cliente = criar_cliente(client, db_session, "cliente.inativo@exemplo.com", "141414141")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 404

    def test_payload_invalido_retorna_422(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.payload@exemplo.com", "151515151")
        cab = cabecalho(cliente.email)

        sem_profissional = client.post(
            URL_AGENDAMENTOS,
            json={"data_hora_inicio": "2030-03-05T09:00:00"},
            headers=cab,
        )
        orcamento_invalido = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": 1,
                "data_hora_inicio": "2030-03-05T09:00:00",
                "orcamento_id": 0,
            },
            headers=cab,
        )

        assert sem_profissional.status_code == 422
        assert orcamento_invalido.status_code == 422

    def test_orcamento_inexistente_retorna_404(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.orc404@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.orc404@exemplo.com", "161616161")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
                "orcamento_id": 424242,
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 404

    def test_orcamento_de_outro_cliente_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.orc@exemplo.com")
        cliente_a = criar_cliente(client, db_session, "cliente.orc.a@exemplo.com", "171717171")
        cliente_b = criar_cliente(client, db_session, "cliente.orc.b@exemplo.com", "181818181")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        orcamento = models.Orcamento(
            cliente_id=cliente_a.id,
            cliente_nome=cliente_a.nome,
            cliente_email=cliente_a.email,
            professional_id=profissional.id,
            descricao="Vazamento no banheiro, preciso de avaliação.",
        )
        db_session.add(orcamento)
        db_session.commit()
        db_session.refresh(orcamento)

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
                "orcamento_id": orcamento.id,
            },
            headers=cabecalho(cliente_b.email),
        )
        assert resposta.status_code == 422

    def test_orcamento_do_proprio_cliente_e_vinculado(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.orcok@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.orcok@exemplo.com", "191919191")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        orcamento = models.Orcamento(
            cliente_id=cliente.id,
            cliente_nome=cliente.nome,
            cliente_email=cliente.email,
            professional_id=profissional.id,
            descricao="Instalação de chuveiro novo na suíte.",
        )
        db_session.add(orcamento)
        db_session.commit()
        db_session.refresh(orcamento)

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
                "orcamento_id": orcamento.id,
            },
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["orcamento_id"] == orcamento.id

    def test_autor_e_derivado_do_token_e_ignora_payload(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.autoria@exemplo.com")
        cliente_a = criar_cliente(client, db_session, "cliente.aut.a@exemplo.com", "212121212")
        cliente_b = criar_cliente(client, db_session, "cliente.aut.b@exemplo.com", "232323232")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])

        resposta = client.post(
            URL_AGENDAMENTOS,
            json={
                "professional_id": profissional.id,
                "data_hora_inicio": f"{dia.isoformat()}T09:00:00",
                "cliente_id": cliente_b.id,
            },
            headers=cabecalho(cliente_a.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["cliente_id"] == cliente_a.id


# ---------------------------------------------------------------------------
# GET /api/agendamentos/meus
# ---------------------------------------------------------------------------


class TestMeusAgendamentos:
    """Leitura escopada dos agendamentos do cliente autenticado."""

    def _preparar(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.meus@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.meus@exemplo.com", "123456789")
        dia = amanha()
        criar_grade(db_session, profissional.id, [(dia.weekday(), "08:00", "12:00", 60)])
        return profissional, cliente, dia

    def test_sem_token_retorna_401(self, client: TestClient):
        assert client.get(URL_MEUS).status_code == 401

    def test_profissional_autenticado_retorna_403(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.meus.403@exemplo.com")

        resposta = client.get(
            URL_MEUS,
            headers=cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value),
        )
        assert resposta.status_code == 403

    def test_lista_vazia_sem_agendamentos(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.vazio@exemplo.com", "123456789")

        resposta = client.get(URL_MEUS, headers=cabecalho(cliente.email))

        assert resposta.status_code == 200
        assert resposta.json() == []

    def test_ordenacao_e_filtro_por_status(self, client: TestClient, db_session):
        profissional, cliente, dia = self._preparar(client, db_session)
        criar_agendamento_direto(
            db_session, profissional.id, cliente.id, datetime.combine(dia, time(11, 0))
        )
        criar_agendamento_direto(
            db_session, profissional.id, cliente.id, datetime.combine(dia, time(9, 0))
        )
        criar_agendamento_direto(
            db_session,
            profissional.id,
            cliente.id,
            datetime.combine(dia, time(8, 0)),
            status=models.AgendamentoStatus.CANCELADO.value,
        )
        cab = cabecalho(cliente.email)

        todos = client.get(URL_MEUS, headers=cab)
        assert todos.status_code == 200
        inicios = [item["data_hora_inicio"] for item in todos.json()]
        assert inicios == [
            f"{dia.isoformat()}T08:00:00",
            f"{dia.isoformat()}T09:00:00",
            f"{dia.isoformat()}T11:00:00",
        ]

        cancelados = client.get(URL_MEUS, params={"status": "cancelado"}, headers=cab)
        assert cancelados.status_code == 200
        assert [item["status"] for item in cancelados.json()] == ["cancelado"]

        agendados = client.get(URL_MEUS, params={"status": "AGENDADO"}, headers=cab)
        assert agendados.status_code == 200
        assert len(agendados.json()) == 2

    def test_status_invalido_retorna_422(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.status@exemplo.com", "123456789")

        resposta = client.get(
            URL_MEUS, params={"status": "remarcado"}, headers=cabecalho(cliente.email)
        )

        assert resposta.status_code == 422
        assert "status" in resposta.json()["detail"].lower()

    def test_nao_expoe_agendamentos_de_outros_clientes(self, client: TestClient, db_session):
        profissional, cliente_a, dia = self._preparar(client, db_session)
        cliente_b = criar_cliente(client, db_session, "cliente.meus.b@exemplo.com", "987654321")
        criar_agendamento_direto(
            db_session, profissional.id, cliente_b.id, datetime.combine(dia, time(9, 0))
        )

        resposta = client.get(URL_MEUS, headers=cabecalho(cliente_a.email))

        assert resposta.status_code == 200
        assert resposta.json() == []

    def test_paginacao(self, client: TestClient, db_session):
        profissional, cliente, dia = self._preparar(client, db_session)
        for hora in (8, 9, 10, 11):
            criar_agendamento_direto(
                db_session, profissional.id, cliente.id, datetime.combine(dia, time(hora, 0))
            )
        cab = cabecalho(cliente.email)

        primeira_pagina = client.get(URL_MEUS, params={"limit": 2}, headers=cab)
        segunda_pagina = client.get(URL_MEUS, params={"limit": 2, "skip": 2}, headers=cab)

        assert len(primeira_pagina.json()) == 2
        assert primeira_pagina.json()[0]["data_hora_inicio"] == f"{dia.isoformat()}T08:00:00"
        assert segunda_pagina.json()[0]["data_hora_inicio"] == f"{dia.isoformat()}T10:00:00"


# ---------------------------------------------------------------------------
# PUT/GET /api/agendamentos/disponibilidade
# ---------------------------------------------------------------------------


class TestMinhaDisponibilidade:
    """Grade semanal do profissional autenticado."""

    def test_sem_token_retorna_401(self, client: TestClient):
        assert client.get(URL_DISPONIBILIDADE).status_code == 401
        assert client.put(URL_DISPONIBILIDADE, json=[]).status_code == 401

    def test_cliente_autenticado_retorna_403(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.grade@exemplo.com", "123456789")
        cab = cabecalho(cliente.email)

        assert client.get(URL_DISPONIBILIDADE, headers=cab).status_code == 403
        assert (
            client.put(URL_DISPONIBILIDADE, json=[], headers=cab).status_code == 403
        )

    def test_define_e_le_a_grade_semanal(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.grade@exemplo.com")
        cab = cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value)

        resposta = client.put(
            URL_DISPONIBILIDADE,
            json=[
                {"dia_semana": 0, "hora_inicio": "08:00", "hora_fim": "12:00", "duracao_slot_min": 60},
                {"dia_semana": 2, "hora_inicio": "14:00", "hora_fim": "18:00", "duracao_slot_min": 30},
            ],
            headers=cab,
        )

        assert resposta.status_code == 200, resposta.text
        corpo = resposta.json()
        assert [item["dia_semana"] for item in corpo] == [0, 2]
        assert all(item["professional_id"] == profissional.id for item in corpo)
        assert corpo[0]["hora_inicio"] == "08:00:00"
        assert corpo[0]["hora_fim"] == "12:00:00"
        assert corpo[0]["duracao_slot_min"] == 60
        assert corpo[1]["duracao_slot_min"] == 30

        leitura = client.get(URL_DISPONIBILIDADE, headers=cab)
        assert leitura.status_code == 200
        assert leitura.json() == corpo

    def test_put_substitui_a_grade_anterior(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.substitui@exemplo.com")
        cab = cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value)

        client.put(
            URL_DISPONIBILIDADE,
            json=[
                {"dia_semana": 1, "hora_inicio": "08:00", "hora_fim": "12:00", "duracao_slot_min": 60},
                {"dia_semana": 3, "hora_inicio": "08:00", "hora_fim": "12:00", "duracao_slot_min": 60},
            ],
            headers=cab,
        )
        resposta = client.put(
            URL_DISPONIBILIDADE,
            json=[
                {"dia_semana": 5, "hora_inicio": "09:00", "hora_fim": "11:00", "duracao_slot_min": 30}
            ],
            headers=cab,
        )

        assert resposta.status_code == 200
        assert [(item["dia_semana"], item["hora_inicio"]) for item in resposta.json()] == [
            (5, "09:00:00")
        ]
        assert (
            db_session.query(models.DisponibilidadeProfissional)
            .filter(models.DisponibilidadeProfissional.professional_id == profissional.id)
            .count()
            == 1
        )

    def test_lista_vazia_fecha_a_agenda(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.fecha@exemplo.com")
        cab = cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value)
        criar_grade(db_session, profissional.id, [(0, "08:00", "12:00", 60)])

        resposta = client.put(URL_DISPONIBILIDADE, json=[], headers=cab)

        assert resposta.status_code == 200
        assert resposta.json() == []
        assert client.get(URL_DISPONIBILIDADE, headers=cab).json() == []

    def test_janelas_sobrepostas_retornam_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.sobreposta@exemplo.com")
        cab = cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value)

        resposta = client.put(
            URL_DISPONIBILIDADE,
            json=[
                {"dia_semana": 1, "hora_inicio": "08:00", "hora_fim": "12:00", "duracao_slot_min": 60},
                {"dia_semana": 1, "hora_inicio": "11:00", "hora_fim": "15:00", "duracao_slot_min": 60},
            ],
            headers=cab,
        )

        assert resposta.status_code == 422
        assert "sobrep" in resposta.json()["detail"].lower()

    def test_janela_invalida_retorna_422(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.invalida@exemplo.com")
        cab = cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value)

        fim_antes_do_inicio = client.put(
            URL_DISPONIBILIDADE,
            json=[
                {"dia_semana": 1, "hora_inicio": "12:00", "hora_fim": "08:00", "duracao_slot_min": 60}
            ],
            headers=cab,
        )
        duracao_maior_que_janela = client.put(
            URL_DISPONIBILIDADE,
            json=[
                {"dia_semana": 1, "hora_inicio": "08:00", "hora_fim": "08:20", "duracao_slot_min": 60}
            ],
            headers=cab,
        )
        dia_invalido = client.put(
            URL_DISPONIBILIDADE,
            json=[
                {"dia_semana": 7, "hora_inicio": "08:00", "hora_fim": "12:00", "duracao_slot_min": 60}
            ],
            headers=cab,
        )

        assert fim_antes_do_inicio.status_code == 422
        assert duracao_maior_que_janela.status_code == 422
        assert dia_invalido.status_code == 422

    def test_limite_de_janelas_por_grade(self, client: TestClient, db_session):
        profissional = criar_profissional(client, db_session, "prof.limite.grade@exemplo.com")
        cab = cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value)
        base = datetime(2030, 1, 7, 8, 0)
        janelas = [
            {
                "dia_semana": 0,
                "hora_inicio": (base + timedelta(minutes=5 * i)).time().isoformat(),
                "hora_fim": (base + timedelta(minutes=5 * (i + 1))).time().isoformat(),
                "duracao_slot_min": 5,
            }
            for i in range(51)
        ]

        resposta = client.put(URL_DISPONIBILIDADE, json=janelas, headers=cab)

        assert resposta.status_code == 422
        assert "50" in resposta.json()["detail"]

    def test_grade_do_profissional_alimenta_a_agenda_publica(
        self, client: TestClient, db_session
    ):
        """Fecha o fluxo: o profissional define a grade e o cliente vê os slots."""
        profissional = criar_profissional(client, db_session, "prof.fluxo@exemplo.com")
        dia = amanha()
        cab = cabecalho(profissional.email, models.UserRole.PROFESSIONAL.value)

        client.put(
            URL_DISPONIBILIDADE,
            json=[
                {
                    "dia_semana": dia.weekday(),
                    "hora_inicio": "08:00",
                    "hora_fim": "10:00",
                    "duracao_slot_min": 60,
                }
            ],
            headers=cab,
        )

        agenda = client.get(
            URL_AGENDA.format(professional_id=profissional.id),
            params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        )

        assert agenda.status_code == 200
        assert [slot["data_hora_inicio"] for slot in agenda.json()[0]["slots"]] == [
            f"{dia.isoformat()}T08:00:00",
            f"{dia.isoformat()}T09:00:00",
        ]


# ---------------------------------------------------------------------------
# Persistência: índice único parcial e migração idempotente
# ---------------------------------------------------------------------------


class TestPersistenciaAgenda:
    """Garantias de banco da agenda (issue #78)."""

    def test_indice_unico_impede_double_booking_mas_libera_slot_cancelado(
        self, client: TestClient, db_session
    ):
        profissional = criar_profissional(client, db_session, "prof.indice@exemplo.com")
        cliente = criar_cliente(client, db_session, "cliente.indice@exemplo.com", "123456789")
        dia = amanha()
        inicio = datetime.combine(dia, time(9, 0))

        primeiro = criar_agendamento_direto(db_session, profissional.id, cliente.id, inicio)

        db_session.add(
            models.Agendamento(
                professional_id=profissional.id,
                cliente_id=cliente.id,
                data_hora_inicio=inicio,
                data_hora_fim=inicio + timedelta(minutes=60),
                status=models.AgendamentoStatus.AGENDADO.value,
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

        # Cancelar o agendamento libera o slot: o índice único é parcial.
        primeiro.status = models.AgendamentoStatus.CANCELADO.value
        db_session.commit()

        db_session.add(
            models.Agendamento(
                professional_id=profissional.id,
                cliente_id=cliente.id,
                data_hora_inicio=inicio,
                data_hora_fim=inicio + timedelta(minutes=60),
                status=models.AgendamentoStatus.AGENDADO.value,
            )
        )
        db_session.commit()

        assert (
            db_session.query(models.Agendamento)
            .filter(
                models.Agendamento.professional_id == profissional.id,
                models.Agendamento.data_hora_inicio == inicio,
            )
            .count()
            == 2
        )

    def test_migrate_agenda_tables_cria_tabelas_e_e_idempotente(self):
        engine = create_engine("sqlite:///:memory:")

        migrate_agenda_tables(engine)
        inspector = inspect(engine)
        assert inspector.has_table("disponibilidade_profissional")
        assert inspector.has_table("agendamentos")

        # Rodar novamente não deve levantar (checkfirst).
        migrate_agenda_tables(engine)
        assert inspect(engine).has_table("agendamentos")
