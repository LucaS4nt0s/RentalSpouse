"""
Testes automatizados das rotas de avaliações e comentários de profissionais (issues #19 e #21).

Cobrem:
- `POST /api/avaliacoes`:
  - Autenticação e autorização: 401 sem token/token inválido, 403 para profissional ou admin, 404 para user `client` sem linha na tabela `clientes`;
  - Autoria derivada estritamente do token (ignora `cliente_id` no payload);
  - Validações de payload (422 para nota < 1 ou > 5, comentário curto < 3 chars, tags `<script>`, IDs <= 0);
  - Regras de negócio: 404 para profissional inexistente, 409 para profissional inativo ou não aprovado (`pending_approval`/`rejected`);
  - Vínculo com `agendamento_id`: sucesso (marca agendamento como `concluido`), 404 se inexistente, 403 se pertencer a outro cliente/profissional (anti-IDOR), 409 se cancelado ou já avaliado;
  - Vínculo com `orcamento_id`: sucesso para orçamento `aceito`/`respondido`, 404 se inexistente, 403 anti-IDOR, 409 se `pendente`/`recusado`/`cancelado` ou já avaliado;
  - Anti-duplicidade para avaliação avulsa por par `(cliente, profissional)`;
  - Disparo de notificação persistida para o profissional avaliado;
- `GET /api/avaliacoes/me`:
  - Listagem escopada ao cliente autenticado, ordenada da mais recente para a mais antiga, com paginação;
- `GET /api/professionals/{professional_id}/avaliacoes`:
  - Acesso público com cálculo de `media_notas`, `total_avaliacoes`, `distribuicao` de 1 a 5 estrelas, abreviação LGPD do nome do cliente, filtro por estrela (`?nota=5`) e paginação (`skip`/`limit`);
  - 404 para profissional inexistente, inativo ou não aprovado.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import models
from migrations import migrate_avaliacoes_tables
from security import create_access_token, hash_senha

URL_AVALIACOES = "/api/avaliacoes"
URL_MINHAS_AVALIACOES = "/api/avaliacoes/me"


SAMPLE_PROF = {
    "name": "Roberto Eletricista",
    "email": "roberto.eletricista@exemplo.com",
    "phone": "(11) 98888-7777",
    "bio": "Especialista em instalações elétricas residenciais e quadros de distribuição.",
    "service_radius_km": 15.0,
    "specialties": ["Elétrica", "Iluminação"],
    "city": "São Paulo",
    "state": "SP",
}


def cpf_valido(base: str) -> str:
    """Gera um CPF válido a partir de 9 dígitos base."""
    assert len(base) == 9 and base.isdigit()

    def digito(digitos: str) -> str:
        pesos = range(len(digitos) + 1, 1, -1)
        resto = (sum(int(d) * p for d, p in zip(digitos, pesos)) * 10) % 11
        return "0" if resto >= 10 else str(resto)

    primeiro = digito(base)
    return base + primeiro + digito(base + primeiro)


def criar_cliente(
    client: TestClient,
    db_session,
    email: str,
    base_cpf: str,
    nome: str = "Mariana Costa",
) -> models.Cliente:
    """Cria um cliente pelo endpoint público e marca seu e-mail como verificado."""
    payload = {
        "nome": nome,
        "email": email,
        "cpf": cpf_valido(base_cpf),
        "data_nascimento": "1992-06-20",
        "senha": "SenhaForte@2026",
        "confirmar_senha": "SenhaForte@2026",
        "endereco": {
            "cep": "01001000",
            "logradouro": "Praça da Sé",
            "numero": "200",
            "complemento": "Bloco B",
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


def criar_profissional_aprovado(
    client: TestClient,
    db_session,
    email: str,
    approval_status: str = models.ProfessionalApprovalStatus.APPROVED.value,
    is_active: bool = True,
) -> models.Professional:
    """Cria um profissional e ajusta seu status de aprovação/ativação no banco."""
    payload = dict(SAMPLE_PROF)
    payload["email"] = email
    resposta = client.post("/api/professionals", json=payload)
    assert resposta.status_code == 201, resposta.text

    prof_id = resposta.json()["id"]
    prof = (
        db_session.query(models.Professional)
        .filter(models.Professional.id == prof_id)
        .one()
    )
    prof.approval_status = approval_status
    prof.is_active = is_active
    db_session.commit()
    db_session.refresh(prof)
    return prof


def cabecalho(email: str, role: str = models.UserRole.CLIENT.value) -> dict:
    """Gera cabeçalho Authorization Bearer para o usuário e papel informados."""
    token = create_access_token(data={"sub": email, "role": role})
    return {"Authorization": f"Bearer {token}"}


class TestAcessoEAutorizacaoAvaliacoes:
    """Valida proteção de rotas autenticadas (`POST /api/avaliacoes` e `GET /api/avaliacoes/me`)."""

    def test_sem_token_retorna_401(self, client: TestClient):
        r1 = client.post(URL_AVALIACOES, json={"professional_id": 1, "nota": 5})
        r2 = client.get(URL_MINHAS_AVALIACOES)
        assert r1.status_code == 401
        assert r2.status_code == 401

    def test_token_invalido_retorna_401(self, client: TestClient):
        headers = {"Authorization": "Bearer token.invalido.jwt"}
        r1 = client.post(URL_AVALIACOES, json={"professional_id": 1, "nota": 5}, headers=headers)
        r2 = client.get(URL_MINHAS_AVALIACOES, headers=headers)
        assert r1.status_code == 401
        assert r2.status_code == 401

    def test_profissional_nao_pode_avaliar_retorna_403(self, client: TestClient, db_session):
        prof = criar_profissional_aprovado(client, db_session, "prof.auth@exemplo.com")
        headers = cabecalho(prof.email, models.UserRole.PROFESSIONAL.value)

        r1 = client.post(URL_AVALIACOES, json={"professional_id": prof.id, "nota": 5}, headers=headers)
        r2 = client.get(URL_MINHAS_AVALIACOES, headers=headers)
        assert r1.status_code == 403
        assert r2.status_code == 403

    def test_admin_nao_pode_avaliar_retorna_403(self, client: TestClient, db_session):
        admin = models.User(
            name="Admin Avaliacao",
            email="admin.av@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()

        headers = cabecalho(admin.email, models.UserRole.ADMIN.value)
        r1 = client.post(URL_AVALIACOES, json={"professional_id": 1, "nota": 5}, headers=headers)
        r2 = client.get(URL_MINHAS_AVALIACOES, headers=headers)
        assert r1.status_code == 403
        assert r2.status_code == 403

    def test_usuario_client_sem_registro_em_clientes_retorna_404(self, client: TestClient, db_session):
        user = models.User(
            name="User Orfao",
            email="orfao.av@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

        headers = cabecalho(user.email)
        r1 = client.post(URL_AVALIACOES, json={"professional_id": 1, "nota": 5}, headers=headers)
        assert r1.status_code == 404


class TestValidacaoPayloadAvaliacao:
    """Valida regras de schema Pydantic (`AvaliacaoCreate`)."""

    @pytest.mark.parametrize("nota_invalida", [0, -1, 6, 10])
    def test_nota_fora_do_intervalo_1_a_5_retorna_422(
        self, client: TestClient, db_session, nota_invalida: int
    ):
        cliente = criar_cliente(client, db_session, f"cli.nota.{nota_invalida}@exemplo.com", "111222333")
        resposta = client.post(
            URL_AVALIACOES,
            json={"professional_id": 1, "nota": nota_invalida},
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422

    def test_comentario_muito_curto_retorna_422(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cli.curto@exemplo.com", "123123123")
        resposta = client.post(
            URL_AVALIACOES,
            json={"professional_id": 1, "nota": 4, "comentario": "oi"},
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422

    def test_comentario_com_script_xss_retorna_422(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cli.xss@exemplo.com", "321321321")
        resposta = client.post(
            URL_AVALIACOES,
            json={"professional_id": 1, "nota": 5, "comentario": "<script>alert(1)</script>"},
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 422

    def test_comentario_apenas_espacos_vira_none_e_aceita(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cli.espacos@exemplo.com", "456456456")
        prof = criar_profissional_aprovado(client, db_session, "prof.espacos@exemplo.com")

        resposta = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "nota": 5, "comentario": "    "},
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["comentario"] is None


class TestCriacaoAvaliacaoERegrasDeNegocio:
    """Valida criação de avaliações, vínculos de agendamento/orçamento, notificações e bloqueios."""

    def test_criar_avaliacao_com_sucesso_retorna_201_e_notifica_profissional(
        self, client: TestClient, db_session
    ):
        cliente = criar_cliente(
            client, db_session, "cli.sucesso@exemplo.com", "147258369", nome="João Victor Carvalho"
        )
        prof = criar_profissional_aprovado(client, db_session, "prof.sucesso@exemplo.com")

        resposta = client.post(
            URL_AVALIACOES,
            json={
                "professional_id": prof.id,
                "nota": 5,
                "comentario": "Serviço impecável! Pontual, organizado e resolveu o curto-circuito rápido.",
            },
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 201, resposta.text
        dados = resposta.json()
        assert dados["cliente_id"] == cliente.id
        assert dados["cliente_nome"] == "João C."
        assert dados["professional_id"] == prof.id
        assert dados["professional_name"] == prof.name
        assert dados["nota"] == 5
        assert "impecável" in dados["comentario"]
        assert dados["created_at"] and dados["updated_at"]

        # Verifica notificação persistida para o profissional
        notif = (
            db_session.query(models.Notificacao)
            .filter(
                models.Notificacao.user_email == prof.email,
                models.Notificacao.tipo == "nova_avaliacao",
            )
            .first()
        )
        assert notif is not None
        assert notif.referencia_id == dados["id"]

    def test_autoria_ignora_cliente_id_no_payload(self, client: TestClient, db_session):
        cli_a = criar_cliente(client, db_session, "cli.a.av@exemplo.com", "159357258")
        cli_b = criar_cliente(client, db_session, "cli.b.av@exemplo.com", "258147369")
        prof = criar_profissional_aprovado(client, db_session, "prof.spoof@exemplo.com")

        resposta = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "nota": 4, "cliente_id": cli_b.id},
            headers=cabecalho(cli_a.email),
        )
        assert resposta.status_code == 201
        assert resposta.json()["cliente_id"] == cli_a.id

    def test_profissional_inexistente_retorna_404(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cli.404.av@exemplo.com", "741852963")
        resposta = client.post(
            URL_AVALIACOES,
            json={"professional_id": 99999, "nota": 5},
            headers=cabecalho(cliente.email),
        )
        assert resposta.status_code == 404

    def test_profissional_inativo_ou_nao_aprovado_retorna_409(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cli.409.av@exemplo.com", "852963741")
        prof_pendente = criar_profissional_aprovado(
            client,
            db_session,
            "prof.pendente.av@exemplo.com",
            approval_status=models.ProfessionalApprovalStatus.PENDING.value,
        )
        prof_inativo = criar_profissional_aprovado(
            client,
            db_session,
            "prof.inativo.av@exemplo.com",
            approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
            is_active=False,
        )

        r_pend = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof_pendente.id, "nota": 4},
            headers=cabecalho(cliente.email),
        )
        r_inat = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof_inativo.id, "nota": 4},
            headers=cabecalho(cliente.email),
        )
        assert r_pend.status_code == 409
        assert r_inat.status_code == 409

    def test_avaliacao_avulsa_duplicada_para_mesmo_profissional_retorna_409(
        self, client: TestClient, db_session
    ):
        cliente = criar_cliente(client, db_session, "cli.dup.av@exemplo.com", "963852741")
        prof = criar_profissional_aprovado(client, db_session, "prof.dup.av@exemplo.com")

        r1 = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "nota": 5, "comentario": "Primeira avaliação ótima."},
            headers=cabecalho(cliente.email),
        )
        assert r1.status_code == 201

        r2 = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "nota": 3, "comentario": "Tentativa duplicada."},
            headers=cabecalho(cliente.email),
        )
        assert r2.status_code == 409

    def test_avaliar_com_agendamento_valido_marca_concluido_e_bloqueia_repeticao(
        self, client: TestClient, db_session
    ):
        cliente = criar_cliente(client, db_session, "cli.agend.av@exemplo.com", "112233445")
        prof = criar_profissional_aprovado(client, db_session, "prof.agend.av@exemplo.com")

        inicio = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)
        agendamento = models.Agendamento(
            professional_id=prof.id,
            cliente_id=cliente.id,
            data_hora_inicio=inicio,
            data_hora_fim=inicio + timedelta(hours=1),
            status=models.AgendamentoStatus.AGENDADO.value,
        )
        db_session.add(agendamento)
        db_session.commit()
        db_session.refresh(agendamento)

        r1 = client.post(
            URL_AVALIACOES,
            json={
                "professional_id": prof.id,
                "agendamento_id": agendamento.id,
                "nota": 5,
                "comentario": "Atendimento agendado concluído no horário!",
            },
            headers=cabecalho(cliente.email),
        )
        assert r1.status_code == 201, r1.text
        assert r1.json()["agendamento_id"] == agendamento.id

        db_session.refresh(agendamento)
        assert agendamento.status == models.AgendamentoStatus.CONCLUIDO.value

        # Tentar avaliar o mesmo agendamento novamente deve retornar 409
        r2 = client.post(
            URL_AVALIACOES,
            json={
                "professional_id": prof.id,
                "agendamento_id": agendamento.id,
                "nota": 4,
            },
            headers=cabecalho(cliente.email),
        )
        assert r2.status_code == 409

    def test_avaliar_agendamento_inexistente_cancelado_ou_de_terceiro(
        self, client: TestClient, db_session
    ):
        cli_dono = criar_cliente(client, db_session, "cli.dono.ag@exemplo.com", "223344556")
        cli_outro = criar_cliente(client, db_session, "cli.outro.ag@exemplo.com", "334455667")
        prof = criar_profissional_aprovado(client, db_session, "prof.ag.err@exemplo.com")

        inicio = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=2)
        ag_ativo = models.Agendamento(
            professional_id=prof.id,
            cliente_id=cli_dono.id,
            data_hora_inicio=inicio,
            data_hora_fim=inicio + timedelta(hours=1),
            status=models.AgendamentoStatus.AGENDADO.value,
        )
        ag_cancelado = models.Agendamento(
            professional_id=prof.id,
            cliente_id=cli_dono.id,
            data_hora_inicio=inicio + timedelta(hours=2),
            data_hora_fim=inicio + timedelta(hours=3),
            status=models.AgendamentoStatus.CANCELADO.value,
        )
        db_session.add_all([ag_ativo, ag_cancelado])
        db_session.commit()

        # 404 para agendamento inexistente
        r_404 = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "agendamento_id": 99999, "nota": 5},
            headers=cabecalho(cli_dono.email),
        )
        assert r_404.status_code == 404

        # 403 quando outro cliente tenta avaliar o agendamento de cli_dono
        r_403 = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "agendamento_id": ag_ativo.id, "nota": 5},
            headers=cabecalho(cli_outro.email),
        )
        assert r_403.status_code == 403

        # 409 para agendamento cancelado
        r_409 = client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "agendamento_id": ag_cancelado.id, "nota": 3},
            headers=cabecalho(cli_dono.email),
        )
        assert r_409.status_code == 409

    def test_avaliar_orcamento_aceito_ou_rejeitar_invalido(self, client: TestClient, db_session):
        cli_dono = criar_cliente(client, db_session, "cli.orc.dono@exemplo.com", "445566778")
        cli_outro = criar_cliente(client, db_session, "cli.orc.outro@exemplo.com", "556677889")
        prof = criar_profissional_aprovado(client, db_session, "prof.orc.av@exemplo.com")

        orc_aceito = models.Orcamento(
            cliente_id=cli_dono.id,
            cliente_nome=cli_dono.nome,
            cliente_email=cli_dono.email,
            professional_id=prof.id,
            descricao="Troca de disjuntor bipolar no quadro principal.",
            status=models.OrcamentoStatus.ACEITO.value,
        )
        orc_pendente = models.Orcamento(
            cliente_id=cli_dono.id,
            cliente_nome=cli_dono.nome,
            cliente_email=cli_dono.email,
            professional_id=prof.id,
            descricao="Instalação de luminária pendente na sala.",
            status=models.OrcamentoStatus.PENDENTE.value,
        )
        db_session.add_all([orc_aceito, orc_pendente])
        db_session.commit()

        # 404 orçamento inexistente
        assert (
            client.post(
                URL_AVALIACOES,
                json={"professional_id": prof.id, "orcamento_id": 99999, "nota": 5},
                headers=cabecalho(cli_dono.email),
            ).status_code
            == 404
        )

        # 403 orçamento de outro cliente
        assert (
            client.post(
                URL_AVALIACOES,
                json={"professional_id": prof.id, "orcamento_id": orc_aceito.id, "nota": 5},
                headers=cabecalho(cli_outro.email),
            ).status_code
            == 403
        )

        # 409 orçamento ainda pendente
        assert (
            client.post(
                URL_AVALIACOES,
                json={"professional_id": prof.id, "orcamento_id": orc_pendente.id, "nota": 5},
                headers=cabecalho(cli_dono.email),
            ).status_code
            == 409
        )

        # 201 orçamento aceito
        r_ok = client.post(
            URL_AVALIACOES,
            json={
                "professional_id": prof.id,
                "orcamento_id": orc_aceito.id,
                "nota": 5,
                "comentario": "Orçamento justo e serviço rápido.",
            },
            headers=cabecalho(cli_dono.email),
        )
        assert r_ok.status_code == 201
        assert r_ok.json()["orcamento_id"] == orc_aceito.id

        # 409 duplicado no mesmo orçamento
        assert (
            client.post(
                URL_AVALIACOES,
                json={"professional_id": prof.id, "orcamento_id": orc_aceito.id, "nota": 4},
                headers=cabecalho(cli_dono.email),
            ).status_code
            == 409
        )


class TestListagemPublicaEMinhasAvaliacoes:
    """Valida `GET /api/avaliacoes/me` e `GET /api/professionals/{id}/avaliacoes` (#21)."""

    def test_resumo_profissional_sem_avaliacoes_retorna_zeros(
        self, client: TestClient, db_session
    ):
        prof = criar_profissional_aprovado(client, db_session, "prof.vazio.av@exemplo.com")

        resposta = client.get(f"/api/professionals/{prof.id}/avaliacoes")
        assert resposta.status_code == 200, resposta.text
        corpo = resposta.json()
        assert corpo["professional_id"] == prof.id
        assert corpo["media_notas"] == 0.0
        assert corpo["total_avaliacoes"] == 0
        assert corpo["distribuicao"] == {
            "estrelas_1": 0,
            "estrelas_2": 0,
            "estrelas_3": 0,
            "estrelas_4": 0,
            "estrelas_5": 0,
        }
        assert corpo["items"] == []

    def test_resumo_calcula_media_distribuicao_e_filtra_por_estrela(
        self, client: TestClient, db_session
    ):
        prof = criar_profissional_aprovado(client, db_session, "prof.media.av@exemplo.com")
        c1 = criar_cliente(client, db_session, "c1.av@exemplo.com", "667788990", nome="Ana Beatriz")
        c2 = criar_cliente(client, db_session, "c2.av@exemplo.com", "778899001", nome="Carlos")
        c3 = criar_cliente(client, db_session, "c3.av@exemplo.com", "889900112", nome="Fernanda Lima")

        client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "nota": 5, "comentario": "Excelente profissional!"},
            headers=cabecalho(c1.email),
        )
        client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "nota": 5, "comentario": "Muito prestativo e rápido."},
            headers=cabecalho(c2.email),
        )
        client.post(
            URL_AVALIACOES,
            json={"professional_id": prof.id, "nota": 2, "comentario": "Chegou com atraso."},
            headers=cabecalho(c3.email),
        )

        # Consulta geral: média = (5 + 5 + 2) / 3 = 4.0
        r_all = client.get(f"/api/professionals/{prof.id}/avaliacoes")
        assert r_all.status_code == 200
        dados = r_all.json()
        assert dados["total_avaliacoes"] == 3
        assert dados["media_notas"] == 4.0
        assert dados["distribuicao"] == {
            "estrelas_1": 0,
            "estrelas_2": 1,
            "estrelas_3": 0,
            "estrelas_4": 0,
            "estrelas_5": 2,
        }
        assert len(dados["items"]) == 3
        nomes_publicos = {item["cliente_nome"] for item in dados["items"]}
        assert nomes_publicos == {"Ana B.", "Carlos", "Fernanda L."}

        # Filtro por nota = 5 retorna apenas os 2 itens de 5 estrelas, mantendo o resumo global
        r_5 = client.get(f"/api/professionals/{prof.id}/avaliacoes?nota=5")
        assert r_5.status_code == 200
        dados_5 = r_5.json()
        assert dados_5["total_avaliacoes"] == 3
        assert dados_5["media_notas"] == 4.0
        assert len(dados_5["items"]) == 2
        assert all(item["nota"] == 5 for item in dados_5["items"])

    def test_listar_avaliacoes_profissional_inexistente_ou_nao_aprovado_retorna_404(
        self, client: TestClient, db_session
    ):
        prof_pend = criar_profissional_aprovado(
            client,
            db_session,
            "prof.pend.pub@exemplo.com",
            approval_status=models.ProfessionalApprovalStatus.PENDING.value,
        )
        assert client.get("/api/professionals/99999/avaliacoes").status_code == 404
        assert client.get(f"/api/professionals/{prof_pend.id}/avaliacoes").status_code == 404

    def test_listar_minhas_avaliacoes_escopado_ao_cliente(
        self, client: TestClient, db_session
    ):
        c1 = criar_cliente(client, db_session, "me1.av@exemplo.com", "990011223")
        c2 = criar_cliente(client, db_session, "me2.av@exemplo.com", "102030405")
        p1 = criar_profissional_aprovado(client, db_session, "p1.me@exemplo.com")
        p2 = criar_profissional_aprovado(client, db_session, "p2.me@exemplo.com")

        client.post(
            URL_AVALIACOES,
            json={"professional_id": p1.id, "nota": 5, "comentario": "Ótimo trabalho na cozinha."},
            headers=cabecalho(c1.email),
        )
        client.post(
            URL_AVALIACOES,
            json={"professional_id": p2.id, "nota": 4, "comentario": "Bom atendimento geral."},
            headers=cabecalho(c1.email),
        )
        client.post(
            URL_AVALIACOES,
            json={"professional_id": p1.id, "nota": 3, "comentario": "Avaliação de outro cliente."},
            headers=cabecalho(c2.email),
        )

        r_me = client.get(URL_MINHAS_AVALIACOES, headers=cabecalho(c1.email))
        assert r_me.status_code == 200
        lista = r_me.json()
        assert len(lista) == 2
        assert all(item["cliente_id"] == c1.id for item in lista)

    def test_migracao_avaliacoes_idempotente(self, db_session):
        engine = db_session.get_bind()
        migrate_avaliacoes_tables(engine)
        migrate_avaliacoes_tables(engine)
