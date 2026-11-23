"""
Testes automatizados para bloqueio de dias e horários específicos na agenda
do profissional (issue #16).

Cobrem:
- `GET /api/agendamentos/bloqueios` (listagem, filtros de data e passados)
- `POST /api/agendamentos/bloqueios` (dia inteiro, faixa de horários, validações 422/409, fuso UTC)
- `DELETE /api/agendamentos/bloqueios/{id}` (remoção e isolamento entre profissionais)
- Integração com `GET /api/professionals/{id}/agenda` (slots bloqueados omitidos)
- Integração com `POST /api/agendamentos` (reserva em horário bloqueado retorna 409)
- Migração idempotente `migrate_agenda_tables` criando `bloqueios_agenda_profissional`
"""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

import models
from migrations import migrate_agenda_tables
from security import create_access_token, hash_senha

URL_BLOQUEIOS = "/api/agendamentos/bloqueios"
URL_BLOQUEIO_ITEM = "/api/agendamentos/bloqueios/{bloqueio_id}"
URL_AGENDA = "/api/professionals/{professional_id}/agenda"
URL_AGENDAMENTOS = "/api/agendamentos"
URL_DISPONIBILIDADE = "/api/agendamentos/disponibilidade"

DIA_FUTURO = date(2031, 5, 12)  # Segunda-feira (weekday == 0)
OUTRO_DIA_FUTURO = date(2031, 5, 19)  # Segunda-feira seguinte


def _cpf_valido(base: str) -> str:
    def digito(digitos: str) -> str:
        pesos = range(len(digitos) + 1, 1, -1)
        resto = (sum(int(d) * p for d, p in zip(digitos, pesos)) * 10) % 11
        return "0" if resto >= 10 else str(resto)

    primeiro = digito(base)
    return base + primeiro + digito(base + primeiro)


