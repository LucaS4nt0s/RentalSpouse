"""
Testes da localização pt-BR das mensagens de erro da API (issue #100, Fatia 1).

Cobrem:
- Erros de validação do Pydantic v2 / FastAPI (HTTP 422) traduzidos;
- Erros HTTP padrão (401, 403, 404, 405, 500) em português;
- Preservação da sanitização PCI-DSS/LGPD nos 422 de `/api/pagamentos`;
- Garantia de que nenhuma mensagem padrão em inglês vaza para o cliente.
"""

from datetime import date
import uuid

import pytest
from fastapi.testclient import TestClient

import models
from main import app
from security import create_access_token, hash_senha
from tests.conftest import TestingSessionLocal

# Trechos em inglês que nunca devem aparecer em respostas de erro da API.
PADROES_INGLES_PROIBIDOS = (
    "Field required",
    "Input should",
    "String should",
    "List should",
    "Value error",
    "valid email address",
    "Not Found",
    "Method Not Allowed",
    "Not authenticated",
    "Internal Server Error",
    "too short",
)

CLIENTE_INVALIDO = {
    "nome": "Joao Silva",
    "email": "nao-email",
    "cpf": "12345678901",
    "data_nascimento": "1990-01-01",
    "senha": "senha123",
    "confirmar_senha": "senha123",
    "endereco": {
        "cep": "12345678",
        "logradouro": "Rua Teste",
        "numero": "1",
        "bairro": "Centro",
        "cidade": "São Paulo",
        "estado": "SP",
    },
}

PROFISSIONAL_INVALIDO = {
    "name": "A",
    "email": "a@b.com",
    "bio": "curta",
    "service_radius_km": 0,
    "specialties": [],
}


def _assert_sem_ingles(texto: str) -> None:
    """Falha se qualquer padrão de mensagem em inglês aparecer na resposta."""
    for padrao in PADROES_INGLES_PROIBIDOS:
        assert padrao not in texto, f"Mensagem em inglês vazou: {padrao!r} em {texto!r}"


def _mensagens(resposta) -> str:
    """Concatena todas as mensagens de um corpo de erro 422."""
    corpo = resposta.json()
    detalhe = corpo.get("detail")
    if isinstance(detalhe, list):
        return " ".join(str(item.get("msg", item)) for item in detalhe)
    return str(detalhe)


