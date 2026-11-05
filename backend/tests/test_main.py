"""
Testes automatizados para a rota GET /api/hello.
Utiliza as fixtures compartilhadas definidas em conftest.py.
"""

from fastapi.testclient import TestClient


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