def _criar_profissional_com_token(
    client: TestClient,
    db_session,
    email: str,
    nome: str = "Profissional Agenda",
) -> tuple[models.Professional, dict[str, str]]:
    payload = {
        "name": nome,
        "email": email,
        "phone": "(11) 98888-7777",
        "bio": "Profissional especializado em manutenção residencial geral e reparos.",
        "service_radius_km": 15.0,
        "specialties": ["Elétrica", "Reparos Gerais"],
        "city": "São Paulo",
        "state": "SP",
    }
    resp = client.post("/api/professionals", json=payload)
    assert resp.status_code == 201, resp.text

    prof = db_session.query(models.Professional).filter(models.Professional.email == email).first()
    assert prof is not None
    prof.approval_status = models.ProfessionalApprovalStatus.APPROVED.value
    prof.is_active = True

    user = models.User(
        name=nome,
        email=email,
        hashed_password=hash_senha("SenhaForte@2026"),
        role=models.UserRole.PROFESSIONAL.value,
        is_active=True,
        email_verificado=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(prof)

    token = create_access_token(
        data={"sub": email, "role": models.UserRole.PROFESSIONAL.value, "tipo": "profissional"}
    )
    return prof, {"Authorization": f"Bearer {token}"}


def _criar_cliente_com_token(
    client: TestClient,
    db_session,
    email: str,
    base_cpf: str,
) -> tuple[models.Cliente, dict[str, str]]:
    payload = {
        "nome": "Cliente Teste Bloqueio",
        "email": email,
        "cpf": _cpf_valido(base_cpf),
        "data_nascimento": "1992-07-10",
        "senha": "SenhaForte@2026",
        "confirmar_senha": "SenhaForte@2026",
        "endereco": {
            "cep": "01001000",
            "logradouro": "Praça da Sé",
            "numero": "10",
            "bairro": "Sé",
            "cidade": "São Paulo",
            "estado": "SP",
        },
    }
    resp = client.post("/api/clientes", json=payload)
    assert resp.status_code == 201, resp.text

    cliente = db_session.query(models.Cliente).filter(models.Cliente.email == email).first()
    assert cliente is not None
    cliente.email_verificado = True
    db_session.commit()
    db_session.refresh(cliente)

    token = create_access_token(
        data={"sub": email, "role": models.UserRole.CLIENT.value, "tipo": "cliente"}
    )
    return cliente, {"Authorization": f"Bearer {token}"}


def _configurar_grade_segunda(client: TestClient, headers: dict[str, str]) -> None:
    resp = client.put(
        URL_DISPONIBILIDADE,
        headers=headers,
        json=[
            {
                "dia_semana": 0,  # Segunda-feira
                "hora_inicio": "08:00",
                "hora_fim": "13:00",
                "duracao_slot_min": 60,
            }
        ],
    )
    assert resp.status_code == 200, resp.text


class TestBloqueiosAgendaAutorizacaoEValidacao:
    def test_requer_autenticacao_e_papel_profissional(self, client: TestClient, db_session):
        _, cli_headers = _criar_cliente_com_token(client, db_session, "cli.auth@teste.com", "444555666")

        assert client.get(URL_BLOQUEIOS).status_code == 401
        assert client.post(URL_BLOQUEIOS, json={}).status_code == 401
        assert client.delete(URL_BLOQUEIO_ITEM.format(bloqueio_id=1)).status_code == 401

        assert client.get(URL_BLOQUEIOS, headers=cli_headers).status_code == 403
        assert (
            client.post(
                URL_BLOQUEIOS,
                headers=cli_headers,
                json={
                    "data_hora_inicio": f"{DIA_FUTURO}T09:00:00",
                    "data_hora_fim": f"{DIA_FUTURO}T12:00:00",
                },
            ).status_code
            == 403
        )
        assert client.delete(URL_BLOQUEIO_ITEM.format(bloqueio_id=1), headers=cli_headers).status_code == 403

    def test_validacao_intervalo_invalido_e_passado(self, client: TestClient, db_session):
        _, prof_headers = _criar_profissional_com_token(client, db_session, "prof.val@teste.com")

        # fim == inicio -> 422
        resp_igual = client.post(
            URL_BLOQUEIOS,
            headers=prof_headers,
            json={
                "data_hora_inicio": f"{DIA_FUTURO}T10:00:00",
                "data_hora_fim": f"{DIA_FUTURO}T10:00:00",
            },
        )
        assert resp_igual.status_code == 422

        # fim < inicio -> 422
        resp_inv = client.post(
            URL_BLOQUEIOS,
            headers=prof_headers,
            json={
                "data_hora_inicio": f"{DIA_FUTURO}T14:00:00",
                "data_hora_fim": f"{DIA_FUTURO}T10:00:00",
            },
        )
        assert resp_inv.status_code == 422

        # Totalmente no passado -> 422
        resp_passado = client.post(
            URL_BLOQUEIOS,
            headers=prof_headers,
            json={
                "data_hora_inicio": "2020-01-10T08:00:00",
                "data_hora_fim": "2020-01-10T12:00:00",
                "motivo": "Passado",
            },
        )
        assert resp_passado.status_code == 422
        assert "passado" in resp_passado.json()["detail"].lower()

        # Filtro de datas invertido na listagem -> 422
        resp_filtro_inv = client.get(
            URL_BLOQUEIOS,
            headers=prof_headers,
            params={"data_inicio": "2031-05-20", "data_fim": "2031-05-10"},
        )
        assert resp_filtro_inv.status_code == 422

    def test_crud_bloqueios_sobreposicao_e_isolamento(self, client: TestClient, db_session):
        prof_a, headers_a = _criar_profissional_com_token(client, db_session, "prof.a.bloq@teste.com", "Prof A")
        _, headers_b = _criar_profissional_com_token(client, db_session, "prof.b.bloq@teste.com", "Prof B")

        # Banco inicialmente vazio
        resp_vazio = client.get(URL_BLOQUEIOS, headers=headers_a)
        assert resp_vazio.status_code == 200
        assert resp_vazio.json() == []

        # Criação com fuso horário (-03:00) normalizado para UTC naive
        resp_create = client.post(
            URL_BLOQUEIOS,
            headers=headers_a,
            json={
                "data_hora_inicio": f"{DIA_FUTURO}T07:00:00-03:00",  # 10:00 UTC
                "data_hora_fim": f"{DIA_FUTURO}T09:00:00-03:00",     # 12:00 UTC
                "motivo": "  Consulta médica  ",
            },
        )
        assert resp_create.status_code == 201, resp_create.text
        criado = resp_create.json()
        assert criado["professional_id"] == prof_a.id
        assert criado["data_hora_inicio"] == f"{DIA_FUTURO}T10:00:00"
        assert criado["data_hora_fim"] == f"{DIA_FUTURO}T12:00:00"
        assert criado["motivo"] == "Consulta médica"

        # Sobreposição parcial para o mesmo profissional -> 409
        resp_overlap = client.post(
            URL_BLOQUEIOS,
            headers=headers_a,
            json={
                "data_hora_inicio": f"{DIA_FUTURO}T11:00:00",
                "data_hora_fim": f"{DIA_FUTURO}T13:00:00",
            },
        )
        assert resp_overlap.status_code == 409

        # Janela encostada (não sobrepõe: 12:00-14:00) -> 201
        resp_adj = client.post(
            URL_BLOQUEIOS,
            headers=headers_a,
            json={
                "data_hora_inicio": f"{DIA_FUTURO}T12:00:00",
                "data_hora_fim": f"{DIA_FUTURO}T14:00:00",
                "motivo": "   ",
            },
        )
        assert resp_adj.status_code == 201
        assert resp_adj.json()["motivo"] is None

        # Isolamento: Prof B não vê nem consegue remover bloqueio de Prof A
        assert client.get(URL_BLOQUEIOS, headers=headers_b).json() == []
        resp_del_outro = client.delete(
            URL_BLOQUEIO_ITEM.format(bloqueio_id=criado["id"]),
            headers=headers_b,
        )
        assert resp_del_outro.status_code == 404

        # Prof A lista os 2 bloqueios ordenados
        lista_a = client.get(URL_BLOQUEIOS, headers=headers_a).json()
        assert [item["id"] for item in lista_a] == [criado["id"], resp_adj.json()["id"]]

        # Remoção pelo dono -> 204 e 404 em nova tentativa
        resp_del = client.delete(URL_BLOQUEIO_ITEM.format(bloqueio_id=criado["id"]), headers=headers_a)
        assert resp_del.status_code == 204
        resp_del_again = client.delete(URL_BLOQUEIO_ITEM.format(bloqueio_id=criado["id"]), headers=headers_a)
        assert resp_del_again.status_code == 404

    def test_incluir_passados_controla_visibilidade_de_bloqueios_expirados(self, client: TestClient, db_session):
        prof, headers = _criar_profissional_com_token(client, db_session, "prof.hist@teste.com")

        passado = models.BloqueioAgendaProfissional(
            professional_id=prof.id,
            data_hora_inicio=datetime(2021, 1, 10, 8, 0),
            data_hora_fim=datetime(2021, 1, 10, 18, 0),
            motivo="Feriado antigo",
        )
        futuro = models.BloqueioAgendaProfissional(
            professional_id=prof.id,
            data_hora_inicio=datetime.combine(DIA_FUTURO, time(8, 0)),
            data_hora_fim=datetime.combine(DIA_FUTURO, time(12, 0)),
            motivo="Folga futura",
        )
        db_session.add_all([passado, futuro])
        db_session.commit()

        apenas_ativos = client.get(URL_BLOQUEIOS, headers=headers).json()
        assert len(apenas_ativos) == 1
        assert apenas_ativos[0]["motivo"] == "Folga futura"

        todos = client.get(URL_BLOQUEIOS, headers=headers, params={"incluir_passados": "true"}).json()
        assert len(todos) == 2
        assert [b["motivo"] for b in todos] == ["Feriado antigo", "Folga futura"]


class TestBloqueiosIntegracaoAgendaEAgendamento:
    def test_bloqueio_faixa_horaria_omite_slots_e_impede_reserva_ate_remocao(self, client: TestClient, db_session):
        prof, prof_headers = _criar_profissional_com_token(client, db_session, "prof.slots@teste.com")
        _, cli_headers = _criar_cliente_com_token(client, db_session, "cli.slots@teste.com", "555666777")
        _configurar_grade_segunda(client, prof_headers)

        # Antes do bloqueio: 5 slots (08, 09, 10, 11, 12)
        agenda_antes = client.get(
            URL_AGENDA.format(professional_id=prof.id),
            params={"data_inicio": str(DIA_FUTURO), "data_fim": str(DIA_FUTURO)},
        )
        assert agenda_antes.status_code == 200
        horas_antes = [s["data_hora_inicio"] for s in agenda_antes.json()[0]["slots"]]
        assert horas_antes == [
            f"{DIA_FUTURO}T08:00:00",
            f"{DIA_FUTURO}T09:00:00",
            f"{DIA_FUTURO}T10:00:00",
            f"{DIA_FUTURO}T11:00:00",
            f"{DIA_FUTURO}T12:00:00",
        ]

        # Profissional bloqueia das 10:00 às 12:00
        resp_bloq = client.post(
            URL_BLOQUEIOS,
            headers=prof_headers,
            json={
                "data_hora_inicio": f"{DIA_FUTURO}T10:00:00",
                "data_hora_fim": f"{DIA_FUTURO}T12:00:00",
                "motivo": "Compromisso pessoal",
            },
        )
        assert resp_bloq.status_code == 201
        bloqueio_id = resp_bloq.json()["id"]

        # Agenda pública omite 10:00 e 11:00 imediatamente
        agenda_bloqueada = client.get(
            URL_AGENDA.format(professional_id=prof.id),
            params={"data_inicio": str(DIA_FUTURO), "data_fim": str(DIA_FUTURO)},
        )
        horas_bloqueadas = [s["data_hora_inicio"] for s in agenda_bloqueada.json()[0]["slots"]]
        assert horas_bloqueadas == [
            f"{DIA_FUTURO}T08:00:00",
            f"{DIA_FUTURO}T09:00:00",
            f"{DIA_FUTURO}T12:00:00",
        ]

        # Tentativa direta de reserva no slot bloqueado (10:00) -> 409 Conflict
        resp_reserva_bloqueada = client.post(
            URL_AGENDAMENTOS,
            headers=cli_headers,
            json={
                "professional_id": prof.id,
                "data_hora_inicio": f"{DIA_FUTURO}T10:00:00",
            },
        )
        assert resp_reserva_bloqueada.status_code == 409
        assert "bloqueado" in resp_reserva_bloqueada.json()["detail"].lower()

        # Reserva em horário não bloqueado (09:00) continua funcionando -> 201
        resp_reserva_ok = client.post(
            URL_AGENDAMENTOS,
            headers=cli_headers,
            json={
                "professional_id": prof.id,
                "data_hora_inicio": f"{DIA_FUTURO}T09:00:00",
            },
        )
        assert resp_reserva_ok.status_code == 201

        # Remove o bloqueio -> 10:00 e 11:00 voltam a ficar livres e reserváveis
        resp_del = client.delete(
            URL_BLOQUEIO_ITEM.format(bloqueio_id=bloqueio_id),
            headers=prof_headers,
        )
        assert resp_del.status_code == 204

        agenda_liberada = client.get(
            URL_AGENDA.format(professional_id=prof.id),
            params={"data_inicio": str(DIA_FUTURO), "data_fim": str(DIA_FUTURO)},
        )
        horas_liberadas = [s["data_hora_inicio"] for s in agenda_liberada.json()[0]["slots"]]
        assert f"{DIA_FUTURO}T10:00:00" in horas_liberadas
        assert f"{DIA_FUTURO}T11:00:00" in horas_liberadas

        resp_reserva_apos = client.post(
            URL_AGENDAMENTOS,
            headers=cli_headers,
            json={
                "professional_id": prof.id,
                "data_hora_inicio": f"{DIA_FUTURO}T10:00:00",
            },
        )
        assert resp_reserva_apos.status_code == 201

    def test_bloqueio_dia_inteiro_zera_slots_apenas_do_dia_bloqueado(self, client: TestClient, db_session):
        prof, prof_headers = _criar_profissional_com_token(client, db_session, "prof.diaint@teste.com")
        _configurar_grade_segunda(client, prof_headers)

        # Bloqueia o dia inteiro em DIA_FUTURO
        resp_bloq = client.post(
            URL_BLOQUEIOS,
            headers=prof_headers,
            json={
                "data_hora_inicio": f"{DIA_FUTURO}T00:00:00",
                "data_hora_fim": f"{DIA_FUTURO + timedelta(days=1)}T00:00:00",
                "motivo": "Feriado Municipal",
            },
        )
        assert resp_bloq.status_code == 201

        agenda = client.get(
            URL_AGENDA.format(professional_id=prof.id),
            params={"data_inicio": str(DIA_FUTURO), "data_fim": str(OUTRO_DIA_FUTURO)},
        ).json()

        por_data = {item["data"]: item["slots"] for item in agenda}
        assert por_data[str(DIA_FUTURO)] == []
        assert len(por_data[str(OUTRO_DIA_FUTURO)]) == 5


def test_migrate_agenda_tables_cria_tabela_bloqueios_idempotentemente():
    engine = create_engine("sqlite:///:memory:")
    models.Professional.__table__.create(bind=engine)
    models.Cliente.__table__.create(bind=engine)
    models.Orcamento.__table__.create(bind=engine)

    migrate_agenda_tables(engine)
    migrate_agenda_tables(engine)  # segunda chamada deve ser idempotente

    inspector = inspect(engine)
    assert inspector.has_table("bloqueios_agenda_profissional")
    assert inspector.has_table("disponibilidade_profissional")
    assert inspector.has_table("agendamentos")
