"""
Testes da dependência `get_current_professional` (issue #55 · Tarefa 1 · Fase A).

Exercita a dependência através de uma rota mínima registrada no próprio app:

- sem token -> 401
- cliente / administrador -> 403
- profissional válido -> devolve o próprio registro
- profissional inativo -> 403
- e-mail sem registro `Professional` -> 404
"""

import models
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient

from main import app
from professional_access import get_current_professional
from security import create_access_token, hash_senha

URL_DE_TESTE = "/api/_teste/me-profissional"

router_de_teste = APIRouter(prefix=URL_DE_TESTE, include_in_schema=False)


@router_de_teste.get("")
def rota_minima_do_profissional(
    professional: models.Professional = Depends(get_current_professional),
):
    """Rota mínima usada apenas para exercitar a dependência nos testes."""
    return {
        "id": professional.id,
        "email": professional.email,
        "name": professional.name,
    }


app.include_router(router_de_teste)

SAMPLE_PROF = {
    "name": "Mário Encanador",
    "email": "mario.encanador@exemplo.com",
    "phone": "(11) 97777-6666",
    "bio": "Especialista em encanamentos e detecção de vazamentos residenciais e comerciais.",
    "service_radius_km": 10.0,
    "specialties": ["Encanamento", "Hidráulica"],
    "city": "São Paulo",
    "state": "SP",
}

SENHA_PROFISSIONAL = "SenhaForte@2026"


def criar_profissional(
    client: TestClient,
    email: str,
    senha: str | None = SENHA_PROFISSIONAL,
) -> dict:
    """Cria um profissional via API (com senha, gera também o registro em `users`)."""
    payload = dict(SAMPLE_PROF)
    payload["email"] = email
    if senha:
        payload["senha"] = senha
    resposta = client.post("/api/professionals", json=payload)
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def gerar_token(email: str, role: str) -> str:
    """Gera um token Bearer válido para o e-mail informado."""
    return create_access_token(data={"sub": email, "role": role})


def cabecalho(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestGetCurrentProfessional:
    """Testes da dependência de autorização do profissional autenticado."""

    def test_sem_token_retorna_401(self, client: TestClient):
        resposta = client.get(URL_DE_TESTE)
        assert resposta.status_code == 401
        assert "não fornecido" in resposta.json()["detail"]

    def test_token_invalido_retorna_401(self, client: TestClient):
        resposta = client.get(
            URL_DE_TESTE, headers={"Authorization": "Bearer token.invalido.123"}
        )
        assert resposta.status_code == 401

    def test_cliente_retorna_403(self, client: TestClient, db_session):
        cliente = models.User(
            name="Cliente Comum",
            email="cliente.acesso@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(cliente)
        db_session.commit()

        resposta = client.get(
            URL_DE_TESTE,
            headers=cabecalho(gerar_token(cliente.email, models.UserRole.CLIENT.value)),
        )
        assert resposta.status_code == 403
        assert "permissão de profissional" in resposta.json()["detail"]

    def test_administrador_retorna_403(self, client: TestClient, db_session):
        admin = models.User(
            name="Administrador",
            email="admin.acesso@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()

        resposta = client.get(
            URL_DE_TESTE,
            headers=cabecalho(gerar_token(admin.email, models.UserRole.ADMIN.value)),
        )
        assert resposta.status_code == 403
        assert "permissão de profissional" in resposta.json()["detail"]

    def test_profissional_valido_retorna_o_proprio_registro(self, client: TestClient):
        profissional = criar_profissional(client, "prof.valido@exemplo.com")

        resposta = client.get(
            URL_DE_TESTE,
            headers=cabecalho(
                gerar_token(profissional["email"], models.UserRole.PROFESSIONAL.value)
            ),
        )
        assert resposta.status_code == 200
        assert resposta.json() == {
            "id": profissional["id"],
            "email": "prof.valido@exemplo.com",
            "name": SAMPLE_PROF["name"],
        }

    def test_profissional_sem_registro_em_users_retorna_o_proprio(self, client: TestClient):
        """Profissional criado sem senha (sem linha em `users`) usa o fallback de security."""
        profissional = criar_profissional(
            client, "prof.sem.users@exemplo.com", senha=None
        )

        resposta = client.get(
            URL_DE_TESTE,
            headers=cabecalho(
                gerar_token(profissional["email"], models.UserRole.PROFESSIONAL.value)
            ),
        )
        assert resposta.status_code == 200
        assert resposta.json()["id"] == profissional["id"]

    def test_profissional_inativo_retorna_403(self, client: TestClient, db_session):
        profissional = criar_profissional(client, "prof.inativo@exemplo.com")

        registro = (
            db_session.query(models.Professional)
            .filter(models.Professional.id == profissional["id"])
            .first()
        )
        registro.is_active = False
        db_session.commit()

        resposta = client.get(
            URL_DE_TESTE,
            headers=cabecalho(
                gerar_token(profissional["email"], models.UserRole.PROFESSIONAL.value)
            ),
        )
        assert resposta.status_code == 403
        assert "inativo" in resposta.json()["detail"]

    def test_email_sem_perfil_de_profissional_retorna_404(
        self, client: TestClient, db_session
    ):
        usuario = models.User(
            name="Profissional Sem Perfil",
            email="sem.perfil@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.PROFESSIONAL.value,
            is_active=True,
        )
        db_session.add(usuario)
        db_session.commit()

        resposta = client.get(
            URL_DE_TESTE,
            headers=cabecalho(
                gerar_token(usuario.email, models.UserRole.PROFESSIONAL.value)
            ),
        )
        assert resposta.status_code == 404
        assert "não encontrado" in resposta.json()["detail"]
