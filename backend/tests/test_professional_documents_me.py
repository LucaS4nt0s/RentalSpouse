"""
Testes das rotas de documentos do profissional autenticado (issue #55 · Tarefa 1 · Fase B).

Cobrem GET/POST/DELETE `/api/professionals/me/documents`:

- 401 sem token, 403 para cliente/admin, 404 para e-mail sem perfil;
- escopo do dono (IDOR): profissional A nunca vê/altera documentos do B;
- validações de arquivo (extensão/tipo/MIME/magic bytes) e tipo de documento;
- bloqueio de edição após o envio para análise (409), com reabertura após rejeição;
- `/me` não é capturado pelo path param `{professional_id}` das rotas legadas.
"""

import io
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import models
import notificacoes
from security import create_access_token, hash_senha

URL_ME = "/api/professionals/me/documents"

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


@pytest.fixture
def temp_storage(tmp_path, monkeypatch):
    """Configura um diretório temporário isolado para armazenamento dos testes."""
    docs_dir = tmp_path / "documents"
    docs_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("DOCUMENTS_UPLOAD_DIR", str(docs_dir))
    return docs_dir


def criar_profissional(
    client: TestClient, email: str, senha: str | None = "SenhaForte@2026"
) -> dict:
    """Cria um profissional via API (com senha, gera também o registro em `users`)."""
    payload = dict(SAMPLE_PROF)
    payload["email"] = email
    if senha:
        payload["senha"] = senha
    resposta = client.post("/api/professionals", json=payload)
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def cabecalho(email: str) -> dict:
    """Cabeçalho Bearer para um profissional."""
    token = create_access_token(
        data={"sub": email, "role": models.UserRole.PROFESSIONAL.value}
    )
    return {"Authorization": f"Bearer {token}"}


def arquivo_pdf(nome: str = "rg.pdf") -> dict:
    return {"file": (nome, io.BytesIO(DUMMY_PDF_BYTES), "application/pdf")}


def arquivo_png(nome: str = "conta_luz.png") -> dict:
    return {"file": (nome, io.BytesIO(DUMMY_PNG_BYTES), "image/png")}


def requisicoes_protegidas(client: TestClient, headers: dict | None = None) -> list:
    """Dispara as rotas protegidas do router /me e devolve as respostas."""
    return [
        client.get(URL_ME, headers=headers),
        client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=headers,
        ),
        client.delete(f"{URL_ME}/1", headers=headers),
        client.post(f"{URL_ME}/submit", headers=headers),
    ]


