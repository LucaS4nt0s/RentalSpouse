"""
Testes automatizados para os endpoints de Profissionais:
- POST /api/professionals (Criação com bio, especialidades e raio >= 1 km)
- GET /api/professionals (Listagem e filtros por especialidade, cidade e paginação)
- GET /api/professionals/{id} (Consulta por ID)
- PUT /api/professionals/{id} (Atualização de dados cadastrais, raio e validações estritas de null)
- DELETE /api/professionals/{id} (Remoção de perfil)
"""

from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from schemas import ProfessionalUpdate
import models

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
        """Deve rejeitar cadastro com e-mail duplicado com HTTP 409 Conflict."""
        first_resp = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL)
        assert first_resp.status_code == 201

        second_resp = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL)
        assert second_resp.status_code == 409
        assert "E-mail já cadastrado" in second_resp.json()["detail"]

    def test_create_professional_integrity_error_race_condition(self, client: TestClient):
        """Simula condição de corrida onde o commit falha por colisão de unicidade."""
        with patch("sqlalchemy.orm.Session.commit", side_effect=IntegrityError("Unique violation", params=None, orig=Exception())):
            response = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL)
            assert response.status_code == 409
            assert "E-mail já cadastrado" in response.json()["detail"]

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

    def test_create_professional_short_name(self, client: TestClient):
        """Deve rejeitar nome com menos de 2 caracteres (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["name"] = "A"

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 422

    def test_create_professional_invalid_email(self, client: TestClient):
        """Deve rejeitar e-mail em formato inválido (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["email"] = "email-invalido"

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 422

    def test_create_professional_invalid_uf(self, client: TestClient):
        """Deve rejeitar sigla de estado inválida que não pertence ao Brasil (HTTP 422)."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["state"] = "ZZ"

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

        # Filtrando por eletrica (SEM ACENTO) deve encontrar Elétrica
        sem_acento_resp = client.get("/api/professionals?specialty=eletrica")
        assert len(sem_acento_resp.json()) == 1
        assert sem_acento_resp.json()[0]["email"] == "prof1@test.com"

    def test_filter_by_city(self, client: TestClient):
        """Deve filtrar profissionais por cidade (com e sem acentos)."""
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

        # Filtrando por niteroi (SEM ACENTO) deve encontrar Niterói
        resp_sem_acento = client.get("/api/professionals?city=niteroi")
        assert resp_sem_acento.status_code == 200
        assert len(resp_sem_acento.json()) == 1
        assert resp_sem_acento.json()[0]["email"] == "rj@test.com"

    def test_pagination_skip_limit(self, client: TestClient):
        """Deve respeitar paginação via skip e limit no banco."""
        for i in range(3):
            p = dict(SAMPLE_PROFESSIONAL)
            p["email"] = f"page{i}@test.com"
            client.post("/api/professionals", json=p)

        resp = client.get("/api/professionals?skip=1&limit=1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["email"] == "page1@test.com"

    def test_search_free_text_q(self, client: TestClient):
        """Deve buscar profissionais pelo parâmetro livre q (nome, bio, especialidade com/sem acento)."""
        p1 = dict(SAMPLE_PROFESSIONAL)
        p1["email"] = "marido1@test.com"
        p1["name"] = "José Eletricista"
        p1["bio"] = "Especialista em iluminação residencial e quadros elétricos de alta voltagem."
        p1["specialties"] = ["Elétrica"]
        p1["city"] = "Campinas"
        client.post("/api/professionals", json=p1)

        p2 = dict(SAMPLE_PROFESSIONAL)
        p2["email"] = "marido2@test.com"
        p2["name"] = "Marcos Encanador"
        p2["bio"] = "Conserto de vazamentos em canos de cobre e pvc, desentupimentos rápidos."
        p2["specialties"] = ["Hidráulica"]
        p2["city"] = "Niterói"
        client.post("/api/professionals", json=p2)

        # Busca por nome
        resp = client.get("/api/professionals?q=jose")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["email"] == "marido1@test.com"

        # Busca por especialidade no q (SEM ACENTO)
        resp_q_spec = client.get("/api/professionals?q=eletrica")
        assert resp_q_spec.status_code == 200
        assert len(resp_q_spec.json()) == 1
        assert resp_q_spec.json()[0]["email"] == "marido1@test.com"

        # Busca por termo na bio (SEM ACENTO: "iluminacao" casa com "iluminação")
        resp_bio = client.get("/api/professionals?q=iluminacao")
        assert resp_bio.status_code == 200
        assert len(resp_bio.json()) == 1
        assert resp_bio.json()[0]["email"] == "marido1@test.com"

        # Busca combinada com q e city
        resp_comb = client.get("/api/professionals?q=encanador&city=niteroi")
        assert resp_comb.status_code == 200
        assert len(resp_comb.json()) == 1
        assert resp_comb.json()[0]["email"] == "marido2@test.com"

        # Busca com termo inexistente
        resp_vazio = client.get("/api/professionals?q=termoinexistentexyz")
        assert resp_vazio.status_code == 200
        assert len(resp_vazio.json()) == 0

        # Busca com caracteres curinga do LIKE (% e _) - devem ser tratados literalmente
        resp_wildcard_pct = client.get("/api/professionals?q=%")
        assert resp_wildcard_pct.status_code == 200
        assert len(resp_wildcard_pct.json()) == 0

        resp_wildcard_underscore = client.get("/api/professionals?q=_")
        assert resp_wildcard_underscore.status_code == 200
        assert len(resp_wildcard_underscore.json()) == 0


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
            "state": "rj",
            "name": " Carlos Atualizado ",
        }
        response = client.put(f"/api/professionals/{prof_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Carlos Atualizado"
        assert data["service_radius_km"] == 30.0
        assert "CFTV" in data["specialties"]
        assert data["state"] == "RJ"
        assert data["bio"] == update_payload["bio"]

    def test_update_professional_email_conflict(self, client: TestClient):
        """Deve rejeitar atualização para e-mail já usado por outro profissional com HTTP 409."""
        p1 = dict(SAMPLE_PROFESSIONAL)
        p1["email"] = "user1@teste.com"
        created1 = client.post("/api/professionals", json=p1).json()

        p2 = dict(SAMPLE_PROFESSIONAL)
        p2["email"] = "user2@teste.com"
        created2 = client.post("/api/professionals", json=p2).json()

        # Tentar trocar email do user2 para user1
        response = client.put(f"/api/professionals/{created2['id']}", json={"email": "user1@teste.com"})
        assert response.status_code == 409
        assert "em uso" in response.json()["detail"]

    def test_update_professional_integrity_error_race_condition(self, client: TestClient):
        """Simula falha de integridade concorrente no update retornando HTTP 409."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        with patch("sqlalchemy.orm.Session.commit", side_effect=IntegrityError("Unique violation", params=None, orig=Exception())):
            response = client.put(f"/api/professionals/{prof_id}", json={"name": "Outro Nome"})
            assert response.status_code == 409
            assert "E-mail já está em uso" in response.json()["detail"]

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

    def test_update_professional_invalid_state(self, client: TestClient):
        """Deve retornar 422 ao tentar atualizar estado com sigla inexistente."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        response = client.put(f"/api/professionals/{prof_id}", json={"state": "ZZ"})
        assert response.status_code == 422

    def test_update_professional_invalid_email_format(self, client: TestClient):
        """Deve retornar 422 ao tentar atualizar e-mail com formato inválido."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        response = client.put(f"/api/professionals/{prof_id}", json={"email": "invalido@"})
        assert response.status_code == 422

    def test_update_professional_short_name(self, client: TestClient):
        """Deve retornar 422 ao tentar atualizar nome com menos de 2 caracteres."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        prof_id = created["id"]

        response = client.put(f"/api/professionals/{prof_id}", json={"name": "A"})
        assert response.status_code == 422

    # -----------------------------------------------------------------------
    # Testes cruciais solicitados no code review: PUT com null explícito deve
    # retornar HTTP 422 em vez de quebrar com 500 no banco / ResponseValidation
    # -----------------------------------------------------------------------

    def test_update_professional_rejects_null_name(self, client: TestClient):
        """Deve retornar 422 ao enviar name=null explícito."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        raw_client = TestClient(client.app, raise_server_exceptions=False)
        response = raw_client.put(f"/api/professionals/{created['id']}", json={"name": None})
        assert response.status_code == 422

    def test_update_professional_rejects_null_bio(self, client: TestClient):
        """Deve retornar 422 ao enviar bio=null explícito."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        raw_client = TestClient(client.app, raise_server_exceptions=False)
        response = raw_client.put(f"/api/professionals/{created['id']}", json={"bio": None})
        assert response.status_code == 422

    def test_update_professional_rejects_null_service_radius_km(self, client: TestClient):
        """Deve retornar 422 ao enviar service_radius_km=null explícito."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        raw_client = TestClient(client.app, raise_server_exceptions=False)
        response = raw_client.put(f"/api/professionals/{created['id']}", json={"service_radius_km": None})
        assert response.status_code == 422

    def test_update_professional_rejects_null_specialties(self, client: TestClient):
        """Deve retornar 422 ao enviar specialties=null explícito."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        raw_client = TestClient(client.app, raise_server_exceptions=False)
        response = raw_client.put(f"/api/professionals/{created['id']}", json={"specialties": None})
        assert response.status_code == 422

    def test_update_professional_rejects_null_email(self, client: TestClient):
        """Deve retornar 422 ao enviar email=null explícito."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        raw_client = TestClient(client.app, raise_server_exceptions=False)
        response = raw_client.put(f"/api/professionals/{created['id']}", json={"email": None})
        assert response.status_code == 422

    def test_update_professional_rejects_null_is_active(self, client: TestClient):
        """Deve retornar 422 ao enviar is_active=null explícito."""
        created = client.post("/api/professionals", json=SAMPLE_PROFESSIONAL).json()
        raw_client = TestClient(client.app, raise_server_exceptions=False)
        response = raw_client.put(f"/api/professionals/{created['id']}", json={"is_active": None})
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

    def test_professional_update_model_validate_empty(self):
        """Valida que ProfessionalUpdate pode ser instanciado sem parâmetros."""
        update = ProfessionalUpdate.model_validate({})
        assert update.specialties is None
        assert update.name is None
        assert update.model_dump(exclude_unset=True) == {}

    def test_create_professional_with_portuguese_aliases_and_nested_address(self, client: TestClient):
        """Valida que o backend aceita o payload com nomes em pt-BR e endereço aninhado."""
        payload = {
            "nome": "Marcos Eletricista",
            "email": "marcos.eletricista@email.com",
            "telefone": "11987654321",
            "bio": "Eletricista residencial com mais de 10 anos de experiência em reparos.",
            "raio_atendimento_km": 25.0,
            "especialidades": ["Elétrica", "Instalações"],
            "senha": "senhaSegura123",
            "confirmar_senha": "senhaSegura123",
            "endereco": {
                "cep": "01310100",
                "logradouro": "Av Paulista",
                "numero": "1000",
                "bairro": "Bela Vista",
                "cidade": "São Paulo",
                "estado_uf": "SP",
            },
        }
        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Marcos Eletricista"
        assert data["phone"] == "11987654321"
        assert data["service_radius_km"] == 25.0
        assert data["city"] == "São Paulo"
        assert data["state"] == "SP"

    def test_create_and_list_via_profissionais_alias_route(self, client: TestClient):
        """Valida que a rota /api/profissionais funciona como alias para /api/professionals."""
        payload = dict(SAMPLE_PROFESSIONAL)
        payload["email"] = "alias.route@teste.com"

        post_resp = client.post("/api/profissionais", json=payload)
        assert post_resp.status_code == 201
        prof_id = post_resp.json()["id"]

        get_resp = client.get(f"/api/profissionais/{prof_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["email"] == "alias.route@teste.com"

        list_resp = client.get("/api/profissionais")
        assert list_resp.status_code == 200
        assert any(p["id"] == prof_id for p in list_resp.json())

    def test_create_professional_cross_table_email_conflict_with_user(self, client: TestClient, db_session):
        """Valida que conflito de e-mail existente em users retorna 409 com mensagem apropriada."""
        existing_user = models.User(
            name="Usuário Existente",
            email="conflito.user@teste.com",
            hashed_password="dummy_password_hash",
            role=models.UserRole.CLIENT.value,
        )
        db_session.add(existing_user)
        db_session.commit()

        payload = dict(SAMPLE_PROFESSIONAL)
        payload["email"] = "conflito.user@teste.com"
        payload["password"] = "senhaSegura123"

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 409
        assert "E-mail já cadastrado" in response.json()["detail"]

    def test_create_professional_cross_table_email_conflict_with_cliente(self, client: TestClient, db_session):
        """Valida que conflito de e-mail existente em clientes retorna 409 com mensagem apropriada."""
        from datetime import date
        cliente = models.Cliente(
            nome="Cliente Existente",
            email="conflito.cliente@teste.com",
            cpf="12345678909",
            data_nascimento=date(1995, 5, 20),
            senha_hash="dummy_hash",
            cep="01001000",
            logradouro="Praça da Sé",
            numero="100",
            bairro="Sé",
            cidade="São Paulo",
            estado="SP",
        )
        db_session.add(cliente)
        db_session.commit()

        payload = dict(SAMPLE_PROFESSIONAL)
        payload["email"] = "conflito.cliente@teste.com"
        payload["password"] = "senhaSegura123"

        response = client.post("/api/professionals", json=payload)
        assert response.status_code == 409
        assert "E-mail já cadastrado" in response.json()["detail"]


