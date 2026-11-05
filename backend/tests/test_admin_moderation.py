"""
Suíte de Testes Automatizados para Moderação Administrativa de Profissionais (Issue #64).

Cobre exaustivamente:
- Controle de acesso e autenticação (401 sem token, 403 para não-admins ou admins inativos);
- Fila FIFO de pendentes (`/api/admins/professionals/pending`) com contagem e flags de completude;
- Listagem geral com filtros de status (`pending_approval`, `approved`, `rejected`, `all`);
- Consulta de auditoria detalhada (`/{id}/review`) com URLs de download;
- Fluxo de aprovação atômica (`/{id}/approve`):
  - Sucesso com gravação de auditoria (data, admin id) e disparo de e-mail;
  - 409 Conflict se já aprovado;
  - 409 Conflict se faltar documentos obrigatórios;
  - 404 Not Found se inexistente;
- Fluxo de rejeição com justificativa (`/{id}/reject`):
  - Sucesso com gravação de motivo, reset de aprovação e disparo de e-mail;
  - 409 Conflict se já rejeitado ou se documentos não foram submetidos;
  - 422 Unprocessable Entity para motivo vazio/curto;
  - 404 Not Found se inexistente;
- Garantia de vitrine pública: apenas profissionais aprovados aparecem em `/api/professionals`;
- Reabertura do fluxo de submissão pelo profissional após reprovação.
"""

from datetime import datetime, timedelta, timezone
import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import models
from security import create_access_token, hash_senha


