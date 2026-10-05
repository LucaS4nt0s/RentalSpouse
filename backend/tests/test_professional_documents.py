"""
Testes automatizados da Parte 1 da Issue #17:
- Modelagem e persistência de documentos de profissionais (ProfessionalDocument)
- Status de aprovação cadastral (approval_status: pending_approval, approved, rejected)
- Upload multipart de documentos obrigatórios (photo_id, proof_of_residence) e opcionais (technical_certificate, profile_photo)
- Resumo de conformidade da documentação (is_complete)
- Visualização e download seguro de arquivos
- Substituição e remoção de documentos
- Isolamento e proteção contra path traversal no storage
"""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

import models
import storage

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

DUMMY_PDF_BYTES = b"%PDF-1.4 dummy pdf content for testing validation"
DUMMY_PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 20
DUMMY_JPG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 20


@pytest.fixture
def temp_storage(tmp_path, monkeypatch):
    """Configura um diretório temporário isolado para armazenamento dos testes."""
    docs_dir = tmp_path / "documents"
    docs_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("DOCUMENTS_UPLOAD_DIR", str(docs_dir))
    return docs_dir


@pytest.fixture
def created_professional(client: TestClient) -> dict:
    """Cria um profissional padrão para os testes."""
    response = client.post("/api/professionals", json=SAMPLE_PROF)
    assert response.status_code == 201
    return response.json()


class TestUploadProfessionalDocuments:
    """Testes de upload multipart de documentos (POST /api/professionals/{id}/documents)."""

    def test_upload_photo_id_pdf_success(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]

        files = {
            "file": ("rg_frente_verso.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")
        }
        data = {"document_type": "photo_id"}

        response = client.post(f"/api/professionals/{prof_id}/documents", data=data, files=files)
        assert response.status_code == 201

        payload = response.json()
        assert payload["id"] is not None
        assert payload["professional_id"] == prof_id
        assert payload["document_type"] == "photo_id"
        assert payload["file_name"] == "rg_frente_verso.pdf"
        assert payload["file_size"] == len(DUMMY_PDF_BYTES)
        assert payload["mime_type"] == "application/pdf"
        assert f"/api/professionals/{prof_id}/documents/{payload['id']}/download" in payload["download_url"]

    def test_upload_proof_of_residence_image_success(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]

        files = {
            "file": ("conta_luz.png", io.BytesIO(DUMMY_PNG_BYTES), "image/png")
        }
        data = {"document_type": "proof_of_residence"}

        response = client.post(f"/api/professionals/{prof_id}/documents", data=data, files=files)
        assert response.status_code == 201

        payload = response.json()
        assert payload["document_type"] == "proof_of_residence"
        assert payload["file_name"] == "conta_luz.png"
        assert payload["mime_type"] == "image/png"

    def test_upload_technical_certificate_success(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]

        files = {
            "file": ("certificacao_senai.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")
        }
        data = {"document_type": "technical_certificate"}

        response = client.post(f"/api/professionals/{prof_id}/documents", data=data, files=files)
        assert response.status_code == 201
        assert response.json()["document_type"] == "technical_certificate"

    def test_upload_profile_photo_success(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]

        files = {
            "file": ("minha_foto.jpg", io.BytesIO(DUMMY_JPG_BYTES), "image/jpeg")
        }
        data = {"document_type": "profile_photo"}

        response = client.post(f"/api/professionals/{prof_id}/documents", data=data, files=files)
        assert response.status_code == 201
        assert response.json()["document_type"] == "profile_photo"

    def test_reupload_same_document_type_replaces_previous(self, client: TestClient, temp_storage, created_professional):
        """Ao enviar novo arquivo do mesmo tipo, o anterior é substituído física e logicamente."""
        prof_id = created_professional["id"]

        # Primeiro envio
        f1 = {"file": ("rg_antigo.pdf", io.BytesIO(b"%PDF-1.4 first upload"), "application/pdf")}
        r1 = client.post(f"/api/professionals/{prof_id}/documents", data={"document_type": "photo_id"}, files=f1)
        assert r1.status_code == 201
        doc1_id = r1.json()["id"]

        # Segundo envio do mesmo tipo
        f2 = {"file": ("rg_novo.pdf", io.BytesIO(b"%PDF-1.4 second upload"), "application/pdf")}
        r2 = client.post(f"/api/professionals/{prof_id}/documents", data={"document_type": "photo_id"}, files=f2)
        assert r2.status_code == 201
        assert r2.json()["id"] == doc1_id
        assert r2.json()["file_name"] == "rg_novo.pdf"

        # Verifica na listagem que existe apenas 1 documento
        docs_resp = client.get(f"/api/professionals/{prof_id}/documents")
        assert len(docs_resp.json()["documents"]) == 1

    def test_upload_professional_not_found(self, client: TestClient, temp_storage):
        files = {"file": ("doc.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")}
        response = client.post("/api/professionals/99999/documents", data={"document_type": "photo_id"}, files=files)
        assert response.status_code == 404
        assert "Profissional não encontrado" in response.json()["detail"]

    def test_upload_invalid_document_type(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]
        files = {"file": ("doc.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")}
        response = client.post(f"/api/professionals/{prof_id}/documents", data={"document_type": "tipo_inexistente"}, files=files)
        assert response.status_code == 422
        assert "Tipo de documento" in response.json()["detail"]

    def test_upload_empty_file_rejected(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]
        files = {"file": ("vazio.pdf", io.BytesIO(b""), "application/pdf")}
        response = client.post(f"/api/professionals/{prof_id}/documents", data={"document_type": "photo_id"}, files=files)
        assert response.status_code == 400
        assert "vazio" in response.json()["detail"]

    def test_upload_disallowed_extension(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]
        files = {"file": ("malware.exe", io.BytesIO(b"binary"), "application/octet-stream")}
        response = client.post(f"/api/professionals/{prof_id}/documents", data={"document_type": "photo_id"}, files=files)
        assert response.status_code == 400
        assert "não suportada" in response.json()["detail"]

    def test_upload_disallowed_mime_type(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]
        files = {"file": ("doc.pdf", io.BytesIO(DUMMY_PDF_BYTES), "text/html")}
        response = client.post(f"/api/professionals/{prof_id}/documents", data={"document_type": "photo_id"}, files=files)
        assert response.status_code == 400
        assert "Tipo MIME" in response.json()["detail"]

    def test_upload_exceeds_size_limit(self, client: TestClient, temp_storage, created_professional, monkeypatch):
        prof_id = created_professional["id"]
        # Reduz limite temporariamente para testar a rejeição de tamanho
        monkeypatch.setattr(storage, "MAX_FILE_SIZE_BYTES", 50)
        files = {"file": ("grande.pdf", io.BytesIO(DUMMY_PDF_BYTES * 10), "application/pdf")}
        response = client.post(f"/api/professionals/{prof_id}/documents", data={"document_type": "photo_id"}, files=files)
        assert response.status_code == 400
        assert "excede o limite" in response.json()["detail"]


