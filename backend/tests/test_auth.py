"""
Testes automatizados para as rotas de autenticação:
- POST /api/auth/login
- GET /api/auth/me
Utiliza o banco SQLite em memória via conftest.py.
"""

from fastapi.testclient import TestClient


from database import SessionLocal
import models


def cadastrar_cliente_auxiliar(
    client: TestClient,
    email: str = "maria.silva@exemplo.com",
    senha: str = "SenhaForte123",
    verificado: bool = True,
):
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
    res = client.post("/api/clientes", json=payload)
    if res.status_code == 201 and verificado:
        db = SessionLocal()
        try:
            cliente = db.query(models.Cliente).filter(models.Cliente.email == email.strip().lower()).first()
            if cliente is not None:
                cliente.email_verificado = True
                db.commit()
        finally:
            db.close()
    return res


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
        assert dados["usuario"]["tipo"] == "cliente"
        assert dados["usuario"]["role"] == "client"

        # Validação do token no servidor através de GET /api/auth/me
        headers = {"Authorization": f"Bearer {dados['access_token']}"}
        res_me = client.get("/api/auth/me", headers=headers)
        assert res_me.status_code == 200
        me_dados = res_me.json()
        assert me_dados["email"] == "cliente.login@exemplo.com"
        assert me_dados["role"] == "client"
        assert me_dados["tipo"] == "cliente"
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

    def test_login_cliente_email_nao_verificado_retorna_403(self, client: TestClient):
        """Cliente com e-mail não confirmado deve receber HTTP 403 Forbidden ao tentar logar."""
        res_cad = cadastrar_cliente_auxiliar(
            client,
            email="pendente.verificacao@exemplo.com",
            senha="SenhaForte123",
            verificado=False,
        )
        assert res_cad.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "pendente.verificacao@exemplo.com", "senha": "SenhaForte123"},
        )
        assert login_res.status_code == 403
        assert "E-mail pendente de confirmação" in login_res.json()["detail"]

    def test_login_cliente_email_nao_verificado_com_senha_errada_retorna_401(self, client: TestClient):
        """Mesmo com e-mail não verificado, senha incorreta deve retornar 401 para evitar enumeração."""
        res_cad = cadastrar_cliente_auxiliar(
            client,
            email="senha.errada.pendente@exemplo.com",
            senha="SenhaForte123",
            verificado=False,
        )
        assert res_cad.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "senha.errada.pendente@exemplo.com", "senha": "SenhaIncorreta999"},
        )
        assert login_res.status_code == 401
        assert "Credenciais inválidas" in login_res.json()["detail"]

    def test_login_cliente_na_tabela_users_com_email_pendente_retorna_403(self, client: TestClient):
        """Se o usuário já existe na tabela users mas seu e-mail foi desmarcado na tabela clientes, bloqueia com 403."""
        cadastrar_cliente_auxiliar(
            client,
            email="revertido@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        # Primeiro login com sucesso para sincronizar em users
        res_ok = client.post(
            "/api/auth/login",
            json={"email": "revertido@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_ok.status_code == 200

        # Simula revogação/pendência de verificação no banco
        db = SessionLocal()
        try:
            cli = db.query(models.Cliente).filter(models.Cliente.email == "revertido@exemplo.com").first()
            cli.email_verificado = False
            db.commit()
        finally:
            db.close()

        # Próximo login deve ser barrado com 403
        res_bloqueado = client.post(
            "/api/auth/login",
            json={"email": "revertido@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_bloqueado.status_code == 403
        assert "E-mail pendente de confirmação" in res_bloqueado.json()["detail"]

    def test_login_conta_desativada_retorna_401(self, client: TestClient):
        """Usuário com is_active=False não pode logar."""
        cadastrar_cliente_auxiliar(
            client,
            email="desativado@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        # Login inicial para sincronizar na tabela users
        res_ok = client.post(
            "/api/auth/login",
            json={"email": "desativado@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_ok.status_code == 200

        # Desativa o usuário na tabela users
        db = SessionLocal()
        try:
            usr = db.query(models.User).filter(models.User.email == "desativado@exemplo.com").first()
            usr.is_active = False
            db.commit()
        finally:
            db.close()

        # Próximo login deve retornar 401 Conta desativada
        res_desativado = client.post(
            "/api/auth/login",
            json={"email": "desativado@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_desativado.status_code == 401
        assert "Conta desativada" in res_desativado.json()["detail"]

    def test_get_current_user_leitura_pura_sem_inserir_em_users(self, client: TestClient):
        """get_current_user não deve persistir nada na tabela users ao autenticar token de cliente."""
        from security import create_access_token
        cadastrar_cliente_auxiliar(
            client,
            email="token.puro@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        # Gera o token diretamente sem passar pelo endpoint de login
        token = create_access_token(data={"sub": "token.puro@exemplo.com", "role": "client"})

        # Garante que a tabela users NÃO possui o registro antes do GET /api/auth/me
        db = SessionLocal()
        try:
            assert db.query(models.User).filter(models.User.email == "token.puro@exemplo.com").first() is None
        finally:
            db.close()

        # Requisição GET /api/auth/me
        res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_me.status_code == 200
        assert res_me.json()["email"] == "token.puro@exemplo.com"

        # Garante que a tabela users CONTINUA SEM o registro (pura leitura, sem db.commit)
        db = SessionLocal()
        try:
            assert db.query(models.User).filter(models.User.email == "token.puro@exemplo.com").first() is None
        finally:
            db.close()
