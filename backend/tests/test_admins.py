import os
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ajuste de path para importação dos módulos do backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import database
import models
from database import Base, get_db
from main import app
from security import create_access_token, hash_password

# ---------------------------------------------------------------------------
# Configuração de isolamento do banco SQLite em memória
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
database.engine = test_engine
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    """Setup e teardown limpo para cada teste."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture
def admin_user():
    """Cria um administrador inicial no banco de testes e gera seu token."""
    db = TestingSessionLocal()
    try:
        user = models.User(
            name="Admin Master",
            email="admin.master@rentalspouse.com",
            hashed_password=hash_password("MasterAdmin@123"),
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
            hashed_password=hash_password("Cliente@123"),
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

    def test_duplicate_email_is_rejected_with_400(self, client: TestClient, admin_user: dict):
        """Não deve permitir cadastrar administrador com e-mail já existente no sistema."""
        payload = {
            "name": "Duplicado",
            "email": admin_user["user"].email,
            "password": "OutraSenha@123",
        }

        response = client.post("/api/admins", json=payload, headers=admin_user["headers"])
        assert response.status_code == 400
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
