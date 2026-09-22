"""
Testes automatizados para os endpoints de Profissionais:
- POST /api/professionals (Criação com bio, especialidades e raio >= 1 km)
- GET /api/professionals (Listagem e filtros por especialidade e cidade)
- GET /api/professionals/{id} (Consulta por ID)
- PUT /api/professionals/{id} (Atualização de dados cadastrais e raio)
- DELETE /api/professionals/{id} (Remoção de perfil)
"""

import sys
import os

# Ajuste de path para importar módulos do backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import database
import models
from database import get_db
from main import app
from tests.test_main import test_engine, TestingSessionLocal, override_get_db


@pytest.fixture(autouse=True)
def setup_test_db():
    """Garante tabelas limpas para cada teste."""
    models.Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    models.Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """Instância de TestClient para o FastAPI."""
    return TestClient(app, raise_server_exceptions=True)


SAMPLE_PROFESSIONAL = {
    "name": "Carlos Marido de Aluguel",
    "email": "carlos.silva@exemplo.com",
    "phone": "(11) 98765-4321",
    "bio": "Especialista em reparos residenciais rápidos, instalações elétricas e pequenos reparos hidráulicos com mais de 10 anos de experiência.",
    "service_radius_km": 15.0,
    "specialties": ["Elétrica", "Encanamento", "Reparos Gerais"],
    "city": "São Paulo",
    "state": "SP",
}