@pytest.fixture
def admin_headers() -> dict:
    """Administrador ativo com token válido, para alcançar a validação de corpo."""
    db = TestingSessionLocal()
    try:
        user = models.User(
            name="Admin Localização",
            email="admin.localizacao@rentalspouse.com",
            hashed_password=hash_senha("MasterAdmin@123"),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db.add(user)
        db.commit()
        token = create_access_token(data={"sub": user.email, "role": user.role})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


@pytest.fixture
def cliente_headers() -> dict:
    """Usuário comum (não admin) para validar a mensagem de 403."""
    db = TestingSessionLocal()
    try:
        user = models.User(
            name="Cliente Comum",
            email="cliente.localizacao@exemplo.com",
            hashed_password=hash_senha("Cliente@123"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db.add(user)
        db.commit()
        token = create_access_token(data={"sub": user.email, "role": user.role})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def _seed_para_pagamento(db_session) -> dict:
    """Cria profissional, cliente e orçamento aceito para exercitar /api/pagamentos."""
    profissional = models.Professional(
        name="Carlos Eletricista",
        email="carlos.localizacao@rentalspouse.com",
        phone="11999990000",
        bio="Eletricista residencial especializado em quadros e tomadas.",
        service_radius_km=15.0,
        specialties=["Elétrica"],
        city="São Paulo",
        state="SP",
        senha_hash="hash_teste",
        is_active=True,
        approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
    )
    cliente = models.Cliente(
        nome="Mariana Ferreira",
        email="mariana.localizacao@cliente.com",
        cpf="52998224725",
        data_nascimento=date(1992, 5, 14),
        senha_hash="hash_teste",
        cep="01001000",
        logradouro="Praça da Sé",
        numero="100",
        bairro="Sé",
        cidade="São Paulo",
        estado="SP",
        email_verificado=True,
    )
    db_session.add_all([profissional, cliente])
    db_session.commit()
    db_session.refresh(profissional)
    db_session.refresh(cliente)

    orcamento = models.Orcamento(
        cliente_id=cliente.id,
        cliente_nome=cliente.nome,
        cliente_email=cliente.email,
        professional_id=profissional.id,
        descricao="Instalação de disjuntor DR e tomada 20A na cozinha.",
        status="aceito",
        valor_estimado=250.0,
    )
    db_session.add(orcamento)
    db_session.commit()
    db_session.refresh(orcamento)

    token = create_access_token(
        {"sub": cliente.email, "role": models.UserRole.CLIENT.value, "user_id": cliente.id}
    )
    return {
        "orcamento": orcamento,
        "headers": {"Authorization": f"Bearer {token}"},
    }


class TestErrosDeValidacaoEmPortugues:
    """Erros 422 do Pydantic v2 devem chegar ao cliente em português claro."""

    def test_campo_obrigatorio(self, client: TestClient):
        """Corpo vazio deve apontar cada campo obrigatório em português."""
        resposta = client.post("/api/clientes", json={})

        assert resposta.status_code == 422
        detalhe = resposta.json()["detail"]
        assert detalhe, "O erro 422 deve continuar listando as validações"
        assert all(item["msg"] == "Este campo é obrigatório." for item in detalhe)
        _assert_sem_ingles(resposta.text)

    def test_texto_curto_valor_minimo_e_lista_vazia(self, client: TestClient):
        """`min_length`, `ge` e `too_short` devem citar os limites em português."""
        resposta = client.post("/api/professionals", json=PROFISSIONAL_INVALIDO)

        assert resposta.status_code == 422
        mensagens = _mensagens(resposta)
        assert "O texto deve ter pelo menos 2 caracteres." in mensagens
        assert "O texto deve ter pelo menos 10 caracteres." in mensagens
        assert "O valor deve ser maior ou igual a 1.0." in mensagens
        assert "Informe pelo menos 1 item(ns)." in mensagens
        _assert_sem_ingles(resposta.text)

    def test_inteiro_invalido_no_path(self, client: TestClient):
        """Path param não numérico deve informar o formato esperado em português."""
        resposta = client.get("/api/orcamentos/abc")

        assert resposta.status_code == 422
        assert "Informe um número inteiro válido." in _mensagens(resposta)
        _assert_sem_ingles(resposta.text)

    def test_parametros_de_query_fora_do_limite(self, client: TestClient):
        """`le`/`ge` de query params devem citar o limite em português."""
        resposta_limite = client.get("/api/professionals?limit=999")
        resposta_negativo = client.get("/api/professionals?skip=-1")

        assert resposta_limite.status_code == 422
        assert "O valor deve ser menor ou igual a 50." in _mensagens(resposta_limite)
        assert resposta_negativo.status_code == 422
        assert "O valor deve ser maior ou igual a 0." in _mensagens(resposta_negativo)
        _assert_sem_ingles(resposta_limite.text)
        _assert_sem_ingles(resposta_negativo.text)

    def test_email_invalido_do_pydantic(self, client: TestClient, admin_headers: dict):
        """`EmailStr` (mensagem nativa em inglês) deve ser traduzido."""
        resposta = client.post(
            "/api/admins",
            json={
                "name": "Novo Admin",
                "email": "sem-arroba",
                "password": "SenhaForte@2026",
            },
            headers=admin_headers,
        )

        assert resposta.status_code == 422
        assert "Informe um endereço de e-mail válido." in _mensagens(resposta)
        _assert_sem_ingles(resposta.text)

    def test_validador_customizado_permanece_em_portugues(self, client: TestClient):
        """Mensagens de domínio não podem ganhar o prefixo `Value error, `."""
        resposta = client.post("/api/clientes", json=CLIENTE_INVALIDO)

        assert resposta.status_code == 422
        mensagens = _mensagens(resposta)
        assert "E-mail com formato inválido." in mensagens
        assert "Dígito verificador do CPF inválido." in mensagens
        assert not any("Value error" in item["msg"] for item in resposta.json()["detail"])
        _assert_sem_ingles(resposta.text)

    def test_json_invalido(self, client: TestClient):
        """Corpo malformado deve gerar mensagem amigável, não `JSON decode error`."""
        resposta = client.post(
            "/api/clientes",
            content=b"{nao-json",
            headers={"Content-Type": "application/json"},
        )

        assert resposta.status_code == 422
        assert "O corpo da requisição não é um JSON válido." in _mensagens(resposta)
        _assert_sem_ingles(resposta.text)


class TestErrosHttpEmPortugues:
    """Respostas padrão do FastAPI/Starlette traduzidas sem alterar o domínio."""

    def test_404_recurso_inexistente(self, client: TestClient):
        resposta = client.get("/api/rota-que-nao-existe")

        assert resposta.status_code == 404
        assert resposta.json() == {"detail": "Recurso não encontrado."}
        _assert_sem_ingles(resposta.text)

    def test_405_metodo_nao_permitido(self, client: TestClient):
        resposta = client.delete("/api/hello")

        assert resposta.status_code == 405
        assert resposta.json() == {
            "detail": "Método HTTP não permitido para este recurso."
        }
        _assert_sem_ingles(resposta.text)

    def test_401_preserva_mensagem_de_dominio(self, client: TestClient):
        resposta = client.post(
            "/api/admins",
            json={"name": "X", "email": "x@exemplo.com", "password": "SenhaForte@2026"},
        )

        assert resposta.status_code == 401
        assert resposta.json()["detail"] == "Token de autenticação não fornecido"
        assert resposta.headers.get("www-authenticate") == "Bearer"
        _assert_sem_ingles(resposta.text)

    def test_403_preserva_mensagem_de_dominio(
        self, client: TestClient, cliente_headers: dict
    ):
        resposta = client.post(
            "/api/admins",
            json={"name": "Invasor", "email": "invasor@exemplo.com", "password": "SenhaForte@2026"},
            headers=cliente_headers,
        )

        assert resposta.status_code == 403
        assert "permissão de administrador necessária" in resposta.json()["detail"]
        _assert_sem_ingles(resposta.text)

    def test_500_nao_vaza_texto_em_ingles_nem_stack_trace(self):
        """Falhas internas devolvem JSON em português, sem detalhes técnicos."""

        async def falha_proposital():
            raise RuntimeError("boom interno")

        rotas_originais = list(app.router.routes)
        app.add_api_route("/api/_teste/erro-interno", falha_proposital, methods=["GET"])
        try:
            cliente = TestClient(app, raise_server_exceptions=False)
            resposta = cliente.get("/api/_teste/erro-interno")
        finally:
            app.router.routes = rotas_originais
            app.openapi_schema = None

        assert resposta.status_code == 500
        assert resposta.json() == {
            "detail": "Erro interno no servidor. Tente novamente mais tarde."
        }
        assert "boom interno" not in resposta.text
        assert "Traceback" not in resposta.text
        _assert_sem_ingles(resposta.text)


class TestSanitizacaoPciPreservada:
    """A tradução não pode reintroduzir o eco de PAN/CVV (PCI-DSS/LGPD)."""

    def test_422_de_pagamento_nao_ecoa_dados_do_cartao(
        self, client: TestClient, db_session
    ):
        contexto = _seed_para_pagamento(db_session)

        resposta = client.post(
            "/api/pagamentos",
            headers=contexto["headers"],
            json={
                "orcamento_id": contexto["orcamento"].id,
                "metodo": "cartao_credito",
                "parcelas": 1,
                "idempotency_key": str(uuid.uuid4()),
                "cartao": {
                    "card_token": "tok_valido_12345678",
                    "payment_method_id": "visa",
                    "nome_titular": "MARIANA FERREIRA",
                    "cpf_titular": "52998224725",
                    "numero_cartao": "4111111111111234",
                    "cvv": "123",
                },
            },
        )

        assert resposta.status_code == 422
        assert "4111111111111234" not in resposta.text
        assert '"input"' not in resposta.text
        for erro in resposta.json()["detail"]:
            assert "input" not in erro
            assert "ctx" not in erro
            assert erro["msg"].strip(), "Toda validação deve ter mensagem"
        _assert_sem_ingles(resposta.text)
