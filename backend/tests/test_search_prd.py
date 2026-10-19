"""
Testes automatizados cobrindo todos os requisitos e critérios de aceite do
PRD — Backend da Busca e Diretório de Profissionais por Categoria e Localização
(PRD_Backend_Busca_Profissionais.md):

- Cenário 1: Busca pública por especialidade com proteção de dados LGPD (mascaramento)
- Cenário 2: Tolerância a erros e sugestão inteligente (detected_suggestion / X-Search-Suggestion)
- Cenário 3: Rate Limiting anti-scraping (60 req/min por IP -> HTTP 429 Too Many Requests)
- Cenário 4: Catálogo canônico de especialidades e métricas reais (GET /api/professionals/specialties)
- Cenário 5: Solicitação segura de orçamento / QuoteModal (POST /api/professionals/{id}/contact)
- Cenário 6: Retrocompatibilidade com frontend legado (array direto) e envelopamento (envelope=true)
"""

from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

import email_service
import models
from rate_limiter import reset_rate_limits
from schemas import (
    PaginatedResponse,
    ProfessionalContactRequest,
    ProfessionalPublicRead,
    SpecialtyCategoryRead,
)


@pytest.fixture(autouse=True)
def clean_rate_limits():
    """Garante que cada teste execute com os contadores de rate limit zerados."""
    reset_rate_limits()
    yield
    reset_rate_limits()


@pytest.fixture(autouse=True)
def memoria_email(monkeypatch):
    """Configura transporte de e-mail em memória durante os testes."""
    monkeypatch.setenv("EMAIL_BACKEND", "memoria")
    email_service.limpar_caixa_de_saida()
    yield
    email_service.limpar_caixa_de_saida()


SAMPLE_ELECTRICIAN = {
    "name": "Carlos Eduardo Silva",
    "email": "carlos.eduardo@gmail.com",
    "phone": "(11) 98765-4389",
    "bio": "Eletricista residencial e predial com vasta experiência em quadros de luz e curto-circuitos.",
    "service_radius_km": 25.0,
    "specialties": ["Elétrica", "Reparos Gerais"],
    "city": "São Paulo",
    "state": "SP",
}

SAMPLE_PLUMBER = {
    "name": "Marcos Oliveira",
    "email": "marcos.encanador@gmail.com",
    "phone": "(11) 91234-5678",
    "bio": "Encanador especialista em caça-vazamentos, torneiras, caixas d'água e tubulações.",
    "service_radius_km": 20.0,
    "specialties": ["Hidráulica"],
    "city": "São Paulo",
    "state": "SP",
}


def _approve_all_professionals(db_session):
    """Aprova todos os profissionais cadastrados para aparecerem na busca pública."""
    db_session.query(models.Professional).update(
        {
            models.Professional.approval_status: models.ProfessionalApprovalStatus.APPROVED.value,
            models.Professional.is_active: True,
        }
    )
    db_session.commit()


class TestLGPDDataMaskingUnit:
    """Testes unitários dos validadores de mascaramento LGPD em schemas.py."""

    def test_mask_email_cases(self):
        # Usuário longo
        assert (
            ProfessionalPublicRead.mask_email_server_side("carlos.silva@exemplo.com")
            == "ca***a@exemplo.com"
        )
        # Usuário de 3 caracteres
        assert (
            ProfessionalPublicRead.mask_email_server_side("ana@teste.com")
            == "an***a@teste.com"
        )
        # Usuário curto (<= 2 caracteres)
        assert (
            ProfessionalPublicRead.mask_email_server_side("ab@teste.com")
            == "a***@teste.com"
        )
        assert (
            ProfessionalPublicRead.mask_email_server_side("x@teste.com")
            == "x***@teste.com"
        )
        # E-mail inválido ou vazio
        assert ProfessionalPublicRead.mask_email_server_side(None) == "E-mail protegido"
        assert ProfessionalPublicRead.mask_email_server_side("") == "E-mail protegido"
        assert ProfessionalPublicRead.mask_email_server_side("sem-arroba") == "E-mail protegido"

    def test_mask_phone_cases(self):
        # Celular 11 dígitos com DDD
        assert (
            ProfessionalPublicRead.mask_phone_server_side("(11) 98765-4321")
            == "(11) 9****-**21"
        )
        assert (
            ProfessionalPublicRead.mask_phone_server_side("11987654321")
            == "(11) 9****-**21"
        )
        # Telefone fixo 10 dígitos com DDD
        assert (
            ProfessionalPublicRead.mask_phone_server_side("(11) 3456-7890")
            == "(11) 3***-**90"
        )
        # Menos de 8 dígitos
        assert (
            ProfessionalPublicRead.mask_phone_server_side("12345")
            == "Telefone protegido"
        )
        # Nulo
        assert ProfessionalPublicRead.mask_phone_server_side(None) is None