class TestCreateProfessional:
    """Testes de criação de perfil profissional (POST /api/professionals)."""

    def test_create_professional_success(self, client: TestClient):
        """Deve criar perfil profissional com sucesso (HTTP 201)."""
        response = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL)
        assert response.status_code == 201

        data = response.json()
        assert data["id"] is not None
        assert data["name"] == SAMPLE_PROFESSIONAL["name"]
        assert data["email"] == SAMPLE_PROFESSIONAL["email"]
        assert data["service_radius_km"] == 15.0
        assert data["bio"] == SAMPLE_PROFESSIONAL["bio"]
        assert "Elétrica" in data["specialties"]
        assert data["is_active"] is True
        assert "created_at" in data

    def test_create_professional_duplicate_email(self, client: TestClient):
        """Deve rejeitar cadastro com e-mail duplicado com HTTP 400."""
        first_resp = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL)
        assert first_resp.status_code == 201

        second_resp = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL)
        assert second_resp.status_code == 400
        assert "E-mail já cadastrado" in second_resp.json()["detail"]

    def test_create_professional_invalid_radius_less_than_one(self, client: TestClient):
        """Deve rejeitar raio de atendimento menor que 1 km (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["service_radius_km"] = 0.5

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 422

    def test_create_professional_empty_specialties(self, client: TestClient):
        """Deve rejeitar perfil sem especialidades (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["specialties"] = []

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 422

    def test_create_professional_blank_specialties_strings(self, client: TestClient):
        """Deve rejeitar especialidades compostas apenas por espaços vazios (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["specialties"] = ["   ", "  "]

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 422

    def test_create_professional_short_bio(self, client: TestClient):
        """Deve rejeitar bio com menos de 10 caracteres (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["bio"] = "Curto"

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 422

    def test_create_professional_invalid_email(self, client: TestClient):
        """Deve rejeitar e-mail em formato inválido (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["email"] = "email-invalido"

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 422


class TestListAndFilterProfessionals:
    """Testes de listagem e filtros (GET /api/professionals)."""

    def test_list_empty(self, client: TestClient):
        """Deve retornar lista vazia quando nenhum profissional cadastrado."""
        response = client.get("/api/professionals")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_and_filter_by_specialty(self, client: TestClient):
        """Deve listar profissionais e filtrar por especialidade com sucesso."""
        p1 = dict(SAMPLE_PROFESSIONAL)
        p1["email"] = "prof1@test.com"
        p1["specialties"] = ["Elétrica", "Pintura"]
        client.post("/api/professionals", json=p1)

        p2 = dict(SAMPLE_PROFESSIONAL)
        p2["email"] = "prof2@test.com"
        p2["specialties"] = ["Encanamento", "Desentupimento"]
        client.post("/api/professionals", json=p2)

        # Sem filtro: 2 registros
        all_resp = client.get("/api/professionals")
        assert len(all_resp.json()) == 2

        # Filtrando por elétrica
        eletrica_resp = client.get("/api/professionals?specialty=elétrica")
        assert len(eletrica_resp.json()) == 1
        assert eletrica_resp.json()[0]["email"] == "prof1@test.com"

        # Filtrando por encanamento
        encanamento_resp = client.get("/api/professionals?specialty=encanamento")
        assert len(encanamento_resp.json()) == 1
        assert encanamento_resp.json()[0]["email"] == "prof2@test.com"

    def test_filter_by_city(self, client: TestClient):
        """Deve filtrar profissionais por cidade."""
        p1 = dict(SAMPLE_PROFESSIONAL)
        p1["email"] = "sp@test.com"
        p1["city"] = "Campinas"
        client.post("/api/professionals", json=p1)

        p2 = dict(SAMPLE_PROFESSIONAL)
        p2["email"] = "rj@test.com"
        p2["city"] = "Niterói"
        client.post("/api/professionals", json=p2)

        resp = client.get("/api/professionals?city=Campinas")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["email"] == "sp@test.com"


class TestGetProfessionalById:
    """Testes de busca por ID (GET /api/professionals/{id})."""

    def test_get_by_id_success(self, client: TestClient):
        """Deve obter dados do profissional pelo ID correto."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        response = client.get(f"/api/professionals/{prof_id}")
        assert response.status_code == 200
        assert response.json()["id"] == prof_id
        assert response.json()["email"] == SAMPLE_PROFESSIONAL["email"]

    def test_get_by_id_not_found(self, client: TestClient):
        """Deve retornar 404 quando o profissional não existir."""
        response = client.get("/api/professionals/99999")
        assert response.status_code == 404
        assert "não encontrado" in response.json()["detail"]


class TestUpdateAndRemoveProfessional:
    """Testes de atualização e remoção (PUT / DELETE /api/professionals/{id})."""

    def test_update_professional_success(self, client: TestClient):
        """Deve atualizar bio, raio e especialidades do profissional."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        update_payload = {
            "bio": "Nova bio atualizada com vasta experiência comprovada em instalações industriais e prediais.",
            "service_radius_km": 30.0,
            "specialties": ["Elétrica Avançada", "CFTV"],
        }
        response = client.put(f"/api/professionals/{prof_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["service_radius_km"] == 30.0
        assert "CFTV" in data["specialties"]
        assert data["bio"] == update_payload["bio"]

    def test_update_professional_email_conflict(self, client: TestClient):
        """Deve rejeitar atualização para e-mail já usado por outro profissional."""
        p1 = dict(SAMPLE_PROFESSIONAL)
        p1["email"] = "user1@teste.com"
        created1 = client.post("/api/professionals", json=p1).json()

        p2 = dict(SAMPLE_PROFESSIONAL)
        p2["email"] = "user2@teste.com"
        created2 = client.post("/api/professionals", json=p2).json()

        # Tentar trocar email do user2 para user1
        response = client.put(f"/api/professionals/{created2['id']}", json={"email": "user1@teste.com"})
        assert response.status_code == 400
        assert "em uso" in response.json()["detail"]

    def test_update_professional_not_found(self, client: TestClient):
        """Deve retornar 404 ao tentar atualizar profissional inexistente."""
        response = client.put("/api/professionals/99999", json={"bio": "Bio nova para profissional inexistente."})
        assert response.status_code == 404
        assert "não encontrado" in response.json()["detail"]

    def test_update_professional_blank_specialties(self, client: TestClient):
        """Deve retornar 422 ao tentar atualizar especialidades para lista vazia."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        response = client.put(f"/api/professionals/{prof_id}", json={"specialties": ["   "]})
        assert response.status_code == 422

    def test_delete_professional_success(self, client: TestClient):
        """Deve remover profissional da base (HTTP 204) e não encontrá-lo depois (HTTP 404)."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        del_resp = client.delete(f"/api/professionals/{prof_id}")
        assert del_resp.status_code == 204

        get_resp = client.get(f"/api/professionals/{prof_id}")
        assert get_resp.status_code == 404

    def test_delete_professional_not_found(self, client: TestClient):
        """Deve retornar 404 ao tentar remover profissional inexistente."""
        response = client.delete("/api/professionals/99999")
        assert response.status_code == 404
        assert "não encontrado" in response.json()["detail"]

    def test_professional_update_specialties_none(self):
        """Valida que ProfessionalUpdate aceita specialties=None."""
        from schemas import ProfessionalUpdate
        update = ProfessionalUpdate(specialties=None)
        assert update.specialties is None
