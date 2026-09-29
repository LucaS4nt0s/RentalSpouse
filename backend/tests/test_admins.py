import pytest
from fastapi.testclient import TestClient

import models
from security import create_access_token, hash_senha, seed_initial_admin
from tests.conftest import TestingSessionLocal


@pytest.fixture
def admin_user():
    """Cria um administrador inicial no banco de testes e gera seu token."""
    db = TestingSessionLocal()
    try:
        user = models.User(
            name="Admin Master",
            email="admin.master@rentalspouse.com",
            hashed_password=hash_senha("MasterAdmin@123"),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(data={"sub": user.email, "role": user.role})
        return {"user": user, "token": token, "headers": {"Authorization": f"Bearer {token}"}}
    finally:
        db.close()


@pytest.fixture
def regular_user():
    """Cria um usuário comum (não admin) para validar a camada de autorização."""
    db = TestingSessionLocal()
    try:
        user = models.User(
            name="Cliente Comum",
            email="cliente@exemplo.com",
            hashed_password=hash_senha("Cliente@123"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(data={"sub": user.email, "role": user.role})
        return {"user": user, "token": token, "headers": {"Authorization": f"Bearer {token}"}}
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Suíte de Testes da Issue #37: Cadastro e Segurança de Administradores
# ---------------------------------------------------------------------------


class TestAdminRegistration:
    """Testes para o endpoint POST /api/admins."""

    def test_admin_can_successfully_register_new_admin(self, client: TestClient, admin_user: dict):
        """Um administrador autenticado deve conseguir cadastrar um novo administrador com sucesso."""
        payload = {
            "name": "Novo Administrador",
            "email": "novo.admin@rentalspouse.com",
            "password": "SenhaForte@2026",
        }

        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 201

        data = response.json()
        assert data["id"] is not None
        assert data["name"] == "Novo Administrador"
        assert data["email"] == "novo.admin@rentalspouse.com"
        assert data["role"] == "admin"
        assert data["is_active"] is True
        assert "password" not in data
        assert "hashed_password" not in data

    def test_unauthenticated_request_is_rejected_with_401(self, client: TestClient):
        """Requisições sem cabeçalho Authorization devem ser rejeitadas com 401 Unauthorized."""
        payload = {
            "name": "Admin Sem Token",
            "email": "semtoken@rentalspouse.com",
            "password": "SenhaForte@2026",
        }

        response = client.post("/api/admins", json=payload)
        assert response.status_code == 401
        assert "Token de autenticação não fornecido" in response.json()["detail"]

    def test_invalid_token_is_rejected_with_401(self, client: TestClient):
        """Requisição com token corrompido ou inválido deve ser rejeitada com 401 Unauthorized."""
        payload = {
            "name": "Admin Token Invalido",
            "email": "tokeninvalido@rentalspouse.com",
            "password": "SenhaForte@2026",
        }
        headers = {"Authorization": "Bearer token_completamente_invalido_xyz"}

        response = client.post("/api/admins", json=payload, headers=headers)
        assert response.status_code == 401
        assert "Token de autenticação inválido" in response.json()["detail"]

    def test_non_admin_user_is_forbidden_with_403(self, client: TestClient, regular_user: dict):
        """
        Camada de segurança: garante que o adm é adm.
        Usuário com papel diferente de 'admin' deve receber 403 Forbidden.
        """
        payload = {
            "name": "Tentativa Invasora",
            "email": "invasor@rentalspouse.com",
            "password": "SenhaForte@2026",
        }

        response = client.post("/api/admins", json=payload, headers=regular_user["headers"])
        assert response.status_code == 403
        assert "permissão de administrador necessária" in response.json()["detail"]

    def test_duplicate_email_is_rejected_with_409(self, client: TestClient, admin_user: dict):
        """Não deve permitir cadastrar administrador com e-mail já existente no sistema (HTTP 409 Conflict)."""
        payload = {
            "name": "Duplicado",
            "email": admin_user["user"].email,
            "password": "OutraSenha@123",
        }

        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 409
        assert "Já existe um usuário cadastrado com este e-mail" in response.json()["detail"]

    def test_short_password_is_rejected_with_422(self, client: TestClient, admin_user: dict):
        """Senhas com menos de 8 caracteres devem ser rejeitadas pela validação Pydantic."""
        payload = {
            "name": "Senha Curta",
            "email": "curta@rentalspouse.com",
            "password": "123",
        }

        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 422

    def test_invalid_email_format_is_rejected_with_422(self, client: TestClient, admin_user: dict):
        """Formato de e-mail inválido deve ser rejeitado pela validação Pydantic."""
        payload = {
            "name": "Email Invalido",
            "email": "email_invalido_sem_arroba",
            "password": "SenhaForte@2026",
        }

        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 422

    def test_admin_registration_normalizes_email(self, client: TestClient, admin_user: dict):
        """O e-mail cadastrado deve ser normalizado para minúsculas."""
        payload = {
            "name": "Admin Upper",
            "email": "Novo.Admin.Upper@RentalSpouse.COM",
            "password": "SenhaForte@2026",
        }
        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 201
        assert response.json()["email"] == "novo.admin.upper@rentalspouse.com"

    def test_duplicate_email_case_insensitive_rejected(self, client: TestClient, admin_user: dict):
        """Tentativa de cadastrar e-mail já existente com casing diferente deve retornar 409 Conflict."""
        payload = {
            "name": "Duplicado Casing",
            "email": admin_user["user"].email.upper(),
            "password": "OutraSenha@123",
        }
        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 409
        assert "Já existe um usuário cadastrado com este e-mail" in response.json()["detail"]

    def test_duplicate_email_concurrency_integrity_error(self, client: TestClient, admin_user: dict, monkeypatch):
        """Simula condição de corrida onde o commit dispara IntegrityError."""
        from sqlalchemy.exc import IntegrityError

        def mock_commit(*args, **kwargs):
            raise IntegrityError("mock unique constraint", orig=Exception("unique"), params={})

        monkeypatch.setattr("sqlalchemy.orm.Session.commit", mock_commit)

        payload = {
            "name": "Admin Concorrente",
            "email": "concorrente@rentalspouse.com",
            "password": "SenhaForte@2026",
        }
        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 409
        assert "Já existe um usuário cadastrado com este e-mail" in response.json()["detail"]



class TestAdminListAndLogin:
    """Testes para listagem de administradores e fluxo de autenticação."""

    def test_admin_can_list_all_admins(self, client: TestClient, admin_user: dict):
        """Administrador autenticado pode listar os administradores existentes."""
        response = client.get("/api/admins", headers=admin_user["headers"])
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(item["email"] == admin_user["user"].email for item in data)

    def test_newly_registered_admin_can_login(self, client: TestClient, admin_user: dict):
        """O novo administrador cadastrado deve conseguir realizar login e obter um token JWT."""
        # 1. Cadastra o novo admin
        payload_create = {
            "name": "Admin Secundário",
            "email": "secundario@rentalspouse.com",
            "password": "SenhaSegura@2026",
        }
        res_create = client.post("/api/admins", json=payload_create, headers=admin_user["headers"])
        assert res_create.status_code == 201

        # 2. Faz login com o novo admin
        login_payload = {
            "email": "secundario@rentalspouse.com",
            "password": "SenhaSegura@2026",
        }
        res_login = client.post("/api/auth/login", json=login_payload)
        assert res_login.status_code == 200
        token_data = res_login.json()
        assert "access_token" in token_data
        assert token_data["token_type"] == "bearer"

        # 3. O novo admin usa seu próprio token para acessar a API protegida
        new_admin_headers = {"Authorization": f"Bearer {token_data['access_token']}"}
        res_me = client.get("/api/auth/me", headers=new_admin_headers)
        assert res_me.status_code == 200
        assert res_me.json()["email"] == "secundario@rentalspouse.com"
        assert res_me.json()["role"] == "admin"

    def test_login_with_wrong_password_fails(self, client: TestClient, admin_user: dict):
        """Tentativa de login com senha incorreta deve retornar 401 Unauthorized."""
        login_payload = {
            "email": admin_user["user"].email,
            "password": "SenhaTotalmenteIncorreta",
        }
        response = client.post("/api/auth/login", json=login_payload)
        assert response.status_code == 401
        assert "Credenciais inválidas" in response.json()["detail"]

    def test_login_is_case_insensitive(self, client: TestClient, admin_user: dict):
        """Login com e-mail em maiúsculas deve autenticar com sucesso."""
        login_payload = {
            "email": admin_user["user"].email.upper(),
            "password": "MasterAdmin@123",
        }
        response = client.post("/api/auth/login", json=login_payload)
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_inactive_user_cannot_login(self, client: TestClient):
        """Tentativa de login por usuário desativado deve retornar 401 Conta desativada."""
        db = TestingSessionLocal()
        try:
            inactive_user = models.User(
                name="Usuario Inativo",
                email="inativo@rentalspouse.com",
                hashed_password=hash_senha("SenhaInativo@123"),
                role=models.UserRole.ADMIN.value,
                is_active=False,
            )
            db.add(inactive_user)
            db.commit()
        finally:
            db.close()

        login_payload = {
            "email": "inativo@rentalspouse.com",
            "password": "SenhaInativo@123",
        }
        response = client.post("/api/auth/login", json=login_payload)
        assert response.status_code == 401
        assert "Conta desativada" in response.json()["detail"]


class TestUserModelAndSecurity:
    """Validações do modelo User e funções de segurança."""

    def test_user_model_default_role_is_client(self):
        """Pelo princípio do menor privilégio, uma nova instância de User deve ter default role 'client'."""
        db = TestingSessionLocal()
        try:
            user = models.User(
                name="Usuario Sem Role",
                email="semrole@rentalspouse.com",
                hashed_password="hash_qualquer",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            assert user.role == models.UserRole.CLIENT.value
        finally:
            db.close()

    def test_seed_initial_admin_creates_admin_when_table_empty(self):
        """seed_initial_admin deve criar um admin inicial se a tabela estiver vazia."""
        db = TestingSessionLocal()
        try:
            admin = seed_initial_admin(db)
            assert admin is not None
            assert admin.role == models.UserRole.ADMIN.value
            assert admin.email == "admin@rentalspouse.com"
            assert admin.is_active is True

            # Segunda chamada deve ser idempotente e retornar o admin já existente
            admin_again = seed_initial_admin(db)
            assert admin_again.id == admin.id
        finally:
            db.close()

    def test_seed_initial_admin_respects_disabled_flag(self, monkeypatch):
        """Quando SEED_INITIAL_ADMIN estiver desativado, seed_initial_admin não deve criar usuário."""
        monkeypatch.setenv("SEED_INITIAL_ADMIN", "false")
        db = TestingSessionLocal()
        try:
            result = seed_initial_admin(db)
            assert result is None
        finally:
            db.close()


class TestLifespanStartup:
    """Testes para o ciclo de vida (lifespan) da aplicação."""

    @pytest.mark.asyncio
    async def test_lifespan_startup_success(self):
        """Verifica se o lifespan inicializa o banco e executa o seed sem exceções."""
        from main import app, lifespan

        async with lifespan(app):
            pass

    @pytest.mark.asyncio
    async def test_lifespan_startup_handles_exception_gracefully(self, monkeypatch):
        """Garante que exceções no seed durante o lifespan são tratadas com rollback e log."""
        from main import app, lifespan

        def failing_seed(db):
            raise RuntimeError("Falha simulada no seed")

        monkeypatch.setattr("main.seed_initial_admin", failing_seed)

        async with lifespan(app):
            pass