class TestListAndCompletenessDocuments:
    """Testes de listagem e verificação de completude (GET /api/professionals/{id}/documents)."""

    def test_empty_documents_summary(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]
        response = client.get(f"/api/professionals/{prof_id}/documents")
        assert response.status_code == 200

        data = response.json()
        assert data["professional_id"] == prof_id
        assert data["approval_status"] == "pending_approval"
        assert data["has_photo_id"] is False
        assert data["has_proof_of_residence"] is False
        assert data["has_technical_certificate"] is False
        assert data["has_profile_photo"] is False
        assert data["is_complete"] is False
        assert data["documents"] == []

    def test_completeness_requires_both_photo_id_and_residence(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]

        # Envia apenas photo_id
        client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "photo_id"},
            files={"file": ("rg.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")},
        )
        s1 = client.get(f"/api/professionals/{prof_id}/documents").json()
        assert s1["has_photo_id"] is True
        assert s1["has_proof_of_residence"] is False
        assert s1["is_complete"] is False

        # Envia comprovante de residência -> agora fica completo
        client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "proof_of_residence"},
            files={"file": ("residencia.png", io.BytesIO(DUMMY_PNG_BYTES), "image/png")},
        )
        s2 = client.get(f"/api/professionals/{prof_id}/documents").json()
        assert s2["has_photo_id"] is True
        assert s2["has_proof_of_residence"] is True
        assert s2["is_complete"] is True
        assert len(s2["documents"]) == 2

    def test_list_documents_professional_not_found(self, client: TestClient, temp_storage):
        response = client.get("/api/professionals/99999/documents")
        assert response.status_code == 404