class TestAcessoRestritoMeDocuments:
    """Autenticação e autorização das rotas /me/documents."""

    def test_sem_token_retorna_401(self, client: TestClient, temp_storage):
        for resposta in requisicoes_protegidas(client):
            assert resposta.status_code == 401

    def test_cliente_retorna_403(self, client: TestClient, temp_storage, db_session):
        cliente = models.User(
            name="Cliente Comum",
            email="cliente.me@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(cliente)
        db_session.commit()

        token = create_access_token({"sub": cliente.email, "role": "client"})
        for resposta in requisicoes_protegidas(
            client, headers={"Authorization": f"Bearer {token}"}
        ):
            assert resposta.status_code == 403

    def test_administrador_retorna_403(self, client: TestClient, temp_storage, db_session):
        admin = models.User(
            name="Administrador",
            email="admin.me@exemplo.com",
            hashed_password=hash_senha("SenhaForte@2026"),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()

        token = create_access_token({"sub": admin.email, "role": "admin"})
        for resposta in requisicoes_protegidas(
            client, headers={"Authorization": f"Bearer {token}"}
        ):
            assert resposta.status_code == 403

    def test_me_nao_e_capturado_pelo_path_param_de_profissional(
        self, client: TestClient, temp_storage
    ):
        """`/me` precisa ser roteado para o router novo, não para /{professional_id} (422)."""
        profissional = criar_profissional(client, "prof.me.ordem@exemplo.com")

        resposta = client.get(URL_ME, headers=cabecalho(profissional["email"]))

        assert resposta.status_code == 200, resposta.text
        assert resposta.json()["professional_id"] == profissional["id"]


class TestListagemMeDocuments:
    """Leitura do resumo de documentos do próprio profissional."""

    def test_rascunho_vazio(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.rascunho@exemplo.com")

        resposta = client.get(URL_ME, headers=cabecalho(profissional["email"]))

        assert resposta.status_code == 200
        corpo = resposta.json()
        assert corpo["professional_id"] == profissional["id"]
        assert corpo["approval_status"] == "pending_approval"
        assert corpo["documents"] == []
        assert corpo["has_photo_id"] is False
        assert corpo["has_proof_of_residence"] is False
        assert corpo["has_technical_certificate"] is False
        assert corpo["has_profile_photo"] is False
        assert corpo["is_complete"] is False
        assert corpo["submitted_at"] is None
        assert corpo["can_submit"] is False
        assert corpo["missing_required"] == ["photo_id", "proof_of_residence"]

    def test_resumo_com_um_dos_obrigatorios(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.parcial@exemplo.com")
        headers = cabecalho(profissional["email"])

        upload = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=headers,
        )
        assert upload.status_code == 201

        corpo = client.get(URL_ME, headers=headers).json()
        assert corpo["has_photo_id"] is True
        assert corpo["has_proof_of_residence"] is False
        assert corpo["is_complete"] is False
        assert corpo["can_submit"] is False
        assert corpo["missing_required"] == ["proof_of_residence"]
        assert len(corpo["documents"]) == 1


class TestUploadMeDocuments:
    """Upload (e substituição) de documentos restritos ao dono."""

    def test_upload_photo_id_pdf_sucesso(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.upload@exemplo.com")

        resposta = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf("rg_frente_verso.pdf"),
            headers=cabecalho(profissional["email"]),
        )

        assert resposta.status_code == 201
        corpo = resposta.json()
        assert corpo["professional_id"] == profissional["id"]
        assert corpo["document_type"] == "photo_id"
        assert corpo["file_name"] == "rg_frente_verso.pdf"
        assert corpo["file_size"] == len(DUMMY_PDF_BYTES)
        assert corpo["mime_type"] == "application/pdf"
        assert f"/api/professionals/{profissional['id']}/documents/" in corpo["download_url"]

    def test_upload_comprovante_de_residencia_sucesso(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.comprovante@exemplo.com")

        resposta = client.post(
            URL_ME,
            data={"document_type": "proof_of_residence"},
            files=arquivo_png(),
            headers={"Authorization": cabecalho(profissional["email"])["Authorization"]},
        )

        assert resposta.status_code == 201
        assert resposta.json()["document_type"] == "proof_of_residence"
        assert resposta.json()["mime_type"] == "image/png"

    def test_reenvio_do_mesmo_tipo_substitui_o_anterior(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.substitui@exemplo.com")
        headers = cabecalho(profissional["email"])

        primeiro = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf("rg_antigo.pdf"),
            headers=headers,
        )
        assert primeiro.status_code == 201

        segundo = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf("rg_novo.pdf"),
            headers=headers,
        )
        assert segundo.status_code == 201
        assert segundo.json()["id"] == primeiro.json()["id"]
        assert segundo.json()["file_name"] == "rg_novo.pdf"

        corpo = client.get(URL_ME, headers=headers).json()
        assert len(corpo["documents"]) == 1

    def test_tipo_de_documento_invalido_retorna_422(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.tipo.invalido@exemplo.com")

        resposta = client.post(
            URL_ME,
            data={"document_type": "tipo_inexistente"},
            files=arquivo_pdf(),
            headers=cabecalho(profissional["email"]),
        )

        assert resposta.status_code == 422
        assert "Tipo de documento" in resposta.json()["detail"]

    def test_extensao_nao_permitida_retorna_400(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.extensao@exemplo.com")

        resposta = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files={"file": ("malware.exe", io.BytesIO(b"binary"), "application/octet-stream")},
            headers=cabecalho(profissional["email"]),
        )

        assert resposta.status_code == 400
        assert "não suportada" in resposta.json()["detail"]

    def test_conteudo_incompativel_com_a_extensao_retorna_400(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.magic@exemplo.com")

        resposta = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files={"file": ("falso.pdf", io.BytesIO(b"texto puro"), "application/pdf")},
            headers=cabecalho(profissional["email"]),
        )

        assert resposta.status_code == 400
        assert "assinatura inválida" in resposta.json()["detail"]


class TestDeleteMeDocuments:
    """Exclusão de documentos restrita ao dono."""

    def test_delete_sucesso_204(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.delete@exemplo.com")
        headers = cabecalho(profissional["email"])

        doc_id = client.post(
            URL_ME,
            data={"document_type": "proof_of_residence"},
            files=arquivo_png(),
            headers=headers,
        ).json()["id"]

        resposta = client.delete(f"{URL_ME}/{doc_id}", headers=headers)

        assert resposta.status_code == 204
        corpo = client.get(URL_ME, headers=headers).json()
        assert corpo["documents"] == []
        assert corpo["has_proof_of_residence"] is False

    def test_delete_documento_inexistente_retorna_404(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.delete.404@exemplo.com")

        resposta = client.delete(
            f"{URL_ME}/99999", headers=cabecalho(profissional["email"])
        )

        assert resposta.status_code == 404

    def test_idor_delete_de_documento_de_outro_profissional_retorna_404(
        self, client: TestClient, temp_storage
    ):
        dono = criar_profissional(client, "prof.dono@exemplo.com")
        intruso = criar_profissional(client, "prof.intruso@exemplo.com")

        doc_id = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=cabecalho(dono["email"]),
        ).json()["id"]

        resposta = client.delete(
            f"{URL_ME}/{doc_id}", headers=cabecalho(intruso["email"])
        )

        assert resposta.status_code == 404
        # O documento do dono permanece intacto
        corpo = client.get(URL_ME, headers=cabecalho(dono["email"])).json()
        assert len(corpo["documents"]) == 1

    def test_listagem_nao_mostra_documentos_de_outros(self, client: TestClient, temp_storage):
        dono = criar_profissional(client, "prof.visivel@exemplo.com")
        outro = criar_profissional(client, "prof.invisivel@exemplo.com")

        client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=cabecalho(dono["email"]),
        )

        corpo = client.get(URL_ME, headers=cabecalho(outro["email"])).json()
        assert corpo["documents"] == []
        assert corpo["has_photo_id"] is False


def marcar_envio(
    db_session,
    professional_id: int,
    approval_status: str = models.ProfessionalApprovalStatus.PENDING.value,
) -> None:
    """Simula, direto no banco, um envio já realizado para análise."""
    registro = (
        db_session.query(models.Professional)
        .filter(models.Professional.id == professional_id)
        .first()
    )
    registro.documents_submitted_at = datetime.now(timezone.utc)
    registro.approval_status = approval_status
    db_session.commit()


class TestBloqueioAposEnvio:
    """Bloqueio de edição após o envio para análise (exceto quando rejeitado)."""

    def test_upload_bloqueado_apos_envio_retorna_409(
        self, client: TestClient, temp_storage, db_session
    ):
        profissional = criar_profissional(client, "prof.bloqueado@exemplo.com")
        marcar_envio(db_session, profissional["id"])

        resposta = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=cabecalho(profissional["email"]),
        )

        assert resposta.status_code == 409
        assert "não podem ser alterados" in resposta.json()["detail"]

    def test_delete_bloqueado_apos_envio_retorna_409(
        self, client: TestClient, temp_storage, db_session
    ):
        profissional = criar_profissional(client, "prof.bloqueado.delete@exemplo.com")
        headers = cabecalho(profissional["email"])

        doc_id = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=headers,
        ).json()["id"]

        marcar_envio(db_session, profissional["id"])

        resposta = client.delete(f"{URL_ME}/{doc_id}", headers=headers)

        assert resposta.status_code == 409

    def test_envio_rejeitado_reabre_a_edicao(
        self, client: TestClient, temp_storage, db_session
    ):
        profissional = criar_profissional(client, "prof.rejeitado@exemplo.com")
        headers = cabecalho(profissional["email"])

        doc_id = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=headers,
        ).json()["id"]

        marcar_envio(
            db_session,
            profissional["id"],
            approval_status=models.ProfessionalApprovalStatus.REJECTED.value,
        )

        # Com o envio rejeitado, o profissional pode substituir e remover documentos
        substituicao = client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf("rg_corrigido.pdf"),
            headers=headers,
        )
        assert substituicao.status_code == 201

        remocao = client.delete(f"{URL_ME}/{doc_id}", headers=headers)
        assert remocao.status_code == 204

        # E, com os 2 obrigatórios anexados, pode reenviar para análise
        client.post(
            URL_ME,
            data={"document_type": "photo_id"},
            files=arquivo_pdf(),
            headers=headers,
        )
        client.post(
            URL_ME,
            data={"document_type": "proof_of_residence"},
            files=arquivo_png(),
            headers=headers,
        )
        corpo = client.get(URL_ME, headers=headers).json()
        assert corpo["missing_required"] == []
        assert corpo["can_submit"] is True