class TestPublicSearchAndDirectoryScenario1:
    """Cenário 1: Busca pública por especialidade com proteção de dados LGPD."""

    def test_search_by_specialty_with_lgpd_masking(self, client: TestClient, db_session):
        client.post("/api/professionals", json=SAMPLE_ELECTRICIAN)
        client.post("/api/professionals", json=SAMPLE_PLUMBER)
        _approve_all_professionals(db_session)

        response = client.get("/api/professionals?specialty=Elétrica")
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1

        prof = data[0]
        assert prof["name"] == SAMPLE_ELECTRICIAN["name"]
        # E-mail e telefone mascarados
        assert prof["email"] == "ca***o@gmail.com"
        assert prof["phone"] == "(11) 9****-**89"
        # Sem vazamento de dados em claro
        assert "carlos.eduardo@gmail.com" not in response.text
        assert "98765-4389" not in response.text

        # Cabeçalhos informativos e de segurança
        assert response.headers.get("X-Total-Count") == "1"
        assert response.headers.get("X-Page") == "1"
        assert response.headers.get("X-Per-Page") == "20"
        assert response.headers.get("X-Has-More") == "false"
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "DENY"
        assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


class TestFuzzyAndSuggestionsScenario2:
    """Cenário 2: Tolerância a erros de digitação e preservação da sugestão calculada."""

    def test_fuzzy_search_with_suggestion_and_envelope(
        self, client: TestClient, db_session
    ):
        client.post("/api/professionals", json=SAMPLE_ELECTRICIAN)
        client.post("/api/professionals", json=SAMPLE_PLUMBER)
        _approve_all_professionals(db_session)

        # Busca com erro de digitação proposital: "eletrecista"
        response = client.get("/api/professionals?q=eletrecista&envelope=true")
        assert response.status_code == 200

        data = response.json()
        assert "items" in data
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

        # Identifica e ranqueia o eletricista
        top_prof = data["items"][0]
        assert top_prof["name"] == SAMPLE_ELECTRICIAN["name"]
        assert top_prof["email"] == "ca***o@gmail.com"

        # Sugestão detectada preservada no corpo e no cabeçalho
        assert data["detected_suggestion"] == "Elétrica"
        assert response.headers.get("X-Search-Suggestion") == "Eletrica"
        assert response.headers.get("X-Total-Count") == str(data["total"])

    def test_dedicated_search_endpoint_enveloped(
        self, client: TestClient, db_session
    ):
        client.post("/api/professionals", json=SAMPLE_ELECTRICIAN)
        _approve_all_professionals(db_session)

        response = client.get("/api/professionals/search?q=quadros")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert data["total"] == 1
        assert data["page"] == 1
        assert data["items"][0]["name"] == SAMPLE_ELECTRICIAN["name"]


class TestRateLimitingScenario3:
    """Cenário 3: Excesso de requisições e bloqueio por Rate Limit (Anti-Scraping)."""

    def test_search_rate_limit_exceeded(self, client: TestClient):
        # 60 requisições permitidas
        for _ in range(60):
            resp = client.get("/api/professionals?q=teste")
            assert resp.status_code == 200

        # A 61ª requisição deve ser bloqueada com HTTP 429
        blocked_resp = client.get("/api/professionals?q=teste")
        assert blocked_resp.status_code == 429
        assert "Retry-After" in blocked_resp.headers
        assert "Muitas requisições de busca" in blocked_resp.json()["detail"]