class TestDownloadAndSecurityDocuments:
    """Testes de download de documentos e validações de segurança."""

    def test_download_document_success(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]

        upload_resp = client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "photo_id"},
            files={"file": ("meu_documento.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")},
        )
        doc_id = upload_resp.json()["id"]

        download_resp = client.get(f"/api/professionals/{prof_id}/documents/{doc_id}/download")
        assert download_resp.status_code == 200
        assert download_resp.content == DUMMY_PDF_BYTES
        assert "application/pdf" in download_resp.headers["content-type"]

    def test_download_document_not_found_in_db(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]
        response = client.get(f"/api/professionals/{prof_id}/documents/99999/download")
        assert response.status_code == 404

    def test_download_document_from_different_professional_is_404(self, client: TestClient, temp_storage, created_professional):
        prof1_id = created_professional["id"]

        p2_data = dict(SAMPLE_PROF)
        p2_data["email"] = "outro.profissional@teste.com"
        prof2_id = client.post("/api/professionals", json=p2_data).json()["id"]

        upload_resp = client.post(
            f"/api/professionals/{prof1_id}/documents",
            data={"document_type": "photo_id"},
            files={"file": ("doc1.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")},
        )
        doc1_id = upload_resp.json()["id"]

        # Tenta acessar o doc1 pelo prof2
        response = client.get(f"/api/professionals/{prof2_id}/documents/{doc1_id}/download")
        assert response.status_code == 404

    def test_download_missing_physical_file_returns_404(self, client: TestClient, temp_storage, created_professional, db_session):
        prof_id = created_professional["id"]

        upload_resp = client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "photo_id"},
            files={"file": ("doc_temp.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")},
        )
        doc_id = upload_resp.json()["id"]

        # Remove o arquivo físico para simular perda de arquivo
        doc_db = db_session.query(models.ProfessionalDocument).filter_by(id=doc_id).first()
        storage.delete_document_file(doc_db.file_path)

        response = client.get(f"/api/professionals/{prof_id}/documents/{doc_id}/download")
        assert response.status_code == 404
        assert "não encontrado no servidor" in response.json()["detail"]


class TestDeleteProfessionalDocument:
    """Testes de exclusão de documentos (DELETE /api/professionals/{id}/documents/{doc_id})."""

    def test_delete_document_success(self, client: TestClient, temp_storage, created_professional, db_session):
        prof_id = created_professional["id"]

        upload_resp = client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "proof_of_residence"},
            files={"file": ("conta.png", io.BytesIO(DUMMY_PNG_BYTES), "image/png")},
        )
        doc_id = upload_resp.json()["id"]

        del_resp = client.delete(f"/api/professionals/{prof_id}/documents/{doc_id}")
        assert del_resp.status_code == 204

        # Confirma que foi excluído do DB
        assert db_session.query(models.ProfessionalDocument).filter_by(id=doc_id).first() is None

        # Confirma que foi removido do resumo
        summary = client.get(f"/api/professionals/{prof_id}/documents").json()
        assert summary["has_proof_of_residence"] is False
        assert len(summary["documents"]) == 0

    def test_delete_document_not_found(self, client: TestClient, temp_storage, created_professional):
        prof_id = created_professional["id"]
        response = client.delete(f"/api/professionals/{prof_id}/documents/99999")
        assert response.status_code == 404


class TestCascadeDeleteOnProfessional:
    """Testa que ao remover um profissional seus documentos e arquivos físicos são removidos."""

    def test_delete_professional_removes_physical_files(self, client: TestClient, temp_storage, created_professional, db_session):
        prof_id = created_professional["id"]

        upload_resp = client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "photo_id"},
            files={"file": ("cnh.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")},
        )
        doc_id = upload_resp.json()["id"]

        doc_db = db_session.query(models.ProfessionalDocument).filter_by(id=doc_id).first()
        file_path = storage.resolve_document_file_path(doc_db.file_path)
        assert file_path.is_file()

        # Remove o profissional
        del_prof = client.delete(f"/api/professionals/{prof_id}")
        assert del_prof.status_code == 204

        # Arquivo no disco deve ter sido apagado
        assert not file_path.is_file()


