"""
Testes automatizados para a rota GET /api/hello.

Estratégia de isolamento:
- Usa SQLite em memória com StaticPool (sqlalchemy.pool), que força uma única
  conexão compartilhada para todo o processo. Sem isso, cada connect() abre um
  banco novo e vazio, fazendo o lifespan criar tabelas numa conexão diferente
  da sessão dos testes — causando 'no such table'.
- O `get_db` do app é sobrescrito via `dependency_overrides` do FastAPI.
- O engine do módulo `database` é substituído antes de importar o app, para que
  o lifespan nunca tente conectar no PostgreSQL real.
- Cada teste recebe tabelas criadas (create_all) e destruídas (drop_all) pela
  fixture autouse, garantindo isolamento total entre os casos de teste.
"""

import sys
import os

# Ajuste de path: permite importar os módulos do backend sem instalar o pacote.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# IMPORTANTE: Sobrescreve o engine ANTES de importar o app, para que o lifespan
# use o SQLite em vez de tentar conectar no PostgreSQL.
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import database
import models

TEST_DATABASE_URL = "sqlite:///:memory:"

# StaticPool: garante que TODAS as operações (lifespan, sessões, fixtures)
# compartilhem a mesma conexão em memória. Sem isso, cada connect() abre um
# banco vazio diferente e as tabelas criadas pelo lifespan não são visíveis
# pelas sessões dos testes.
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
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
    Setup/teardown executado antes e depois de CADA teste:
    - create_all: cria a tabela 'status' (e demais) no SQLite em memória.
    - dependency_overrides: substitui get_db pela sessão de teste.
    - drop_all: destrói as tabelas ao final, garantindo estado limpo.

    O create_all aqui é explícito e independente do lifespan do app,
    evitando qualquer condição de corrida entre a inicialização do FastAPI
    e a execução da fixture.
    """
    models.Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    models.Base.metadata.drop_all(bind=test_engine)


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