def criar_admin(db_session, email: str = "admin.submit@rentalspouse.com") -> models.User:
    """Cria um administrador ativo diretamente no banco de testes."""
    admin = models.User(
        name="Administrador de Teste",
        email=email,
        hashed_password="hash-nao-usado-nos-testes",
        role=models.UserRole.ADMIN.value,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return admin


def anexar_obrigatorios(client: TestClient, headers: dict) -> None:
    """Anexa os dois documentos obrigatórios (photo_id + proof_of_residence)."""
    resposta_foto = client.post(
        URL_ME,
        data={"document_type": "photo_id"},
        files=arquivo_pdf(),
        headers=headers,
    )
    assert resposta_foto.status_code == 201, resposta_foto.text

    resposta_comprovante = client.post(
        URL_ME,
        data={"document_type": "proof_of_residence"},
        files=arquivo_png(),
        headers=headers,
    )
    assert resposta_comprovante.status_code == 201, resposta_comprovante.text


class TestSubmitMeDocuments:
    """Envio para análise: validação de obrigatórios, estado, bloqueio e notificação."""

    def test_submit_sem_documentos_retorna_422_com_faltantes(
        self, client: TestClient, temp_storage
    ):
        profissional = criar_profissional(client, "prof.submit.vazio@exemplo.com")

        resposta = client.post(
            f"{URL_ME}/submit", headers=cabecalho(profissional["email"])
        )

        assert resposta.status_code == 422
        detalhe = resposta.json()["detail"]
        assert detalhe["missing_required"] == ["photo_id", "proof_of_residence"]
        assert "obrigatórios" in detalhe["message"]

    def test_submit_com_apenas_um_obrigatorio_ainda_retorna_422(
        self, client: TestClient, temp_storage
    ):
        profissional = criar_profissional(client, "prof.submit.parcial@exemplo.com")
        headers = cabecalho(profissional["email"])

        assert (
            client.post(
                URL_ME,
                data={"document_type": "photo_id"},
                files=arquivo_pdf(),
                headers=headers,
            ).status_code
            == 201
        )

        resposta = client.post(f"{URL_ME}/submit", headers=headers)

        assert resposta.status_code == 422
        assert resposta.json()["detail"]["missing_required"] == ["proof_of_residence"]

        # Envio não marcado: continua em rascunho
        corpo = client.get(URL_ME, headers=headers).json()
        assert corpo["submitted_at"] is None
        assert corpo["can_submit"] is False

    def test_submit_sucesso_marca_envio_e_notifica_admins(
        self, client: TestClient, temp_storage, db_session, caixa_de_entrada
    ):
        criar_admin(db_session, "admin.submit@rentalspouse.com")
        profissional = criar_profissional(client, "prof.submit.ok@exemplo.com")
        headers = cabecalho(profissional["email"])
        anexar_obrigatorios(client, headers)

        resposta = client.post(f"{URL_ME}/submit", headers=headers)

        assert resposta.status_code == 200, resposta.text
        corpo = resposta.json()
        assert corpo["professional_id"] == profissional["id"]
        assert corpo["submitted_at"] is not None
        assert corpo["approval_status"] == "pending_approval"
        assert corpo["is_complete"] is True
        assert corpo["can_submit"] is False
        assert corpo["missing_required"] == []

        # O estado também é refletido na listagem
        assert client.get(URL_ME, headers=headers).json()["submitted_at"] == corpo["submitted_at"]

        # Administrador ativo recebeu o e-mail simples
        assert len(caixa_de_entrada) == 1
        mensagem = caixa_de_entrada[0]
        assert mensagem["To"] == "admin.submit@rentalspouse.com"
        assert mensagem["Subject"] == notificacoes.ASSUNTO_DOCUMENTOS_ENVIADOS
        texto = mensagem.get_body(preferencelist=("plain",)).get_content()
        assert profissional["email"] in texto
        assert SAMPLE_PROF["name"] in texto

    def test_submit_repetido_retorna_409(self, client: TestClient, temp_storage):
        profissional = criar_profissional(client, "prof.submit.repetido@exemplo.com")
        headers = cabecalho(profissional["email"])
        anexar_obrigatorios(client, headers)

        assert client.post(f"{URL_ME}/submit", headers=headers).status_code == 200

        repetido = client.post(f"{URL_ME}/submit", headers=headers)
        assert repetido.status_code == 409
        assert "não podem ser alterados" in repetido.json()["detail"]

    def test_upload_e_delete_bloqueados_apos_submit_real(
        self, client: TestClient, temp_storage
    ):
        profissional = criar_profissional(client, "prof.submit.bloqueio@exemplo.com")
        headers = cabecalho(profissional["email"])
        anexar_obrigatorios(client, headers)

        assert client.post(f"{URL_ME}/submit", headers=headers).status_code == 200

        doc_id = client.get(URL_ME, headers=headers).json()["documents"][0]["id"]

        upload_bloqueado = client.post(
            URL_ME,
            data={"document_type": "profile_photo"},
            files=arquivo_png("foto.png"),
            headers=headers,
        )
        assert upload_bloqueado.status_code == 409

        delete_bloqueado = client.delete(f"{URL_ME}/{doc_id}", headers=headers)
        assert delete_bloqueado.status_code == 409

    def test_reenvio_apos_rejeicao_atualiza_data_e_notifica_de_novo(
        self, client: TestClient, temp_storage, db_session, caixa_de_entrada
    ):
        criar_admin(db_session)
        profissional = criar_profissional(client, "prof.reenvio@exemplo.com")
        headers = cabecalho(profissional["email"])
        anexar_obrigatorios(client, headers)

        primeiro = client.post(f"{URL_ME}/submit", headers=headers)
        assert primeiro.status_code == 200
        assert len(caixa_de_entrada) == 1

        # Administrador rejeita o envio
        registro = (
            db_session.query(models.Professional)
            .filter(models.Professional.id == profissional["id"])
            .first()
        )
        registro.approval_status = models.ProfessionalApprovalStatus.REJECTED.value
        db_session.commit()

        reenvio = client.post(f"{URL_ME}/submit", headers=headers)

        assert reenvio.status_code == 200, reenvio.text
        corpo = reenvio.json()
        assert corpo["approval_status"] == "pending_approval"
        assert corpo["submitted_at"] is not None
        assert datetime.fromisoformat(corpo["submitted_at"]) >= datetime.fromisoformat(
            primeiro.json()["submitted_at"]
        )
        assert len(caixa_de_entrada) == 2

    def test_submit_considera_apenas_documentos_do_proprio_profissional(
        self, client: TestClient, temp_storage
    ):
        profissional_a = criar_profissional(client, "prof.a@exemplo.com")
        profissional_b = criar_profissional(client, "prof.b@exemplo.com")
        headers_a = cabecalho(profissional_a["email"])
        headers_b = cabecalho(profissional_b["email"])

        anexar_obrigatorios(client, headers_a)

        # B não possui documentos; os de A não podem habilitar o envio de B
        resposta = client.post(f"{URL_ME}/submit", headers=headers_b)
        assert resposta.status_code == 422
        assert resposta.json()["detail"]["missing_required"] == [
            "photo_id",
            "proof_of_residence",
        ]

        # E o envio de A permanece intacto
        assert client.get(URL_ME, headers=headers_a).json()["submitted_at"] is None

    def test_falha_de_email_nao_impede_submissao(
        self, client: TestClient, temp_storage, db_session, monkeypatch, caixa_de_entrada
    ):
        criar_admin(db_session, "admin.sem.smtp@rentalspouse.com")
        profissional = criar_profissional(client, "prof.sem.smtp@exemplo.com")
        headers = cabecalho(profissional["email"])
        anexar_obrigatorios(client, headers)

        # SMTP mal configurado: obter_transporte levanta ErroEnvioEmail
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.delenv("SMTP_HOST", raising=False)

        resposta = client.post(f"{URL_ME}/submit", headers=headers)

        assert resposta.status_code == 200
        assert resposta.json()["submitted_at"] is not None
        assert caixa_de_entrada == []
