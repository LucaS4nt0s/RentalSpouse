"""
Testes automatizados para a rota GET /api/hello.

Estratégia de isolamento:
- Usa SQLite em memória como banco de dados, eliminando a dependência
  do PostgreSQL do Docker durante os testes.
- O `get_db` do app é sobrescrito via `dependency_overrides` do FastAPI,
  garantindo que cada sessão de teste opere em um banco limpo e isolado.
- O `lifespan` do app é desabilitado via `TestClient(app, raise_server_exceptions=True)`
  com o engine substituído antes da criação do cliente, garantindo que nenhuma
  conexão real com o PostgreSQL ocorra.
"""

import sys
import os

# Ajuste de path: permite importar os módulos do backend sem instalar o pacote.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# IMPORTANTE: Sobrescreve o engine ANTES de importar o app, para que o lifespan
# use o SQLite em vez de tentar conectar no PostgreSQL.
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import database

TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},  # Necessário para SQLite + threading
)

# Substitui o engine global do módulo database antes de qualquer import do app
database.engine = test_engine

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

import pytest
from fastapi.testclient import TestClient

from database import Base, get_db
from main import app


# ---------------------------------------------------------------------------
# Dependency override: substitui get_db por sessão SQLite
# ---------------------------------------------------------------------------


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

    O engine já foi substituído no nível do módulo `database`, portanto
    o `Base.metadata.create_all` opera sobre o SQLite em memória,
    nunca sobre o PostgreSQL de desenvolvimento ou produção.
    """
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """
    Retorna um TestClient configurado para a app FastAPI.

    O parâmetro `raise_server_exceptions=True` mantém o comportamento padrão
    de propagar exceções do servidor nos testes.
    """
    return TestClient(app, raise_server_exceptions=True)


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