@pytest.fixture
def admin_user(db_session: Session) -> dict:
    """Cria um administrador ativo no banco de dados para testes."""
    admin = models.User(
        name="Administrador Responsável",
        email="admin.moderador@rentalspouse.com",
        hashed_password=hash_senha("Admin@Secret123"),
        role=models.UserRole.ADMIN.value,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    token = create_access_token({"sub": admin.email, "role": models.UserRole.ADMIN.value})
    return {"user": admin, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture
def inactive_admin_headers(db_session: Session) -> dict:
    """Cria um administrador inativo."""
    admin = models.User(
        name="Admin Inativo",
        email="admin.inativo@rentalspouse.com",
        hashed_password=hash_senha("Admin@123456"),
        role=models.UserRole.ADMIN.value,
        is_active=False,
    )
    db_session.add(admin)
    db_session.commit()
    token = create_access_token({"sub": admin.email, "role": models.UserRole.ADMIN.value})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client_user_headers(db_session: Session) -> dict:
    """Cria um cliente comum (não-admin)."""
    client = models.User(
        name="Cliente Comum",
        email="cliente.comum@exemplo.com",
        hashed_password=hash_senha("Cliente@123456"),
        role=models.UserRole.CLIENT.value,
        is_active=True,
    )
    db_session.add(client)
    db_session.commit()
    token = create_access_token({"sub": client.email, "role": models.UserRole.CLIENT.value})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def professional_user_headers(db_session: Session) -> dict:
    """Cria um profissional comum (não-admin)."""
    prof = models.User(
        name="Profissional User",
        email="prof.user@exemplo.com",
        hashed_password=hash_senha("Prof@123456"),
        role=models.UserRole.PROFESSIONAL.value,
        is_active=True,
    )
    db_session.add(prof)
    db_session.commit()
    token = create_access_token({"sub": prof.email, "role": models.UserRole.PROFESSIONAL.value})
    return {"Authorization": f"Bearer {token}"}


def helper_create_professional(
    db: Session,
    name: str = "Prestador Teste",
    email: str = "prestador@exemplo.com",
    submitted: bool = True,
    status: str = models.ProfessionalApprovalStatus.PENDING.value,
    submission_offset_minutes: int = 10,
) -> models.Professional:
    """Cria um profissional no banco com dados de submissão configuráveis."""
    now = datetime.now(timezone.utc)
    submitted_at = (now - timedelta(minutes=submission_offset_minutes)) if submitted else None

    prof = models.Professional(
        name=name,
        email=email,
        phone="11999998888",
        bio="Profissional habilitado para testes de moderação.",
        service_radius_km=15.0,
        specialties=["Elétrica", "Encanamento"],
        city="São Paulo",
        state="SP",
        approval_status=status,
        documents_submitted_at=submitted_at,
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return prof


def helper_attach_document(
    db: Session,
    prof_id: int,
    doc_type: str,
    file_name: str = "doc.pdf",
    mime_type: str = "application/pdf",
) -> models.ProfessionalDocument:
    """Anexa metadado de documento a um profissional no banco de testes."""
    doc = models.ProfessionalDocument(
        professional_id=prof_id,
        document_type=doc_type,
        file_name=file_name,
        file_path=f"uploads/documents/{prof_id}/{doc_type}_{file_name}",
        file_size=1024,
        mime_type=mime_type,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


# ===========================================================================
# 1. Testes de Controle de Acesso e Autenticação
# ===========================================================================


class TestAdminModerationAuth:
    """Garante que todas as rotas administrativas exijam papel de Administrador ativo."""

    def test_unauthenticated_requests_return_401(self, client: TestClient):
        r1 = client.get("/api/admins/professionals/pending")
        assert r1.status_code == 401

        r2 = client.get("/api/admins/professionals")
        assert r2.status_code == 401

        r3 = client.get("/api/admins/professionals/1/review")
        assert r3.status_code == 401

        r4 = client.post("/api/admins/professionals/1/approve")
        assert r4.status_code == 401

        r5 = client.post("/api/admins/professionals/1/reject", json={"reason": "motivo"})
        assert r5.status_code == 401

    def test_non_admin_roles_return_403(
        self, client: TestClient, client_user_headers: dict, professional_user_headers: dict
    ):
        for headers in [client_user_headers, professional_user_headers]:
            assert client.get("/api/admins/professionals/pending", headers=headers).status_code == 403
            assert client.get("/api/admins/professionals", headers=headers).status_code == 403
            assert client.get("/api/admins/professionals/1/review", headers=headers).status_code == 403
            assert client.post("/api/admins/professionals/1/approve", headers=headers).status_code == 403
            assert client.post("/api/admins/professionals/1/reject", headers=headers, json={"reason": "motivo"}).status_code == 403

    def test_inactive_admin_returns_401(self, client: TestClient, inactive_admin_headers: dict):
        resp = client.get("/api/admins/professionals/pending", headers=inactive_admin_headers)
        assert resp.status_code == 401
        assert "inativo" in resp.json()["detail"].lower()


# ===========================================================================
# 2. Testes da Fila de Espera (Pending - FIFO)
# ===========================================================================


class TestAdminModerationPendingQueue:
    """Testes do endpoint /api/admins/professionals/pending."""

    def test_empty_pending_queue(self, client: TestClient, admin_user: dict):
        resp = client.get("/api/admins/professionals/pending", headers=admin_user["headers"])
        assert resp.status_code == 200
        assert resp.json() == []

    def test_pending_queue_fifo_order_and_filtering(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        # p1: submetido há 30 min (esperando mais tempo -> deve vir primeiro)
        p1 = helper_create_professional(
            db_session, name="Profissional Antigo", email="antigo@exemplo.com", submission_offset_minutes=30
        )
        helper_attach_document(db_session, p1.id, models.DocumentType.PHOTO_ID.value)
        helper_attach_document(db_session, p1.id, models.DocumentType.PROOF_OF_RESIDENCE.value)

        # p2: submetido há 5 min
        p2 = helper_create_professional(
            db_session, name="Profissional Recente", email="recente@exemplo.com", submission_offset_minutes=5
        )
        helper_attach_document(db_session, p2.id, models.DocumentType.PHOTO_ID.value)

        # p3: rascunho (documents_submitted_at é None) -> NÃO deve vir na fila de pendentes
        helper_create_professional(
            db_session, name="Profissional Rascunho", email="rascunho@exemplo.com", submitted=False
        )

        # p4: já aprovado -> NÃO deve vir na fila de pendentes
        helper_create_professional(
            db_session,
            name="Profissional Aprovado",
            email="aprovado@exemplo.com",
            status=models.ProfessionalApprovalStatus.APPROVED.value,
        )

        # p5: já reprovado -> NÃO deve vir na fila de pendentes
        helper_create_professional(
            db_session,
            name="Profissional Reprovado",
            email="reprovado@exemplo.com",
            status=models.ProfessionalApprovalStatus.REJECTED.value,
        )

        resp = client.get("/api/admins/professionals/pending", headers=admin_user["headers"])
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

        # Validação da ordenação FIFO
        assert data[0]["id"] == p1.id
        assert data[0]["name"] == "Profissional Antigo"
        assert data[0]["documents_count"] == 2
        assert data[0]["has_photo_id"] is True
        assert data[0]["has_proof_of_residence"] is True
        assert data[0]["is_complete"] is True

        assert data[1]["id"] == p2.id
        assert data[1]["name"] == "Profissional Recente"
        assert data[1]["documents_count"] == 1
        assert data[1]["has_photo_id"] is True
        assert data[1]["has_proof_of_residence"] is False
        assert data[1]["is_complete"] is False

    def test_pending_queue_pagination(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        for i in range(5):
            helper_create_professional(
                db_session, name=f"Prof {i}", email=f"prof{i}@exemplo.com", submission_offset_minutes=10 - i
            )

        resp_limit_2 = client.get(
            "/api/admins/professionals/pending?skip=0&limit=2", headers=admin_user["headers"]
        )
        assert resp_limit_2.status_code == 200
        assert len(resp_limit_2.json()) == 2

        resp_skip_2 = client.get(
            "/api/admins/professionals/pending?skip=2&limit=2", headers=admin_user["headers"]
        )
        assert resp_skip_2.status_code == 200
        assert len(resp_skip_2.json()) == 2
        assert resp_skip_2.json()[0]["id"] != resp_limit_2.json()[0]["id"]


# ===========================================================================
# 3. Testes da Listagem Geral e Filtros de Status
# ===========================================================================


class TestAdminModerationListAll:
    """Testes do endpoint /api/admins/professionals."""

    def test_list_with_status_filter(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        helper_create_professional(db_session, name="P1", email="p1@exemplo.com", status="pending_approval")
        helper_create_professional(db_session, name="P2", email="p2@exemplo.com", status="approved")
        helper_create_professional(db_session, name="P3", email="p3@exemplo.com", status="rejected")

        # Filtro pendentes
        r_pend = client.get("/api/admins/professionals?status=pending_approval", headers=admin_user["headers"])
        assert r_pend.status_code == 200
        assert all(item["approval_status"] == "pending_approval" for item in r_pend.json())

        # Filtro aprovados
        r_app = client.get("/api/admins/professionals?status=approved", headers=admin_user["headers"])
        assert r_app.status_code == 200
        assert all(item["approval_status"] == "approved" for item in r_app.json())

        # Filtro rejeitados
        r_rej = client.get("/api/admins/professionals?status=rejected", headers=admin_user["headers"])
        assert r_rej.status_code == 200
        assert all(item["approval_status"] == "rejected" for item in r_rej.json())

        # Filtro 'all' ou sem filtro
        r_all = client.get("/api/admins/professionals?status=all", headers=admin_user["headers"])
        assert r_all.status_code == 200
        assert len(r_all.json()) >= 3


# ===========================================================================
# 4. Testes de Detalhes para Auditoria (Review)
# ===========================================================================


class TestAdminModerationReview:
    """Testes do endpoint /api/admins/professionals/{id}/review."""

    def test_review_nonexistent_professional_returns_404(
        self, client: TestClient, admin_user: dict
    ):
        resp = client.get("/api/admins/professionals/999999/review", headers=admin_user["headers"])
        assert resp.status_code == 404
        assert "não encontrado" in resp.json()["detail"].lower()

    def test_review_success_with_documents_and_download_urls(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        prof = helper_create_professional(db_session, name="Eletricista Pro", email="eletro@exemplo.com")
        doc1 = helper_attach_document(db_session, prof.id, models.DocumentType.PHOTO_ID.value, "rg.pdf")
        doc2 = helper_attach_document(db_session, prof.id, models.DocumentType.PROOF_OF_RESIDENCE.value, "residencia.pdf")
        doc3 = helper_attach_document(db_session, prof.id, models.DocumentType.TECHNICAL_CERTIFICATE.value, "nr10.pdf")

        resp = client.get(f"/api/admins/professionals/{prof.id}/review", headers=admin_user["headers"])
        assert resp.status_code == 200
        data = resp.json()

        assert data["id"] == prof.id
        assert data["name"] == "Eletricista Pro"
        assert data["email"] == "eletro@exemplo.com"
        assert data["is_complete"] is True
        assert len(data["documents"]) == 3

        # Verifica URLs de download geradas
        doc_ids = [d["id"] for d in data["documents"]]
        assert doc1.id in doc_ids
        for doc in data["documents"]:
            assert f"/api/professionals/{prof.id}/documents/{doc['id']}/download" in doc["download_url"]


# ===========================================================================
# 5. Testes de Aprovação (Approve)
# ===========================================================================


class TestAdminModerationApprove:
    """Testes do endpoint /api/admins/professionals/{id}/approve."""

    def test_approve_nonexistent_returns_404(self, client: TestClient, admin_user: dict):
        resp = client.post("/api/admins/professionals/999999/approve", headers=admin_user["headers"])
        assert resp.status_code == 404

    def test_approve_missing_required_documents_returns_409(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        # Profissional sem comprovante de residência
        prof = helper_create_professional(db_session, email="incompleto@exemplo.com")
        helper_attach_document(db_session, prof.id, models.DocumentType.PHOTO_ID.value)

        resp = client.post(f"/api/admins/professionals/{prof.id}/approve", headers=admin_user["headers"])
        assert resp.status_code == 409
        assert "documentos obrigatórios ausentes" in resp.json()["detail"].lower()

    def test_approve_success_records_audit_and_sends_email(
        self, client: TestClient, admin_user: dict, db_session: Session, caixa_de_entrada
    ):
        prof = helper_create_professional(db_session, email="aprovando@exemplo.com")
        helper_attach_document(db_session, prof.id, models.DocumentType.PHOTO_ID.value)
        helper_attach_document(db_session, prof.id, models.DocumentType.PROOF_OF_RESIDENCE.value)

        resp = client.post(f"/api/admins/professionals/{prof.id}/approve", headers=admin_user["headers"])
        assert resp.status_code == 200
        data = resp.json()

        assert data["approval_status"] == "approved"
        assert data["approved_at"] is not None
        assert data["approved_by_id"] == admin_user["user"].id

        # Verifica persistência no banco
        db_session.expire_all()
        db_prof = db_session.query(models.Professional).filter_by(id=prof.id).first()
        assert db_prof.approval_status == "approved"
        assert db_prof.approved_by_id == admin_user["user"].id
        assert db_prof.approved_at is not None

        # Verifica e-mail enviado ao profissional
        assert len(caixa_de_entrada) == 1
        mensagem = caixa_de_entrada[0]
        assert mensagem["To"] == "aprovando@exemplo.com"
        assert "aprovados" in mensagem["Subject"].lower()
        corpo = mensagem.get_body(preferencelist=("plain",)).get_content()
        assert "APROVADO" in corpo

    def test_approve_already_approved_returns_409(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        prof = helper_create_professional(
            db_session,
            email="ja.aprovado@exemplo.com",
            status=models.ProfessionalApprovalStatus.APPROVED.value,
        )
        helper_attach_document(db_session, prof.id, models.DocumentType.PHOTO_ID.value)
        helper_attach_document(db_session, prof.id, models.DocumentType.PROOF_OF_RESIDENCE.value)

        resp = client.post(f"/api/admins/professionals/{prof.id}/approve", headers=admin_user["headers"])
        assert resp.status_code == 409
        assert "já se encontra com cadastro aprovado" in resp.json()["detail"].lower()


# ===========================================================================
# 6. Testes de Rejeição (Reject)
# ===========================================================================


class TestAdminModerationReject:
    """Testes do endpoint /api/admins/professionals/{id}/reject."""

    def test_reject_nonexistent_returns_404(self, client: TestClient, admin_user: dict):
        resp = client.post(
            "/api/admins/professionals/999999/reject",
            headers=admin_user["headers"],
            json={"reason": "Documentos ilegíveis."},
        )
        assert resp.status_code == 404

    def test_reject_validation_empty_or_short_reason_returns_422(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        prof = helper_create_professional(db_session, email="rejeitar.val@exemplo.com")

        # Sem reason
        r1 = client.post(f"/api/admins/professionals/{prof.id}/reject", headers=admin_user["headers"], json={})
        assert r1.status_code == 422

        # Reason com espaços em branco apenas
        r2 = client.post(f"/api/admins/professionals/{prof.id}/reject", headers=admin_user["headers"], json={"reason": "   "})
        assert r2.status_code == 422

        # Reason muito curto
        r3 = client.post(f"/api/admins/professionals/{prof.id}/reject", headers=admin_user["headers"], json={"reason": "no"})
        assert r3.status_code == 422

    def test_reject_professional_without_submission_returns_409(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        # Profissional que nunca clicou em submeter
        prof = helper_create_professional(db_session, email="sem.submissao@exemplo.com", submitted=False)

        resp = client.post(
            f"/api/admins/professionals/{prof.id}/reject",
            headers=admin_user["headers"],
            json={"reason": "Documentos não foram submetidos para análise."},
        )
        assert resp.status_code == 409
        assert "não submeteu documentos" in resp.json()["detail"].lower()

    def test_reject_success_records_notes_and_sends_email(
        self, client: TestClient, admin_user: dict, db_session: Session, caixa_de_entrada
    ):
        prof = helper_create_professional(db_session, email="rejeitando@exemplo.com")
        motivo = "Comprovante de residência vencido (mais de 90 dias). Favor enviar conta recente."

        resp = client.post(
            f"/api/admins/professionals/{prof.id}/reject",
            headers=admin_user["headers"],
            json={"reason": motivo},
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["approval_status"] == "rejected"
        assert data["approval_notes"] == motivo
        assert data["approved_at"] is None

        # Confere banco
        db_session.expire_all()
        db_prof = db_session.query(models.Professional).filter_by(id=prof.id).first()
        assert db_prof.approval_status == "rejected"
        assert db_prof.approval_notes == motivo
        assert db_prof.approved_at is None

        # Confere e-mail
        assert len(caixa_de_entrada) == 1
        mensagem = caixa_de_entrada[0]
        assert mensagem["To"] == "rejeitando@exemplo.com"
        assert "pendência" in mensagem["Subject"].lower()
        corpo = mensagem.get_body(preferencelist=("plain",)).get_content()
        assert motivo in corpo

    def test_reject_already_rejected_returns_409(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        prof = helper_create_professional(
            db_session,
            email="ja.reprovado@exemplo.com",
            status=models.ProfessionalApprovalStatus.REJECTED.value,
        )

        resp = client.post(
            f"/api/admins/professionals/{prof.id}/reject",
            headers=admin_user["headers"],
            json={"reason": "Reprovando novamente."},
        )
        assert resp.status_code == 409
        assert "já se encontra com cadastro reprovado" in resp.json()["detail"].lower()


# ===========================================================================
# 7. Regra de Vitrine Pública e Reabertura do Fluxo de Submissão
# ===========================================================================


class TestPublicDirectoryAndResubmissionWorkflow:
    """Testes de isolamento na vitrine pública e reenvio após reprovação."""

    def test_public_directory_only_shows_approved_professionals(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        p_pendente = helper_create_professional(db_session, name="Prof Pendente", email="pendente.vitrine@exemplo.com")
        p_rejeitado = helper_create_professional(
            db_session, name="Prof Rejeitado", email="rejeitado.vitrine@exemplo.com", status="rejected"
        )
        p_aprovado = helper_create_professional(
            db_session, name="Prof Aprovado", email="aprovado.vitrine@exemplo.com", status="approved"
        )

        # GET público na vitrine (com mascaramento LGPD)
        resp = client.get("/api/professionals")
        assert resp.status_code == 200
        ids_na_vitrine = [p["id"] for p in resp.json()]
        emails_na_vitrine = [p["email"] for p in resp.json()]

        assert p_aprovado.id in ids_na_vitrine
        assert "ap***e@exemplo.com" in emails_na_vitrine
        assert p_pendente.id not in ids_na_vitrine
        assert p_rejeitado.id not in ids_na_vitrine

        # Agora aprova o pendente pelo endpoint administrativo
        helper_attach_document(db_session, p_pendente.id, models.DocumentType.PHOTO_ID.value)
        helper_attach_document(db_session, p_pendente.id, models.DocumentType.PROOF_OF_RESIDENCE.value)
        r_app = client.post(f"/api/admins/professionals/{p_pendente.id}/approve", headers=admin_user["headers"])
        assert r_app.status_code == 200

        # Agora ele passa a aparecer na vitrine pública imediatamente
        resp_after = client.get("/api/professionals")
        ids_after = [p["id"] for p in resp_after.json()]
        emails_after = [p["email"] for p in resp_after.json()]
        assert p_pendente.id in ids_after
        assert "pe***e@exemplo.com" in emails_after

    def test_rejected_professional_can_resubmit_documents(
        self, client: TestClient, admin_user: dict, db_session: Session
    ):
        """
        Garante integração com /me/documents: quando reprovado, o profissional
        pode reenviar documentos e submeter novamente para análise.
        """
        # Cria profissional com User para autenticação em /me
        user = models.User(
            name="Profissional Reenvio",
            email="reenvio@exemplo.com",
            hashed_password=hash_senha("Prof@123456"),
            role=models.UserRole.PROFESSIONAL.value,
            is_active=True,
        )
        prof = helper_create_professional(
            db_session,
            name="Profissional Reenvio",
            email="reenvio@exemplo.com",
            status=models.ProfessionalApprovalStatus.PENDING.value,
        )
        helper_attach_document(db_session, prof.id, models.DocumentType.PHOTO_ID.value)
        helper_attach_document(db_session, prof.id, models.DocumentType.PROOF_OF_RESIDENCE.value)
        db_session.add(user)
        db_session.commit()

        token_prof = create_access_token({"sub": "reenvio@exemplo.com", "role": "professional"})
        prof_headers = {"Authorization": f"Bearer {token_prof}"}

        # 1. Admin reprova
        r_rej = client.post(
            f"/api/admins/professionals/{prof.id}/reject",
            headers=admin_user["headers"],
            json={"reason": "Foto do documento cortada. Reenvie o documento legível."},
        )
        assert r_rej.status_code == 200

        # 2. Profissional consulta seus documentos em /me
        r_me = client.get("/api/professionals/me/documents", headers=prof_headers)
        assert r_me.status_code == 200
        assert r_me.json()["approval_status"] == "rejected"
        assert r_me.json()["can_submit"] is True

        # 3. Profissional clica em submeter novamente
        r_submit = client.post("/api/professionals/me/documents/submit", headers=prof_headers)
        assert r_submit.status_code == 200
        assert r_submit.json()["approval_status"] == "pending_approval"

        # 4. Profissional volta para a fila de pendentes do admin
        r_pending = client.get("/api/admins/professionals/pending", headers=admin_user["headers"])
        assert any(item["email"] == "reenvio@exemplo.com" for item in r_pending.json())
