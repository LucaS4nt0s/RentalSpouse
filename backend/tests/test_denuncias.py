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


def criar_profissional(client: TestClient, email: str) -> dict:
    """Cria um profissional ativo pelo endpoint público."""
    payload = dict(SAMPLE_PROF)
    payload["email"] = email
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
