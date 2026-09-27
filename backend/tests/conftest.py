import os
import sys

# Ajuste de path: permite importar os módulos do backend nos testes
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import database
from database import Base, get_db
from main import app
import models

TEST_DATABASE_URL = "sqlite:///:memory:"

# StaticPool força uma única conexão compartilhada para todo o processo de testes,
# garantindo que tabelas criadas permaneçam acessíveis por todas as sessões.
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Substitui o engine global do database antes de qualquer requisição
database.engine = test_engine

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    """Dependency substituta para usar a sessão do banco em memória."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    """
    Setup e teardown executados antes e depois de CADA teste:
    - Cria todas as tabelas no SQLite em memória.
    - Sobrescreve get_db com override_get_db.
    - Destrói as tabelas ao finalizar o teste.
    """
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """Retorna um TestClient configurado para a aplicação FastAPI."""
    return TestClient(app, raise_server_exceptions=True)
