"""
Testes automatizados para as rotas de autenticação:
- POST /api/auth/login
- GET /api/auth/me
Utiliza o banco SQLite em memória via conftest.py.
"""

from fastapi.testclient import TestClient


def cadastrar_cliente_auxiliar(client: TestClient, email: str = "maria.silva@exemplo.com", senha: str = "SenhaForte123"):
    """Cadastra um cliente diretamente via API de clientes para testar o login."""
    payload = {
        "nome": "Maria da Silva",
        "email": email,
        "cpf": "12345678909",
        "data_nascimento": "1992-08-15",
        "senha": senha,
        "confirmar_senha": senha,
        "endereco": {
            "cep": "01001000",
            "logradouro": "Praça da Sé",
            "numero": "50",
            "complemento": None,
            "bairro": "Sé",
            "cidade": "São Paulo",
            "estado": "SP",
        },
    }
    return client.post("/api/clientes", json=payload)


class TestAuthLogin:
    """Testes da rota POST /api/auth/login e verificação do token em /api/auth/me."""

    def test_login_sucesso_e_validacao_me(self, client: TestClient):
        """Deve autenticar com sucesso cliente com credenciais corretas e validar sessão em /me."""
        res_cad = cadastrar_cliente_auxiliar(client, email="cliente.login@exemplo.com", senha="SenhaSegura@2026")
        assert res_cad.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "cliente.login@exemplo.com", "senha": "SenhaSegura@2026"},
        )

        assert login_res.status_code == 200
        dados = login_res.json()
        assert "access_token" in dados
        assert "token_acesso" in dados
        assert dados["access_token"] is not None
        assert dados["token_type"] == "bearer"
        assert dados["tipo_token"] == "bearer"
        assert dados["usuario"]["email"] == "cliente.login@exemplo.com"
        assert dados["usuario"]["nome"] == "Maria da Silva"
        assert dados["usuario"]["tipo"] == "client"

        # Validação do token no servidor através de GET /api/auth/me
        headers = {"Authorization": f"Bearer {dados['access_token']}"}
        res_me = client.get("/api/auth/me", headers=headers)
        assert res_me.status_code == 200
        me_dados = res_me.json()
        assert me_dados["email"] == "cliente.login@exemplo.com"
        assert me_dados["role"] == "client"
        assert me_dados["name"] == "Maria da Silva"

    def test_login_com_campo_password_em_vez_de_senha(self, client: TestClient):
        """Suporta payload com 'password' (convenção REST/OpenAPI) ou 'senha'."""
        cadastrar_cliente_auxiliar(client, email="alias.teste@exemplo.com", senha="SenhaSegura@2026")

        login_res = client.post(
            "/api/auth/login",
            json={"email": "alias.teste@exemplo.com", "password": "SenhaSegura@2026"},
        )
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()

    def test_login_email_case_insensitive(self, client: TestClient):
        """E-mail digitado com maiúsculas deve autenticar normalmente."""
        cadastrar_cliente_auxiliar(client, email="case.teste@exemplo.com", senha="SenhaSegura@2026")

        login_res = client.post(
            "/api/auth/login",
            json={"email": "CASE.Teste@Exemplo.COM", "senha": "SenhaSegura@2026"},
        )
        assert login_res.status_code == 200
        assert login_res.json()["usuario"]["email"] == "case.teste@exemplo.com"

    def test_login_senha_incorreta_retorna_401(self, client: TestClient):
        """Senha incorreta deve retornar HTTP 401 Unauthorized."""
        cadastrar_cliente_auxiliar(client, email="senha.errada@exemplo.com", senha="SenhaCorreta123")

        login_res = client.post(
            "/api/auth/login",
            json={"email": "senha.errada@exemplo.com", "senha": "SenhaIncorreta999"},
        )
        assert login_res.status_code == 401
        assert "Credenciais inválidas" in login_res.json()["detail"]

    def test_login_usuario_inexistente_retorna_401(self, client: TestClient):
        """E-mail não cadastrado deve retornar HTTP 401 Unauthorized."""
        login_res = client.post(
            "/api/auth/login",
            json={"email": "naoexiste@exemplo.com", "senha": "QualquerSenha123"},
        )
        assert login_res.status_code == 401
        assert "Credenciais inválidas" in login_res.json()["detail"]

    def test_login_dados_vazios_retorna_422(self, client: TestClient):
        """Payload com campos vazios deve retornar HTTP 422 Unprocessable Entity."""
        res_vazio = client.post("/api/auth/login", json={"email": "", "senha": ""})
        assert res_vazio.status_code == 422

    def test_login_sem_campos_obrigatorios_retorna_422(self, client: TestClient):
        """Payload faltando campos obrigatórios deve retornar 422."""
        res = client.post("/api/auth/login", json={"email": "teste@exemplo.com"})
        assert res.status_code == 422