class TestSpecialtiesCatalogScenario4:
    """Cenário 4: Consulta ao catálogo oficial de especialidades com métricas reais."""

    def test_specialties_catalog_with_metrics_and_cache(
        self, client: TestClient, db_session
    ):
        client.post("/api/professionals", json=SAMPLE_ELECTRICIAN)
        client.post("/api/professionals", json=SAMPLE_PLUMBER)
        _approve_all_professionals(db_session)

        response = client.get("/api/professionals/specialties")
        assert response.status_code == 200
        assert "Cache-Control" in response.headers
        assert "max-age=300" in response.headers["Cache-Control"]

        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5

        categories_by_slug = {c["slug"]: c for c in data}
        assert "eletrica" in categories_by_slug
        assert "hidraulica" in categories_by_slug
        assert "pintura" in categories_by_slug

        # Verificação de contagens em tempo real
        assert categories_by_slug["eletrica"]["professionals_count"] == 1
        assert categories_by_slug["eletrica"]["icon"] == "Zap"
        assert categories_by_slug["hidraulica"]["professionals_count"] == 1
        assert categories_by_slug["hidraulica"]["icon"] == "Droplets"
        assert categories_by_slug["pintura"]["professionals_count"] == 0

    def test_specialties_catalog_ignores_inactive_and_pending_professionals(
        self, client: TestClient, db_session
    ):
        p_pending = dict(SAMPLE_ELECTRICIAN)
        p_pending["email"] = "pendente.eletrica@gmail.com"
        client.post("/api/professionals", json=p_pending)
        # Não aprova no banco (mantém pending_approval)

        response = client.get("/api/professionals/specialties")
        assert response.status_code == 200
        categories_by_slug = {c["slug"]: c for c in response.json()}
        assert categories_by_slug["eletrica"]["professionals_count"] == 0


