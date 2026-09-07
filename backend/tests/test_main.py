"""
Testes automatizados para a rota GET /api/hello.

Estratégia de isolamento:
- Usa SQLite em memória como banco de dados, eliminando a dependência
  do PostgreSQL do Docker durante os testes.
- O `get_db` do app é sobrescrito via `dependency_overrides` do FastAPI,
  garantindo que cada sessão de teste opere em um banco limpo e isolado.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ajuste de path: permite importar os módulos do backend sem instalar o pacote.
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base, get_db
from main import app

# ---------------------------------------------------------------------------
# Configuração do banco de testes (SQLite em memória)
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},  # Necessário para SQLite + threading
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    """Dependency substituta que usa o banco de testes em memória."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Fixtures pytest
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def setup_test_db():
    """
    Cria todas as tabelas antes de cada teste e as destrói após,
    garantindo isolamento total entre os casos de teste.
    """
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """Retorna um TestClient configurado para a app FastAPI."""
    return TestClient(app)


# ---------------------------------------------------------------------------
# Casos de teste
# ---------------------------------------------------------------------------


class TestHelloRoute:
    """Testes para GET /api/hello."""

    def test_status_code_is_200(self, client: TestClient):
        """Deve retornar HTTP 200 OK."""
        response = client.get("/api/hello")
        assert response.status_code == 200

    def test_response_contains_message_key(self, client: TestClient):
        """O corpo JSON deve conter a chave 'message'."""
        response = client.get("/api/hello")
        data = response.json()
        assert "message" in data

    def test_response_contains_id_key(self, client: TestClient):
        """O corpo JSON deve conter a chave 'id'."""
        response = client.get("/api/hello")
        data = response.json()
        assert "id" in data

    def test_seeds_default_message_when_table_is_empty(self, client: TestClient):
        """Quando a tabela está vazia, deve inserir e retornar a mensagem padrão."""
        response = client.get("/api/hello")
        data = response.json()
        assert data["message"] == "Olá Mundo do Banco de Dados!"

    def test_returns_existing_message_without_duplicate(self, client: TestClient):
        """
        Chamadas subsequentes não devem criar registros duplicados;
        deve sempre retornar o primeiro registro existente.
        """
        first_response = client.get("/api/hello")
        second_response = client.get("/api/hello")

        assert first_response.json()["id"] == second_response.json()["id"]
        assert first_response.json()["message"] == second_response.json()["message"]

    def test_response_content_type_is_json(self, client: TestClient):
        """O Content-Type da resposta deve ser application/json."""
        response = client.get("/api/hello")
        assert "application/json" in response.headers["content-type"]
