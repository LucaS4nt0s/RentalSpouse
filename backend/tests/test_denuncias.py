"""
Testes das rotas de denúncia contra profissionais (issue #68).

Cobrem `POST /api/denuncias` e `GET /api/denuncias/me`:

- 401 sem token, 403 para profissional/admin, 404 para usuário `client` sem
  cadastro na tabela `clientes`;
- autoria sempre derivada do token (o payload não define o autor);
- validações de payload (motivo catalogado, descrição mínima/máxima, id alvo);
- 404 para profissional inexistente e 409 para profissional inativo;
- anti-duplicidade: uma denúncia em aberto por par (cliente, profissional);
- leitura escopada: o cliente só vê as próprias denúncias, com paginação.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

import models
import schemas
from security import create_access_token, hash_senha

URL_DENUNCIAS = "/api/denuncias"
URL_ME = "/api/denuncias/me"

DESCRICAO_VALIDA = (
    "O profissional não compareceu na data combinada, não avisou sobre o atraso "
    "e parou de responder às mensagens depois do pagamento do sinal."
)

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
    """
    Cria um cliente pelo endpoint público e confirma o e-mail direto no banco.

    O fluxo real de confirmação por token já é coberto em `test_verificacao.py`;
    aqui o objetivo é apenas obter um cliente apto a denunciar.
    """
    payload = {
        "nome": "Cliente Denunciante",
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
    client: TestClient, email: str, senha: str | None = None
) -> dict:
    """Cria um profissional ativo pelo endpoint público (senha opcional para login)."""
    payload = dict(SAMPLE_PROF)
    payload["email"] = email
    if senha:
        payload["password"] = senha
    resposta = client.post("/api/professionals", json=payload)
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def cabecalho(email: str, role: str = models.UserRole.CLIENT.value) -> dict:
    """Cabeçalho Bearer para o e-mail/papel informado."""
    token = create_access_token(data={"sub": email, "role": role})
    return {"Authorization": f"Bearer {token}"}


def payload_denuncia(professional_id: int, **overrides) -> dict:
    """Payload válido de denúncia com overrides opcionais."""
    dados = {
        "professional_id": professional_id,
        "motivo": models.DenunciaMotivo.SERVICO_NAO_REALIZADO.value,
        "descricao": DESCRICAO_VALIDA,
    }
    dados.update(overrides)
    return dados


def requisicoes_protegidas(client: TestClient, headers: dict | None = None) -> list:
    """Dispara as rotas de denúncia e devolve as respostas."""
    return [
        client.post(URL_DENUNCIAS, json=payload_denuncia(1), headers=headers),
        client.get(URL_ME, headers=headers),
    ]


class TestAcessoRestritoDenuncias:
    """Autenticação e autorização das rotas de denúncia."""

    def test_sem_token_retorna_401(self, client: TestClient):
        for resposta in requisicoes_protegidas(client):
            assert resposta.status_code == 401

    def test_profissional_retorna_403(self, client: TestClient):
        profissional = criar_profissional(client, "prof.denuncia@exemplo.com")
        headers = cabecalho(profissional["email"], models.UserRole.PROFESSIONAL.value)

        for resposta in requisicoes_protegidas(client, headers):
            assert resposta.status_code == 403

    def test_administrador_retorna_403(self, client: TestClient, db_session):
        admin = models.User(
            name="Administrador",
            email="admin.denuncia@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()

        for resposta in requisicoes_protegidas(
            client, cabecalho(admin.email, models.UserRole.ADMIN.value)
        ):
            assert resposta.status_code == 403

    def test_cliente_sem_cadastro_de_cliente_retorna_404(self, client: TestClient, db_session):
        """Usuário `client` sem linha na tabela `clientes` não pode denunciar."""
        usuario = models.User(
            name="Cliente Incompleto",
            email="cliente.sem.cadastro@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(usuario)
        db_session.commit()

        for resposta in requisicoes_protegidas(client, cabecalho(usuario.email)):
            assert resposta.status_code == 404
            assert "cliente" in resposta.json()["detail"].lower()

    def test_token_invalido_retorna_401(self, client: TestClient):
        resposta = client.get(URL_ME, headers={"Authorization": "Bearer token.invalido"})
        assert resposta.status_code == 401


class TestCriacaoDenuncia:
    """Regras de negócio do registro de uma denúncia."""

    def test_denuncia_com_sucesso_retorna_201_e_persiste(
        self, client: TestClient, db_session
    ):
        cliente = criar_cliente(client, db_session, "cliente.201@exemplo.com", "123456789")
        profissional = criar_profissional(client, "prof.201@exemplo.com")

        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"]),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        corpo = resposta.json()
        assert corpo["cliente_id"] == cliente.id
        assert corpo["professional_id"] == profissional["id"]
        assert corpo["professional_name"] == profissional["name"]
        assert corpo["motivo"] == models.DenunciaMotivo.SERVICO_NAO_REALIZADO.value
        assert corpo["descricao"] == DESCRICAO_VALIDA
        assert corpo["status"] == models.DenunciaStatus.PENDENTE.value
        assert corpo["created_at"] and corpo["updated_at"]

        persistida = (
            db_session.query(models.Denuncia)
            .filter(models.Denuncia.id == corpo["id"])
            .one()
        )
        assert persistida.cliente_id == cliente.id
        assert persistida.professional_id == profissional["id"]

    def test_autor_e_derivado_do_token_e_ignora_payload(
        self, client: TestClient, db_session
    ):
        """Enviar `cliente_id` no payload não troca a autoria da denúncia."""
        cliente_a = criar_cliente(client, db_session, "cliente.a@exemplo.com", "111444777")
        cliente_b = criar_cliente(client, db_session, "cliente.b@exemplo.com", "222555888")
        profissional = criar_profissional(client, "prof.autoria@exemplo.com")

        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], cliente_id=cliente_b.id),
            headers=cabecalho(cliente_a.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["cliente_id"] == cliente_a.id

    def test_motivo_normalizado_para_minusculas(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.motivo@exemplo.com", "333666999")
        profissional = criar_profissional(client, "prof.motivo@exemplo.com")

        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], motivo="  OUTRO  "),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["motivo"] == models.DenunciaMotivo.OUTRO.value

    def test_descricao_recebe_trim(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.trim@exemplo.com", "444777111")
        profissional = criar_profissional(client, "prof.trim@exemplo.com")

        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], descricao=f"   {DESCRICAO_VALIDA}   "),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["descricao"] == DESCRICAO_VALIDA

    @pytest.mark.parametrize("motivo", [m.value for m in models.DenunciaMotivo])
    def test_todos_os_motivos_catalogados_sao_aceitos(
        self, client: TestClient, db_session, motivo: str
    ):
        cliente = criar_cliente(client, db_session, f"cliente.{motivo}@exemplo.com", "555888222")
        profissional = criar_profissional(client, f"prof.{motivo}@exemplo.com")

        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], motivo=motivo),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["motivo"] == motivo

    def test_profissional_inexistente_retorna_404(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.404@exemplo.com", "666999333")

        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(9999),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 404
        assert "não encontrado" in resposta.json()["detail"].lower()
        assert db_session.query(models.Denuncia).count() == 0

    def test_profissional_inativo_retorna_409(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.inativo@exemplo.com", "777111444")
        profissional = criar_profissional(client, "prof.inativo@exemplo.com")

        registro = (
            db_session.query(models.Professional)
            .filter(models.Professional.id == profissional["id"])
            .one()
        )
        registro.is_active = False
        db_session.commit()

        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"]),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 409
        assert "inativo" in resposta.json()["detail"].lower()

    def test_denuncia_duplicada_em_aberto_retorna_409(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.duplicada@exemplo.com", "888222555")
        profissional = criar_profissional(client, "prof.duplicada@exemplo.com")
        headers = cabecalho(cliente.email)

        primeira = client.post(
            URL_DENUNCIAS, json=payload_denuncia(profissional["id"]), headers=headers
        )
        segunda = client.post(
            URL_DENUNCIAS, json=payload_denuncia(profissional["id"]), headers=headers
        )

        assert primeira.status_code == 201, primeira.text
        assert segunda.status_code == 409
        assert "em aberto" in segunda.json()["detail"].lower()
        assert db_session.query(models.Denuncia).count() == 1

    def test_denuncia_liberada_apos_status_resolvido(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.resolvida@exemplo.com", "999333666")
        profissional = criar_profissional(client, "prof.resolvida@exemplo.com")
        headers = cabecalho(cliente.email)

        primeira = client.post(
            URL_DENUNCIAS, json=payload_denuncia(profissional["id"]), headers=headers
        )
        assert primeira.status_code == 201, primeira.text

        denuncia = (
            db_session.query(models.Denuncia)
            .filter(models.Denuncia.id == primeira.json()["id"])
            .one()
        )
        denuncia.status = models.DenunciaStatus.RESOLVIDA.value
        db_session.commit()

        segunda = client.post(
            URL_DENUNCIAS, json=payload_denuncia(profissional["id"]), headers=headers
        )

        assert segunda.status_code == 201, segunda.text
        assert segunda.json()["status"] == models.DenunciaStatus.PENDENTE.value
        assert db_session.query(models.Denuncia).count() == 2

    def test_denuncia_bloqueada_enquanto_em_analise(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.analise@exemplo.com", "147258369")
        profissional = criar_profissional(client, "prof.analise@exemplo.com")
        headers = cabecalho(cliente.email)

        primeira = client.post(
            URL_DENUNCIAS, json=payload_denuncia(profissional["id"]), headers=headers
        )
        denuncia = (
            db_session.query(models.Denuncia)
            .filter(models.Denuncia.id == primeira.json()["id"])
            .one()
        )
        denuncia.status = models.DenunciaStatus.EM_ANALISE.value
        db_session.commit()

        segunda = client.post(
            URL_DENUNCIAS, json=payload_denuncia(profissional["id"]), headers=headers
        )

        assert segunda.status_code == 409

    def test_dois_clientes_podem_denunciar_o_mesmo_profissional(
        self, client: TestClient, db_session
    ):
        cliente_a = criar_cliente(client, db_session, "cliente.x@exemplo.com", "963852741")
        cliente_b = criar_cliente(client, db_session, "cliente.y@exemplo.com", "258147369")
        profissional = criar_profissional(client, "prof.dois.clientes@exemplo.com")

        resposta_a = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"]),
            headers=cabecalho(cliente_a.email),
        )
        resposta_b = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"]),
            headers=cabecalho(cliente_b.email),
        )

        assert resposta_a.status_code == 201, resposta_a.text
        assert resposta_b.status_code == 201, resposta_b.text
        assert db_session.query(models.Denuncia).count() == 2


class TestValidacaoDePayload:
    """Validações do schema de entrada (422)."""

    @pytest.fixture
    def contexto(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.422@exemplo.com", "321654987")
        profissional = criar_profissional(client, "prof.422@exemplo.com")
        return cliente, profissional

    def test_motivo_desconhecido_retorna_422(self, client: TestClient, contexto):
        cliente, profissional = contexto
        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], motivo="motivo_inventado"),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 422
        detalhe = resposta.json()["detail"][0]["msg"]
        assert "inválido" in detalhe

    def test_descricao_muito_curta_retorna_422(self, client: TestClient, contexto):
        cliente, profissional = contexto
        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], descricao="Muito ruim"),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 422

    def test_descricao_apenas_espacos_retorna_422(self, client: TestClient, contexto):
        cliente, profissional = contexto
        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], descricao=" " * 30),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 422

    def test_descricao_acima_do_limite_retorna_422(self, client: TestClient, contexto):
        cliente, profissional = contexto
        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], descricao="a" * 2001),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 422

    @pytest.mark.parametrize("professional_id", [0, -5, "abc", None])
    def test_professional_id_invalido_retorna_422(
        self, client: TestClient, contexto, professional_id
    ):
        cliente, _ = contexto
        resposta = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(professional_id),
            headers=cabecalho(cliente.email),
        )

        assert resposta.status_code == 422

    def test_campos_obrigatorios_ausentes_retorna_422(self, client: TestClient, contexto):
        cliente, _ = contexto
        resposta = client.post(URL_DENUNCIAS, json={}, headers=cabecalho(cliente.email))

        assert resposta.status_code == 422


class TestListagemMinhasDenuncias:
    """Leitura escopada das denúncias do próprio cliente."""

    def test_lista_vazia_retorna_200(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.vazio@exemplo.com", "159753468")

        resposta = client.get(URL_ME, headers=cabecalho(cliente.email))

        assert resposta.status_code == 200
        assert resposta.json() == []

    def test_lista_apenas_denuncias_do_proprio_cliente(
        self, client: TestClient, db_session
    ):
        cliente_a = criar_cliente(client, db_session, "cliente.escopo.a@exemplo.com", "753951456")
        cliente_b = criar_cliente(client, db_session, "cliente.escopo.b@exemplo.com", "852741963")
        profissional = criar_profissional(client, "prof.escopo@exemplo.com")

        client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], descricao="Denúncia do cliente A, sem detalhes falsos."),
            headers=cabecalho(cliente_a.email),
        )
        client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(profissional["id"], descricao="Denúncia do cliente B, sem detalhes falsos."),
            headers=cabecalho(cliente_b.email),
        )

        resposta = client.get(URL_ME, headers=cabecalho(cliente_a.email))

        assert resposta.status_code == 200
        corpo = resposta.json()
        assert len(corpo) == 1
        assert corpo[0]["cliente_id"] == cliente_a.id
        assert "cliente A" in corpo[0]["descricao"]

    def test_ordenacao_da_mais_recente_para_a_mais_antiga(
        self, client: TestClient, db_session
    ):
        cliente = criar_cliente(client, db_session, "cliente.ordem@exemplo.com", "951753852")
        profissional_alvo = criar_profissional(client, "prof.ordem.a@exemplo.com")
        profissional_alvo_b = criar_profissional(client, "prof.ordem.b@exemplo.com")
        headers = cabecalho(cliente.email)

        for indice, alvo in enumerate([profissional_alvo, profissional_alvo_b], start=1):
            resposta = client.post(
                URL_DENUNCIAS,
                json=payload_denuncia(
                    alvo["id"], descricao=f"Relato numero {indice} com detalhes suficientes."
                ),
                headers=headers,
            )
            assert resposta.status_code == 201, resposta.text

        resposta = client.get(URL_ME, headers=headers)

        assert resposta.status_code == 200
        ids = [item["professional_id"] for item in resposta.json()]
        assert ids == [profissional_alvo_b["id"], profissional_alvo["id"]]

    def test_paginacao_com_skip_e_limit(self, client: TestClient, db_session):
        cliente = criar_cliente(client, db_session, "cliente.paginada@exemplo.com", "357159753")
        headers = cabecalho(cliente.email)
        profissionais = [
            criar_profissional(client, f"prof.pagina.{i}@exemplo.com") for i in range(3)
        ]

        for profissional in profissionais:
            resposta = client.post(
                URL_DENUNCIAS,
                json=payload_denuncia(profissional["id"]),
                headers=headers,
            )
            assert resposta.status_code == 201, resposta.text

        primeira_pagina = client.get(f"{URL_ME}?skip=0&limit=2", headers=headers)
        segunda_pagina = client.get(f"{URL_ME}?skip=2&limit=2", headers=headers)

        ids_primeira = [item["id"] for item in primeira_pagina.json()]
        ids_segunda = [item["id"] for item in segunda_pagina.json()]

        assert primeira_pagina.status_code == 200 and segunda_pagina.status_code == 200
        assert len(ids_primeira) == 2 and len(ids_segunda) == 1
        assert ids_primeira == sorted(ids_primeira, reverse=True)
        assert ids_segunda == sorted(ids_segunda, reverse=True)
        assert set(ids_primeira).isdisjoint(ids_segunda)
        assert max(ids_primeira) > min(ids_primeira) > ids_segunda[0]

    @pytest.mark.parametrize("query", ["limit=0", "limit=101", "skip=-1"])
    def test_parametros_de_paginacao_invalidos_retornam_422(
        self, client: TestClient, db_session, query: str
    ):
        cliente = criar_cliente(client, db_session, "cliente.pag.erro@exemplo.com", "456123789")

        resposta = client.get(f"{URL_ME}?{query}", headers=cabecalho(cliente.email))

        assert resposta.status_code == 422

    def test_denuncia_preserva_historico_apos_exclusao_do_profissional(
        self, client: TestClient, db_session
    ):
        """Sem o cadastro do profissional, a denúncia continua listada (nome nulo)."""
        cliente = criar_cliente(client, db_session, "cliente.historico@exemplo.com", "654987321")
        profissional = criar_profissional(client, "prof.historico@exemplo.com")
        headers = cabecalho(cliente.email)

        resposta = client.post(
            URL_DENUNCIAS, json=payload_denuncia(profissional["id"]), headers=headers
        )
        assert resposta.status_code == 201, resposta.text

        registro = (
            db_session.query(models.Professional)
            .filter(models.Professional.id == profissional["id"])
            .one()
        )
        db_session.delete(registro)
        db_session.commit()

        listagem = client.get(URL_ME, headers=headers)

        assert listagem.status_code == 200
        assert len(listagem.json()) == 1
        assert listagem.json()[0]["professional_name"] is None
        assert listagem.json()[0]["professional_id"] == profissional["id"]

    def test_rota_me_nao_e_interpretada_como_id(self, client: TestClient, db_session):
        """`/me` não pode ser capturado por rotas de path param numérico."""
        cliente = criar_cliente(client, db_session, "cliente.rota@exemplo.com", "789456123")

        resposta = client.get(URL_ME, headers=cabecalho(cliente.email))

        assert resposta.status_code == 200


class TestModeloDenuncia:
    """Garantias estruturais do modelo (independentes da camada HTTP)."""

    def test_denuncia_nasce_com_status_pendente(self, db_session):
        cliente = models.Cliente(
            nome="Cliente Direto",
            email="cliente.direto@exemplo.com",
            cpf=cpf_valido("741852963"),
            data_nascimento=date(1992, 1, 10),
            senha_hash=hash_senha("SenhaForte@2026"),
            cep="01001000",
            logradouro="Praça da Sé",
            numero="100",
            bairro="Sé",
            cidade="São Paulo",
            estado="SP",
            email_verificado=True,
        )
        db_session.add(cliente)
        db_session.commit()

        denuncia = models.Denuncia(
            cliente_id=cliente.id,
            professional_id=1,
            motivo=models.DenunciaMotivo.OUTRO.value,
            descricao="Registro criado direto no ORM para validar os valores padrão.",
        )
        db_session.add(denuncia)
        db_session.commit()
        db_session.refresh(denuncia)

        assert denuncia.status == models.DenunciaStatus.PENDENTE.value
        assert denuncia.created_at is not None
        assert denuncia.updated_at is not None

    def test_status_em_aberto_considera_pendente_e_em_analise(self):
        assert models.DENUNCIA_STATUS_EM_ABERTO == (
            models.DenunciaStatus.PENDENTE.value,
            models.DenunciaStatus.EM_ANALISE.value,
        )


URL_ADMIN_DENUNCIAS = "/api/admin/denuncias"
URL_ADMIN_RESUMO = "/api/admin/denuncias/resumo"


def criar_admin_usuario(
    db_session,
    email: str = "admin.denuncias@rentalspouse.com",
    is_active: bool = True,
) -> models.User:
    """Cria usuário administrador no banco de teste."""
    admin = models.User(
        name="Admin Moderador",
        email=email,
        hashed_password=hash_senha("Admin@123456"),
        role=models.UserRole.ADMIN.value,
        is_active=is_active,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin


class TestDenunciasAdminListagemEResumo:
    """Cobertura dos endpoints administrativos de listagem, filtro e resumo de denúncias."""

    @pytest.mark.parametrize("url", [URL_ADMIN_DENUNCIAS, URL_ADMIN_RESUMO])
    def test_exige_autenticacao_e_bloqueia_nao_admin(
        self, client: TestClient, db_session, url: str
    ):
        sem_token = client.get(url)
        assert sem_token.status_code == 401

        cliente = criar_cliente(client, db_session, "cli.block@exemplo.com", "321654987")
        resp_cliente = client.get(
            url, headers=cabecalho(cliente.email, models.UserRole.CLIENT.value)
        )
        assert resp_cliente.status_code == 403

        prof = criar_profissional(client, "prof.block@exemplo.com")
        resp_prof = client.get(
            url, headers=cabecalho(prof["email"], models.UserRole.PROFESSIONAL.value)
        )
        assert resp_prof.status_code == 403

        admin_inativo = criar_admin_usuario(
            db_session, email="admin.inativo@rentalspouse.com", is_active=False
        )
        resp_inativo = client.get(
            url, headers=cabecalho(admin_inativo.email, models.UserRole.ADMIN.value)
        )
        assert resp_inativo.status_code == 401

    def test_listagem_enriquecida_ordenacao_filtros_e_resumo(
        self, client: TestClient, db_session
    ):
        admin = criar_admin_usuario(db_session)
        headers_admin = cabecalho(admin.email, models.UserRole.ADMIN.value)

        cli_ana = criar_cliente(client, db_session, "ana.silva@exemplo.com", "111222333")
        cli_bruno = criar_cliente(client, db_session, "bruno.souza@exemplo.com", "444555666")

        prof_mario = criar_profissional(client, "mario.eletricista@exemplo.com")
        prof_carla_resp = client.post(
            "/api/professionals",
            json={
                **SAMPLE_PROF,
                "name": "Carla Pintora",
                "email": "carla.pintora@exemplo.com",
            },
        )
        assert prof_carla_resp.status_code == 201
        prof_carla = prof_carla_resp.json()

        # 1) Denúncia já arquivada contra Mário (mais antiga)
        d_arquivada = models.Denuncia(
            cliente_id=cli_ana.id,
            professional_id=prof_mario["id"],
            motivo=models.DenunciaMotivo.COBRANCA_INDEVIDA.value,
            descricao="Cobrança adicional sem autorização prévia no orçamento inicial.",
            status=models.DenunciaStatus.ARQUIVADA.value,
        )
        # 2) Denúncia resolvida (banimento) contra Carla
        d_resolvida = models.Denuncia(
            cliente_id=cli_bruno.id,
            professional_id=prof_carla["id"],
            motivo=models.DenunciaMotivo.CONDUTA_INADEQUADA.value,
            descricao="Relato de conduta inadequada durante visita técnica em residência.",
            status=models.DenunciaStatus.RESOLVIDA.value,
        )
        # 3) Denúncia pendente contra Mário (mais recente, deve vir no topo)
        d_pendente = models.Denuncia(
            cliente_id=cli_bruno.id,
            professional_id=prof_mario["id"],
            motivo=models.DenunciaMotivo.SERVICO_NAO_REALIZADO.value,
            descricao="Profissional não compareceu ao agendamento confirmado pela plataforma.",
            status=models.DenunciaStatus.PENDENTE.value,
        )
        db_session.add_all([d_arquivada, d_resolvida, d_pendente])
        db_session.commit()
        for item in (d_arquivada, d_resolvida, d_pendente):
            db_session.refresh(item)

        # Marca Carla como banida (inativa) para verificar reflection de professional_is_active
        carla_db = (
            db_session.query(models.Professional)
            .filter(models.Professional.id == prof_carla["id"])
            .one()
        )
        carla_db.is_active = False
        db_session.commit()

        # Resumo consolidado
        resumo = client.get(URL_ADMIN_RESUMO, headers=headers_admin)
        assert resumo.status_code == 200, resumo.text
        assert resumo.json() == {
            "total": 3,
            "pendentes": 1,
            "em_analise": 0,
            "resolvidas_banimento": 1,
            "rejeitadas": 1,
            "arquivadas": 1,
        }

        # Listagem completa: pendentes devem aparecer antes de arquivada/resolvida
        listagem = client.get(URL_ADMIN_DENUNCIAS, headers=headers_admin)
        assert listagem.status_code == 200, listagem.text
        itens = listagem.json()
        assert len(itens) == 3
        assert itens[0]["id"] == d_pendente.id
        assert itens[0]["status"] == "pendente"
        assert itens[0]["cliente_nome"] == cli_bruno.nome
        assert itens[0]["cliente_email"] == cli_bruno.email
        assert itens[0]["professional_name"] == prof_mario["name"]
        assert itens[0]["professional_email"] == prof_mario["email"]
        assert itens[0]["professional_is_active"] is True
        # Mário possui 2 denúncias no total
        assert itens[0]["professional_total_denuncias"] == 2
        assert itens[0]["total_denuncias_profissional"] == 2

        item_carla = next(x for x in itens if x["id"] == d_resolvida.id)
        assert item_carla["professional_is_active"] is False
        assert item_carla["professional_total_denuncias"] == 1

        # Filtro por status (incluindo sinônimo 'rejeitada' para 'arquivada')
        resp_arq = client.get(
            URL_ADMIN_DENUNCIAS, params={"status": "rejeitada"}, headers=headers_admin
        )
        assert resp_arq.status_code == 200
        assert [x["id"] for x in resp_arq.json()] == [d_arquivada.id]

        # Filtro por motivo
        resp_motivo = client.get(
            URL_ADMIN_DENUNCIAS,
            params={"motivo": "conduta_inadequada"},
            headers=headers_admin,
        )
        assert resp_motivo.status_code == 200
        assert [x["id"] for x in resp_motivo.json()] == [d_resolvida.id]

        # Busca textual `q` por nome do profissional
        resp_q = client.get(
            URL_ADMIN_DENUNCIAS, params={"q": "Carla"}, headers=headers_admin
        )
        assert resp_q.status_code == 200
        assert [x["id"] for x in resp_q.json()] == [d_resolvida.id]

        # Paginação skip/limit
        resp_pag = client.get(
            URL_ADMIN_DENUNCIAS,
            params={"skip": 1, "limit": 1},
            headers=headers_admin,
        )
        assert resp_pag.status_code == 200
        assert len(resp_pag.json()) == 1

    def test_busca_textual_escapa_curingas_like(self, client: TestClient, db_session):
        """Caracteres '%' e '_' em `q` são tratados literalmente e não como curinga."""
        admin = criar_admin_usuario(db_session, "admin.like@rentalspouse.com")
        headers_admin = cabecalho(admin.email, models.UserRole.ADMIN.value)

        cli = criar_cliente(client, db_session, "cli.like@exemplo.com", "321654987")
        prof = criar_profissional(client, "prof.like@exemplo.com")

        d_normal = models.Denuncia(
            cliente_id=cli.id,
            professional_id=prof["id"],
            motivo=models.DenunciaMotivo.SERVICO_NAO_REALIZADO.value,
            descricao="Relato comum sem símbolos especiais no texto.",
            status=models.DenunciaStatus.PENDENTE.value,
        )
        d_literal = models.Denuncia(
            cliente_id=cli.id,
            professional_id=prof["id"],
            motivo=models.DenunciaMotivo.COBRANCA_INDEVIDA.value,
            descricao="Cobrou taxa extra de 50% acima do combinado.",
            status=models.DenunciaStatus.PENDENTE.value,
        )
        db_session.add_all([d_normal, d_literal])
        db_session.commit()

        resp_pct = client.get(
            URL_ADMIN_DENUNCIAS, params={"q": "%"}, headers=headers_admin
        )
        assert resp_pct.status_code == 200
        assert [x["id"] for x in resp_pct.json()] == [d_literal.id]

        resp_sub = client.get(
            URL_ADMIN_DENUNCIAS, params={"q": "_"}, headers=headers_admin
        )
        assert resp_sub.status_code == 200
        assert resp_sub.json() == []


# ---------------------------------------------------------------------------
# Decisão de moderação (issue #99, Fatia 2)
# ---------------------------------------------------------------------------

URL_ADMIN_MODERAR = "/api/admin/denuncias/{id}/moderar"
URL_ADMINS_ALIAS_MODERAR = "/api/admins/denuncias/{id}/moderar"
URL_DENUNCIAS_ADMIN_MODERAR = "/api/denuncias/admin/{id}/moderar"

PARECER_VALIDO = "Relato confirmado pelo histórico de atendimento e mensagens."
SENHA_PROFISSIONAL = "SenhaForte@2026"

ACOES_VALIDAS = [
    "banimento",
    "aprovar_banimento",
    "suspender_profissional",
    "arquivamento",
    "arquivar",
    "rejeitar",
    "reativar_profissional",
]


def montar_cenario(client: TestClient, db_session, sufixo: str = "unico"):
    """
    Monta admin + cliente + profissional + denúncia pendente.

    Devolve `(admin, cliente, professional_resp, denuncia_resp)`.
    """
    admin = criar_admin_usuario(db_session, email=f"admin.{sufixo}@rentalspouse.com")
    cliente = criar_cliente(client, db_session, f"cliente.{sufixo}@exemplo.com", "987654321")
    profissional = criar_profissional(
        client, f"profissional.{sufixo}@exemplo.com", senha=SENHA_PROFISSIONAL
    )
    # Profissional aprovado: é o estado em que ele aparece no diretório público,
    # o que torna a busca de `GET /api/professionals` uma prova válida do ban.
    profissional_db = db_session.get(models.Professional, profissional["id"])
    profissional_db.approval_status = models.ProfessionalApprovalStatus.APPROVED.value
    db_session.commit()
    resp_denuncia = client.post(
        URL_DENUNCIAS,
        json=payload_denuncia(profissional["id"]),
        headers=cabecalho(cliente.email),
    )
    assert resp_denuncia.status_code == 201, resp_denuncia.text
    return admin, cliente, profissional, resp_denuncia.json()


def moderar(client: TestClient, denuncia_id: int, admin_email: str, **payload) -> object:
    """Dispara o PATCH de moderação com o token do administrador informado."""
    corpo = {"acao": "arquivar", "parecer": PARECER_VALIDO}
    corpo.update(payload)
    return client.patch(
        URL_ADMIN_MODERAR.format(id=denuncia_id),
        json=corpo,
        headers=cabecalho(admin_email, models.UserRole.ADMIN.value),
    )


class TestModeracaoDenuncias:
    """Cobertura de `PATCH /api/admin/denuncias/{id}/moderar` (issue #99, Fatia 2)."""

    @pytest.mark.parametrize(
        "url_template",
        [URL_ADMIN_MODERAR, URL_ADMINS_ALIAS_MODERAR, URL_DENUNCIAS_ADMIN_MODERAR],
    )
    def test_exige_autenticacao_e_bloqueia_nao_admin(
        self, client: TestClient, db_session, url_template: str
    ):
        admin, cliente, profissional, denuncia = montar_cenario(client, db_session)
        url = url_template.format(id=denuncia["id"])
        corpo = {"acao": "arquivar", "parecer": PARECER_VALIDO}

        assert client.patch(url, json=corpo).status_code == 401

        resp_cliente = client.patch(
            url, json=corpo, headers=cabecalho(cliente.email, models.UserRole.CLIENT.value)
        )
        assert resp_cliente.status_code == 403

        resp_prof = client.patch(
            url,
            json=corpo,
            headers=cabecalho(profissional["email"], models.UserRole.PROFESSIONAL.value),
        )
        assert resp_prof.status_code == 403

        admin_inativo = criar_admin_usuario(
            db_session, email="admin.inativo.moderacao@rentalspouse.com", is_active=False
        )
        resp_inativo = client.patch(
            url,
            json=corpo,
            headers=cabecalho(admin_inativo.email, models.UserRole.ADMIN.value),
        )
        assert resp_inativo.status_code == 401

        # Nenhuma tentativa bloqueada pode ter decidido a denúncia.
        denuncia_db = db_session.get(models.Denuncia, denuncia["id"])
        db_session.refresh(denuncia_db)
        assert denuncia_db.status == models.DenunciaStatus.PENDENTE.value

    def test_denuncia_inexistente_retorna_404(self, client: TestClient, db_session):
        admin = criar_admin_usuario(db_session)
        resp = moderar(client, 999999, admin.email)
        assert resp.status_code == 404
        assert "não encontrada" in resp.json()["detail"].lower()

    def test_payload_invalido_retorna_422(self, client: TestClient, db_session):
        admin, _, _, denuncia = montar_cenario(client, db_session)

        acao_invalida = moderar(client, denuncia["id"], admin.email, acao="explodir_plataforma")
        assert acao_invalida.status_code == 422

        parecer_curto = moderar(client, denuncia["id"], admin.email, parecer="curto")
        assert parecer_curto.status_code == 422

        sem_parecer = client.patch(
            URL_ADMIN_MODERAR.format(id=denuncia["id"]),
            json={"acao": "arquivar"},
            headers=cabecalho(admin.email, models.UserRole.ADMIN.value),
        )
        assert sem_parecer.status_code == 422

    @pytest.mark.parametrize("acao", ACOES_VALIDAS)
    def test_aceita_todos_os_aliases_de_acao(
        self, client: TestClient, db_session, acao: str
    ):
        """Valida no schema que cada alias da issue é aceito e normalizado."""
        payload = schemas.DenunciaModerarPayload(acao=acao, parecer=PARECER_VALIDO)
        assert payload.acao in {
            models.DenunciaModeracaoAcao.BANIMENTO.value,
            models.DenunciaModeracaoAcao.ARQUIVAMENTO.value,
            models.DenunciaModeracaoAcao.REATIVACAO.value,
        }

    def test_arquivamento_mantem_profissional_ativo_e_notifica_cliente(
        self, client: TestClient, db_session
    ):
        admin, cliente, profissional, denuncia = montar_cenario(client, db_session)

        resp = moderar(client, denuncia["id"], admin.email, acao="rejeitar")
        assert resp.status_code == 200, resp.text
        corpo = resp.json()

        assert corpo["status"] == models.DenunciaStatus.ARQUIVADA.value
        assert corpo["moderacao_acao"] == models.DenunciaModeracaoAcao.ARQUIVAMENTO.value
        assert corpo["moderacao_parecer"] == PARECER_VALIDO
        assert corpo["moderado_em"] is not None
        assert corpo["moderado_por_nome"] == admin.name
        assert corpo["professional_is_active"] is True

        db_session.expire_all()
        profissional_db = db_session.get(models.Professional, profissional["id"])
        assert profissional_db.is_active is True

        notificacao = (
            db_session.query(models.Notificacao)
            .filter(
                models.Notificacao.user_email == cliente.email,
                models.Notificacao.tipo == "denuncia_moderada",
                models.Notificacao.referencia_id == denuncia["id"],
            )
            .first()
        )
        assert notificacao is not None
        assert "arquivada" in notificacao.mensagem.lower()

        resumo = client.get(
            URL_ADMIN_RESUMO,
            headers=cabecalho(admin.email, models.UserRole.ADMIN.value),
        )
        assert resumo.status_code == 200
        assert resumo.json()["rejeitadas"] == 1
        assert resumo.json()["resolvidas_banimento"] == 0

    def test_banimento_desativa_contas_bloqueia_login_e_oculta_da_busca(
        self, client: TestClient, db_session
    ):
        admin, cliente, profissional, denuncia = montar_cenario(client, db_session)

        # Login inicial cria a linha sincronizada em `users`.
        login_antes = client.post(
            "/api/auth/login",
            json={"email": profissional["email"], "password": SENHA_PROFISSIONAL},
        )
        assert login_antes.status_code == 200, login_antes.text

        busca_antes = client.get("/api/professionals")
        assert busca_antes.status_code == 200
        assert profissional["id"] in [item["id"] for item in busca_antes.json()]

        resp = moderar(
            client,
            denuncia["id"],
            admin.email,
            acao="suspender_profissional",
            parecer="Denúncia procedente: cobrança indevida confirmada no histórico.",
        )
        assert resp.status_code == 200, resp.text
        corpo = resp.json()
        assert corpo["status"] == models.DenunciaStatus.RESOLVIDA.value
        assert corpo["moderacao_acao"] == models.DenunciaModeracaoAcao.BANIMENTO.value
        assert corpo["professional_is_active"] is False

        db_session.expire_all()
        profissional_db = db_session.get(models.Professional, profissional["id"])
        assert profissional_db.is_active is False

        conta_db = (
            db_session.query(models.User)
            .filter(models.User.email == profissional["email"])
            .first()
        )
        assert conta_db is not None
        assert conta_db.is_active is False

        busca_depois = client.get("/api/professionals")
        assert busca_depois.status_code == 200
        assert profissional["id"] not in [item["id"] for item in busca_depois.json()]

        login_depois = client.post(
            "/api/auth/login",
            json={"email": profissional["email"], "password": SENHA_PROFISSIONAL},
        )
        assert login_depois.status_code == 401
        assert login_depois.json()["detail"] == "Conta desativada"

        notificacao = (
            db_session.query(models.Notificacao)
            .filter(
                models.Notificacao.user_email == cliente.email,
                models.Notificacao.tipo == "denuncia_moderada",
                models.Notificacao.referencia_id == denuncia["id"],
            )
            .first()
        )
        assert notificacao is not None
        assert "procedente" in notificacao.mensagem.lower()

        resumo = client.get(
            URL_ADMIN_RESUMO,
            headers=cabecalho(admin.email, models.UserRole.ADMIN.value),
        )
        assert resumo.json()["resolvidas_banimento"] == 1

    def test_reativacao_reverte_banimento_e_devolve_denuncia_para_analise(
        self, client: TestClient, db_session
    ):
        admin, _, profissional, denuncia = montar_cenario(client, db_session)

        banimento = moderar(client, denuncia["id"], admin.email, acao="banimento")
        assert banimento.status_code == 200, banimento.text
        assert banimento.json()["professional_is_active"] is False

        resp = moderar(
            client,
            denuncia["id"],
            admin.email,
            acao="reativar_profissional",
            parecer="Revisão de recurso aceita: as provas apresentadas são insuficientes.",
        )
        assert resp.status_code == 200, resp.text
        corpo = resp.json()

        assert corpo["professional_is_active"] is True
        assert corpo["status"] == models.DenunciaStatus.EM_ANALISE.value
        assert corpo["moderacao_acao"] == models.DenunciaModeracaoAcao.REATIVACAO.value

        db_session.expire_all()
        profissional_db = db_session.get(models.Professional, profissional["id"])
        assert profissional_db.is_active is True

        conta_db = (
            db_session.query(models.User)
            .filter(models.User.email == profissional["email"])
            .first()
        )
        assert conta_db is not None
        assert conta_db.is_active is True

        busca = client.get("/api/professionals")
        assert profissional["id"] in [item["id"] for item in busca.json()]

        login = client.post(
            "/api/auth/login",
            json={"email": profissional["email"], "password": SENHA_PROFISSIONAL},
        )
        assert login.status_code == 200, login.text

        notificacao_prof = (
            db_session.query(models.Notificacao)
            .filter(
                models.Notificacao.user_email == profissional["email"],
                models.Notificacao.tipo == "conta_reativada",
                models.Notificacao.referencia_id == denuncia["id"],
            )
            .first()
        )
        assert notificacao_prof is not None

    def test_decisao_repetida_retorna_409(self, client: TestClient, db_session):
        admin, _, _, denuncia = montar_cenario(client, db_session)

        primeira = moderar(client, denuncia["id"], admin.email, acao="arquivar")
        assert primeira.status_code == 200

        segunda = moderar(client, denuncia["id"], admin.email, acao="banimento")
        assert segunda.status_code == 409

    def test_reativacao_sem_banimento_retorna_409(self, client: TestClient, db_session):
        admin, _, _, denuncia = montar_cenario(client, db_session)

        pendente = moderar(client, denuncia["id"], admin.email, acao="reativar")
        assert pendente.status_code == 409

        arquivamento = moderar(client, denuncia["id"], admin.email, acao="arquivar")
        assert arquivamento.status_code == 200

        apos_arquivar = moderar(client, denuncia["id"], admin.email, acao="reativar")
        assert apos_arquivar.status_code == 409

    def test_banimento_registra_auditoria_no_banco(
        self, client: TestClient, db_session
    ):
        admin, _, _, denuncia = montar_cenario(client, db_session)

        resp = moderar(client, denuncia["id"], admin.email, acao="aprovar_banimento")
        assert resp.status_code == 200, resp.text

        db_session.expire_all()
        denuncia_db = db_session.get(models.Denuncia, denuncia["id"])
        assert denuncia_db.moderado_por_id == admin.id
        assert denuncia_db.moderacao_parecer == PARECER_VALIDO
        assert denuncia_db.moderado_em is not None

        listagem = client.get(
            URL_ADMIN_DENUNCIAS,
            headers=cabecalho(admin.email, models.UserRole.ADMIN.value),
        )
        assert listagem.status_code == 200
        item = next(x for x in listagem.json() if x["id"] == denuncia["id"])
        assert item["moderado_por_nome"] == admin.name
        assert item["moderacao_acao"] == models.DenunciaModeracaoAcao.BANIMENTO.value

    def test_reativacao_mantem_banimento_enquanto_houver_outra_denuncia_procedente(
        self, client: TestClient, db_session
    ):
        """
        Com duas denúncias resolvidas por banimento contra o mesmo profissional:
        - reverter apenas a primeira devolve essa denúncia para `em_analise`, mas
          mantém `is_active=False` (busca e login seguem bloqueados) sem deadlock 409;
        - somente ao reverter também a segunda denúncia a conta volta a ficar ativa.
        """
        admin, cliente1, profissional, d1 = montar_cenario(
            client, db_session, sufixo="duplo"
        )
        cliente2 = criar_cliente(
            client, db_session, "cliente2.duplo@exemplo.com", "123987456"
        )
        resp_d2 = client.post(
            URL_DENUNCIAS,
            json=payload_denuncia(
                profissional["id"],
                motivo=models.DenunciaMotivo.COBRANCA_INDEVIDA.value,
            ),
            headers=cabecalho(cliente2.email),
        )
        assert resp_d2.status_code == 201, resp_d2.text
        d2 = resp_d2.json()

        ban1 = moderar(client, d1["id"], admin.email, acao="banimento")
        ban2 = moderar(client, d2["id"], admin.email, acao="banimento")
        assert ban1.status_code == 200 and ban2.status_code == 200

        # Reverte apenas d1: d2 segue resolvida/banimento, logo o profissional continua suspenso
        rev1 = moderar(
            client,
            d1["id"],
            admin.email,
            acao="reativacao",
            parecer="Recurso aceito apenas quanto ao primeiro relato analisado.",
        )
        assert rev1.status_code == 200, rev1.text
        assert rev1.json()["status"] == models.DenunciaStatus.EM_ANALISE.value
        assert rev1.json()["moderacao_acao"] == models.DenunciaModeracaoAcao.REATIVACAO.value
        assert rev1.json()["professional_is_active"] is False

        db_session.expire_all()
        prof_db = db_session.get(models.Professional, profissional["id"])
        assert prof_db.is_active is False
        d2_db = db_session.get(models.Denuncia, d2["id"])
        assert d2_db.status == models.DenunciaStatus.RESOLVIDA.value
        assert d2_db.moderacao_acao == models.DenunciaModeracaoAcao.BANIMENTO.value

        busca_ainda_bloqueada = client.get("/api/professionals")
        assert profissional["id"] not in [
            item["id"] for item in busca_ainda_bloqueada.json()
        ]
        login_ainda_bloqueado = client.post(
            "/api/auth/login",
            json={"email": profissional["email"], "password": SENHA_PROFISSIONAL},
        )
        assert login_ainda_bloqueado.status_code == 401

        notif_prematura = (
            db_session.query(models.Notificacao)
            .filter(
                models.Notificacao.user_email == profissional["email"],
                models.Notificacao.tipo == "conta_reativada",
            )
            .first()
        )
        assert notif_prematura is None

        # Agora reverte também d2: sem banimentos restantes, a conta é reabilitada
        rev2 = moderar(
            client,
            d2["id"],
            admin.email,
            acao="reativacao",
            parecer="Segundo relato também revisto após comprovação documental.",
        )
        assert rev2.status_code == 200, rev2.text
        assert rev2.json()["status"] == models.DenunciaStatus.EM_ANALISE.value
        assert rev2.json()["professional_is_active"] is True

        busca_liberada = client.get("/api/professionals")
        assert profissional["id"] in [item["id"] for item in busca_liberada.json()]
        login_liberado = client.post(
            "/api/auth/login",
            json={"email": profissional["email"], "password": SENHA_PROFISSIONAL},
        )
        assert login_liberado.status_code == 200, login_liberado.text

        notif_final = (
            db_session.query(models.Notificacao)
            .filter(
                models.Notificacao.user_email == profissional["email"],
                models.Notificacao.tipo == "conta_reativada",
                models.Notificacao.referencia_id == d2["id"],
            )
            .first()
        )
        assert notif_final is not None