class TestQuoteContactScenario5:
    """Cenário 5: Envio de solicitação de orçamento conectada ao QuoteModal."""

    def test_send_quote_request_success(self, client: TestClient, db_session):
        created = client.post("/api/professionals", json=SAMPLE_ELECTRICIAN).json()
        prof_id = created["id"]
        _approve_all_professionals(db_session)

        contact_payload = {
            "client_name": "Mariana Ferreira",
            "client_email": "mariana.ferreira@gmail.com",
            "client_phone": "(11) 98765-4321",
            "service_category": "Elétrica",
            "message": "Preciso trocar a fiação da sala e instalar tomadas de 20A com urgência.",
            "client_city": "São Paulo",
        }

        response = client.post(
            f"/api/professionals/{prof_id}/contact",
            json=contact_payload,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["professional_id"] == prof_id
        assert data["professional_name"] == SAMPLE_ELECTRICIAN["name"]
        assert "contacted_at" in data

        # Verifica que o e-mail transacional foi entregue ao profissional
        caixa = email_service.caixa_de_saida()
        assert len(caixa) == 1
        msg = caixa[0]
        assert msg["To"] == SAMPLE_ELECTRICIAN["email"]
        assert "Mariana Ferreira" in msg["Subject"]
        assert "Mariana Ferreira" in msg.get_content()
        assert "tomadas de 20A" in msg.get_content()

    def test_send_quote_request_professional_not_found_or_pending(
        self, client: TestClient
    ):
        # Profissional inexistente
        contact_payload = {
            "client_name": "Mariana Ferreira",
            "client_email": "mariana@gmail.com",
            "service_category": "Elétrica",
            "message": "Preciso trocar disjuntores da minha residência.",
        }
        response = client.get("/api/professionals/99999")
        assert response.status_code == 404

        contact_resp = client.post(
            "/api/professionals/99999/contact",
            json=contact_payload,
        )
        assert contact_resp.status_code == 404
        assert "não encontrado ou não está disponível" in contact_resp.json()["detail"]

    def test_send_quote_request_short_message_validation_422(
        self, client: TestClient, db_session
    ):
        created = client.post("/api/professionals", json=SAMPLE_ELECTRICIAN).json()
        _approve_all_professionals(db_session)

        invalid_payload = {
            "client_name": "Mariana",
            "client_email": "mariana@gmail.com",
            "service_category": "Elétrica",
            "message": "Curto",  # menos de 10 caracteres
        }
        response = client.post(
            f"/api/professionals/{created['id']}/contact",
            json=invalid_payload,
        )
        assert response.status_code == 422

    def test_send_quote_request_rate_limit_5_per_hour(
        self, client: TestClient, db_session
    ):
        created = client.post("/api/professionals", json=SAMPLE_ELECTRICIAN).json()
        prof_id = created["id"]
        _approve_all_professionals(db_session)

        payload = {
            "client_name": "Cliente Teste",
            "client_email": "cliente@teste.com",
            "service_category": "Elétrica",
            "message": "Solicitação de orçamento para reforma geral da residência.",
        }

        # 5 envios permitidos
        for _ in range(5):
            resp = client.post(f"/api/professionals/{prof_id}/contact", json=payload)
            assert resp.status_code == 201

        # 6º envio no mesmo período deve receber 429
        blocked = client.post(f"/api/professionals/{prof_id}/contact", json=payload)
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers

    def test_send_quote_request_returns_503_when_email_fails(
        self, client: TestClient, db_session, monkeypatch
    ):
        created = client.post("/api/professionals", json=SAMPLE_ELECTRICIAN).json()
        prof_id = created["id"]
        _approve_all_professionals(db_session)

        monkeypatch.setattr(
            "notificacoes.notificar_profissional_solicitacao_orcamento",
            lambda **kwargs: False,
        )

        payload = {
            "client_name": "Cliente Teste",
            "client_email": "cliente@teste.com",
            "service_category": "Elétrica",
            "message": "Solicitação de orçamento quando o transporte de e-mail falha.",
        }
        resp = client.post(f"/api/professionals/{prof_id}/contact", json=payload)
        assert resp.status_code == 503
        assert "Não foi possível enviar" in resp.json()["detail"]

    def test_contact_strips_crlf_against_header_injection(
        self, client: TestClient, db_session
    ):
        created = client.post("/api/professionals", json=SAMPLE_ELECTRICIAN).json()
        prof_id = created["id"]
        _approve_all_professionals(db_session)

        payload = {
            "client_name": "Mariana\r\nBcc: hacker@evil.com",
            "client_email": "mariana@gmail.com",
            "client_phone": "1198765\r\n4321",
            "service_category": "Elétrica\r\nSubject: Pwned",
            "message": "Preciso trocar a fiação da sala e instalar tomadas novas.",
            "client_city": "São Paulo\r\n",
        }
        resp = client.post(f"/api/professionals/{prof_id}/contact", json=payload)
        assert resp.status_code == 201

        caixa = email_service.caixa_de_saida()
        assert len(caixa) == 1
        msg = caixa[0]
        assert "\r" not in msg["Subject"]
        assert "\n" not in msg["Subject"]
        assert "Mariana Bcc: hacker@evil.com" in msg["Subject"]


class TestRetrocompatibilityAndEdgeCasesScenario6:
    """Cenário 6: Retrocompatibilidade com frontend legado e validações defensivas."""

    def test_legacy_array_response_format(self, client: TestClient, db_session):
        client.post("/api/professionals", json=SAMPLE_ELECTRICIAN)
        _approve_all_professionals(db_session)

        # Sem o parâmetro envelope=true, deve responder um array direto
        response = client.get("/api/professionals?limit=20")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        item = data[0]
        # Atributos estritamente esperados pela interface TypeScript 'Professional'
        assert "id" in item
        assert "name" in item
        assert "email" in item
        assert "bio" in item
        assert "service_radius_km" in item
        assert "specialties" in item
        assert "is_active" in item
        assert "approval_status" in item

    def test_get_professional_by_id_masks_pii_lgpd(self, client: TestClient, db_session):
        """Garante que GET /api/professionals/{id} mascara email e phone para visitantes anônimos."""
        created = client.post("/api/professionals", json=SAMPLE_ELECTRICIAN).json()
        prof_id = created["id"]
        _approve_all_professionals(db_session)

        resp = client.get(f"/api/professionals/{prof_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "ca***o@gmail.com"
        assert data["phone"] == "(11) 9****-**89"
        assert "carlos.eduardo@gmail.com" not in resp.text
        assert "98765-4389" not in resp.text
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"

    def test_pagination_and_total_count_beyond_250_candidates(
        self, client: TestClient, db_session
    ):
        """Reproduz cenário com 300 profissionais correspondentes a q=quadros: total=300 e páginas > 250 acessíveis."""
        profs = [
            models.Professional(
                name=f"Profissional Quadros {i}",
                email=f"prof.quadros.{i}@exemplo.com",
                phone="(11) 98765-4321",
                bio="Especialista em instalação de quadros de luz e disjuntores residenciais.",
                service_radius_km=20.0,
                specialties=["Elétrica"],
                city="São Paulo",
                state="SP",
                is_active=True,
                approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
            )
            for i in range(300)
        ]
        db_session.add_all(profs)
        db_session.commit()

        resp_page1 = client.get("/api/professionals/search?q=quadros&skip=0&limit=20")
        assert resp_page1.status_code == 200
        body1 = resp_page1.json()
        assert body1["total"] == 300
        assert body1["pages"] == 15
        assert body1["has_more"] is True
        assert resp_page1.headers.get("X-Total-Count") == "300"

        # Acessa registros além de 250 (skip=260, limit=50 -> últimos 40 itens)
        resp_last = client.get("/api/professionals/search?q=quadros&skip=260&limit=50")
        assert resp_last.status_code == 200
        body_last = resp_last.json()
        assert body_last["total"] == 300
        assert len(body_last["items"]) == 40
        assert body_last["has_more"] is False

    def test_rate_limiter_ignores_forged_xff_and_evicts_keys(
        self, client: TestClient, monkeypatch
    ):
        """Garante que X-Forwarded-For forjado sem proxy confiável não burla o 429 e chaves antigas sofrem eviction."""
        from rate_limiter import SlidingWindowRateLimiter, is_trusted_proxy

        # 1. X-Forwarded-For forjado com IPs distintos por requisição ainda deve atingir 429
        for i in range(60):
            r = client.get(
                "/api/professionals?q=teste",
                headers={"X-Forwarded-For": f"203.0.113.{i + 1}"},
            )
            assert r.status_code == 200

        blocked = client.get(
            "/api/professionals?q=teste",
            headers={"X-Forwarded-For": "198.51.100.99"},
        )
        assert blocked.status_code == 429

        # 2. Quando TRUSTED_PROXIES inclui o peer, X-Forwarded-For passa a ser considerado
        monkeypatch.setenv("TRUSTED_PROXIES", "testclient,10.0.0.0/8,127.0.0.1")
        assert is_trusted_proxy("testclient") is True
        assert is_trusted_proxy("10.1.2.3") is True
        assert is_trusted_proxy("127.0.0.1") is True
        assert is_trusted_proxy("8.8.8.8") is False

        allowed_diff_ip = client.get(
            "/api/professionals?q=teste",
            headers={"X-Forwarded-For": "198.51.100.200"},
        )
        assert allowed_diff_ip.status_code == 200

        # 3. Eviction por limite máximo de chaves (LRU)
        small_limiter = SlidingWindowRateLimiter(max_keys=3)
        for idx in range(10):
            small_limiter.check(f"k:{idx}", limit=5, window_seconds=60)
        assert small_limiter.active_keys_count <= 3

    def test_invalid_state_uf_returns_422(self, client: TestClient):
        response = client.get("/api/professionals?state=ZZ")
        assert response.status_code == 422
        assert "inválido" in response.json()["detail"].lower()

    def test_wildcard_search_returns_empty_safely(self, client: TestClient, db_session):
        client.post("/api/professionals", json=SAMPLE_ELECTRICIAN)
        _approve_all_professionals(db_session)

        for sym in ["%", "_", "*", "\\"]:
            resp = client.get(f"/api/professionals?q={sym}")
            assert resp.status_code == 200
            assert resp.json() == []
            assert resp.headers.get("X-Total-Count") == "0"