class TestApprovalStatusFilterInList:
    """Testa a listagem e filtros com o novo status de aprovação cadastral."""

    def test_filter_by_approval_status(self, client: TestClient, temp_storage, db_session):
        p1_data = dict(SAMPLE_PROF)
        p1_data["email"] = "p1@teste.com"
        prof1 = client.post("/api/professionals", json=p1_data).json()

        p2_data = dict(SAMPLE_PROF)
        p2_data["email"] = "p2@teste.com"
        prof2 = client.post("/api/professionals", json=p2_data).json()

        # Altera manualmente o prof2 para approved
        p2_db = db_session.query(models.Professional).filter_by(id=prof2["id"]).first()
        p2_db.approval_status = "approved"
        db_session.commit()

        # Listagem com filtro pending_approval
        pending_resp = client.get("/api/professionals?approval_status=pending_approval")
        assert pending_resp.status_code == 200
        pending_emails = [p["email"] for p in pending_resp.json()]
        assert "p1@teste.com" in pending_emails
        assert "p2@teste.com" not in pending_emails

        # Listagem com filtro approved
        approved_resp = client.get("/api/professionals?approval_status=approved")
        assert approved_resp.status_code == 200
        approved_emails = [p["email"] for p in approved_resp.json()]
        assert "p2@teste.com" in approved_emails
        assert "p1@teste.com" not in approved_emails


class TestStorageUnitRules:
    """Testes unitários direcionados para funções de segurança do storage."""

    def test_sanitize_filename(self):
        assert storage.sanitize_filename("../../../etc/passwd") == "passwd"
        assert storage.sanitize_filename("foto de perfil (1) @!.png") == "foto_de_perfil__1____.png"
        assert storage.sanitize_filename("") == "document"

    def test_resolve_path_traversal_detection(self, temp_storage):
        with pytest.raises(PermissionError):
            storage.resolve_document_file_path("../../secrets.txt")

    def test_delete_missing_file_returns_false(self, temp_storage):
        assert storage.delete_document_file("invalido/arquivo_inexistente.pdf") is False

    def test_validate_document_file_empty_name(self):
        with pytest.raises(ValueError, match="não pode ser vazio"):
            storage.validate_document_file("", "application/pdf", 100)

    def test_resolve_empty_path(self, temp_storage):
        with pytest.raises(ValueError, match="Caminho de arquivo inválido"):
            storage.resolve_document_file_path("")

    def test_delete_file_exception_returns_false(self, monkeypatch):
        monkeypatch.setattr(storage, "resolve_document_file_path", lambda x: (_ for _ in ()).throw(RuntimeError("disk error")))
        assert storage.delete_document_file("qualquer.pdf") is False


class TestAdditionalCoverageEdgeCases:
    """Testa casos de borda adicionais nas rotas de documentos."""

    def test_download_document_professional_not_found(self, client: TestClient, temp_storage):
        resp = client.get("/api/professionals/99999/documents/1/download")
        assert resp.status_code == 404
        assert "Profissional não encontrado" in resp.json()["detail"]

    def test_delete_document_professional_not_found(self, client: TestClient, temp_storage):
        resp = client.delete("/api/professionals/99999/documents/1")
        assert resp.status_code == 404
        assert "Profissional não encontrado" in resp.json()["detail"]

    def test_download_document_forbidden_on_permission_error(self, client: TestClient, temp_storage, created_professional, monkeypatch):
        prof_id = created_professional["id"]
        upload_resp = client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "photo_id"},
            files={"file": ("doc.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")},
        )
        doc_id = upload_resp.json()["id"]

        monkeypatch.setattr(storage, "resolve_document_file_path", lambda x: (_ for _ in ()).throw(PermissionError("traversal")))
        resp = client.get(f"/api/professionals/{prof_id}/documents/{doc_id}/download")
        assert resp.status_code == 403
        assert "Acesso não autorizado" in resp.json()["detail"]

    def test_download_document_bad_request_on_value_error(self, client: TestClient, temp_storage, created_professional, monkeypatch):
        prof_id = created_professional["id"]
        upload_resp = client.post(
            f"/api/professionals/{prof_id}/documents",
            data={"document_type": "photo_id"},
            files={"file": ("doc.pdf", io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")},
        )
        doc_id = upload_resp.json()["id"]

        monkeypatch.setattr(storage, "resolve_document_file_path", lambda x: (_ for _ in ()).throw(ValueError("bad path")))
        resp = client.get(f"/api/professionals/{prof_id}/documents/{doc_id}/download")
        assert resp.status_code == 400
        assert "Caminho de arquivo inválido" in resp.json()["detail"]
