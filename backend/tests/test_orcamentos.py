"""
Testes automatizados da API de Solicitação de Orçamentos com Fotos (Issue #22).

Valida criação com e sem fotos, limites de tamanho e quantidade, validação
estrita de magic bytes, controle de acesso e fluxo de resposta do profissional.
"""

import io
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

import models
from security import create_access_token, hash_senha
import storage


# Imagens mínimas válidas com magic bytes autênticos
PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
WEBP_BYTES = b"RIFF\x1a\x00\x00\x00WEBPVP8L\x0e\x00\x00\x00/\x00\x00\x00\x00\x07\x01\x02\x88\x85%P\x00"


@pytest.fixture
def profissional_teste(db_session: Session) -> models.Professional:
    """Cria um profissional ativo e aprovado no banco de testes."""
    prof = models.Professional(
        name="Carlos Eletricista",
        email="carlos.eletro@exemplo.com",
        phone="11999998888",
        bio="Especialista em instalações residenciais e prediais.",
        service_radius_km=30.0,
        specialties=["Eletricista", "Instalações"],
        city="São Paulo",
        state="SP",
        senha_hash=hash_senha("SenhaForte@123"),
        is_active=True,
        approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
    )
    db_session.add(prof)
    db_session.commit()
    db_session.refresh(prof)
    return prof


@pytest.fixture
def cliente_teste(db_session: Session) -> models.Cliente:
    """Cria um cliente cadastrado no banco de testes."""
    from datetime import date
    cli = models.Cliente(
        nome="Mariana Souza",
        email="mariana.souza@exemplo.com",
        cpf="12345678901",
        data_nascimento=date(1995, 5, 20),
        senha_hash=hash_senha("SenhaCliente@123"),
        cep="01310100",
        logradouro="Avenida Paulista",
        numero="1000",
        bairro="Bela Vista",
        cidade="São Paulo",
        estado="SP",
        email_verificado=True,
    )
    db_session.add(cli)
    db_session.commit()
    db_session.refresh(cli)
    return cli


class TestCriarOrcamento:
    """Validação da rota POST /api/orcamentos."""

    def test_criar_orcamento_sem_fotos_cliente_convidado(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Preciso trocar o disjuntor principal do quadro de energia.",
            "cliente_nome": "João Visitante",
            "cliente_email": "joao.visitante@exemplo.com",
            "cliente_telefone": "11988887777",
        }
        res = client.post("/api/orcamentos", data=data)
        assert res.status_code == 201
        corpo = res.json()
        assert corpo["id"] > 0
        assert corpo["professional_id"] == profissional_teste.id
        assert corpo["cliente_nome"] == "João Visitante"
        assert corpo["cliente_email"] == "joao.visitante@exemplo.com"
        assert corpo["status"] == "pendente"
        assert corpo["fotos"] == []

    def test_criar_orcamento_com_cliente_autenticado(
        self, client: TestClient, profissional_teste: models.Professional, cliente_teste: models.Cliente, db_session: Session
    ):
        # Cria User correspondente para autenticação
        user = models.User(
            name=cliente_teste.nome,
            email=cliente_teste.email,
            hashed_password=cliente_teste.senha_hash,
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

        token = create_access_token({"sub": cliente_teste.email, "role": "client"})
        headers = {"Authorization": f"Bearer {token}"}

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de 4 tomadas 20A na cozinha e sala.",
        }
        res = client.post("/api/orcamentos", data=data, headers=headers)
        assert res.status_code == 201
        corpo = res.json()
        assert corpo["cliente_id"] == cliente_teste.id
        assert corpo["cliente_nome"] == cliente_teste.nome
        assert corpo["cliente_email"] == cliente_teste.email

    def test_criar_orcamento_com_fotos_validas(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Vazamento aparente no cano sob a pia da cozinha.",
            "cliente_nome": "Carlos Cliente",
            "cliente_email": "carlos.cliente@exemplo.com",
        }
        files = [
            ("fotos", ("foto1.png", io.BytesIO(PNG_BYTES), "image/png")),
            ("fotos", ("foto2.jpg", io.BytesIO(JPEG_BYTES), "image/jpeg")),
        ]
        res = client.post("/api/orcamentos", data=data, files=files)
        assert res.status_code == 201
        corpo = res.json()
        assert len(corpo["fotos"]) == 2
        assert corpo["fotos"][0]["mime_type"] == "image/png"
        assert corpo["fotos"][1]["mime_type"] == "image/jpeg"
        assert "/api/orcamentos/" in corpo["fotos"][0]["url_download"]

    def test_rejeita_profissional_inexistente(self, client: TestClient):
        data = {
            "professional_id": "99999",
            "descricao": "Solicitação para profissional que não existe.",
            "cliente_nome": "Ana Souza",
            "cliente_email": "ana@exemplo.com",
        }
        res = client.post("/api/orcamentos", data=data)
        assert res.status_code == 404
        assert "não encontrado" in res.json()["detail"]

    def test_rejeita_descricao_muito_curta(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Curta",
            "cliente_nome": "Ana Souza",
            "cliente_email": "ana@exemplo.com",
        }
        res = client.post("/api/orcamentos", data=data)
        assert res.status_code == 422
        assert "pelo menos 10 caracteres" in res.json()["detail"]

    def test_rejeita_cliente_convidado_sem_dados(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Descrição válida de problema elétrico.",
            "cliente_nome": "",
            "cliente_email": "",
        }
        res = client.post("/api/orcamentos", data=data)
        assert res.status_code == 422

    def test_rejeita_excesso_de_fotos(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Problema com fiação e tomada quebrada.",
            "cliente_nome": "Lucas Cliente",
            "cliente_email": "lucas@exemplo.com",
        }
        # 6 fotos (limite é 5)
        files = [("fotos", (f"foto{i}.png", io.BytesIO(PNG_BYTES), "image/png")) for i in range(6)]
        res = client.post("/api/orcamentos", data=data, files=files)
        assert res.status_code == 400
        assert "no máximo 5 fotos" in res.json()["detail"]

    def test_rejeita_foto_com_magic_bytes_invalidos(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Problema elétrico com tentativa de upload malicioso.",
            "cliente_nome": "Hacker Fake",
            "cliente_email": "hacker@exemplo.com",
        }
        # Conteúdo falso fingindo ser PNG
        files = [("fotos", ("malicioso.png", io.BytesIO(b"NAO_E_UM_PNG_VALIDO"), "image/png"))]
        res = client.post("/api/orcamentos", data=data, files=files)
        assert res.status_code == 400
        assert "não corresponde a uma imagem válida" in res.json()["detail"]

    def test_rejeita_foto_com_extensao_proibida(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Problema com documento pdf enviado como foto.",
            "cliente_nome": "Cliente Teste",
            "cliente_email": "cliente@exemplo.com",
        }
        files = [("fotos", ("documento.pdf", io.BytesIO(b"%PDF-1.5"), "application/pdf"))]
        res = client.post("/api/orcamentos", data=data, files=files)
        assert res.status_code == 400
        assert "não permitida para fotos" in res.json()["detail"]


class TestConsultarEBaixarFotos:
    """Validação de GET /api/orcamentos/{id} e download de fotos."""

    def test_consultar_orcamento_e_baixar_foto(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        # 1. Cria orçamento com uma foto
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Troca de tomada queimada na sala de estar.",
            "cliente_nome": "Bruna Lima",
            "cliente_email": "bruna@exemplo.com",
        }
        files = [("fotos", ("tomada.png", io.BytesIO(PNG_BYTES), "image/png"))]
        res_post = client.post("/api/orcamentos", data=data, files=files)
        assert res_post.status_code == 201
        orcamento_id = res_post.json()["id"]
        foto_id = res_post.json()["fotos"][0]["id"]

        # 2. Consulta detalhes
        res_get = client.get(f"/api/orcamentos/{orcamento_id}")
        assert res_get.status_code == 200
        assert res_get.json()["id"] == orcamento_id

        # 3. Baixa foto
        res_foto = client.get(f"/api/orcamentos/{orcamento_id}/fotos/{foto_id}")
        assert res_foto.status_code == 200
        assert res_foto.content == PNG_BYTES
        assert res_foto.headers["content-type"] == "image/png"

    def test_consultar_orcamento_inexistente_retorna_404(self, client: TestClient):
        res = client.get("/api/orcamentos/99999")
        assert res.status_code == 404

    def test_baixar_foto_inexistente_retorna_404(
        self, client: TestClient, profissional_teste: models.Professional
    ):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Troca de disjuntor sem foto anexada.",
            "cliente_nome": "Bruna Lima",
            "cliente_email": "bruna@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        res_foto = client.get(f"/api/orcamentos/{orcamento_id}/fotos/99999")
        assert res_foto.status_code == 404


class TestResponderOrcamento:
    """Validação da rota PATCH /api/orcamentos/{id}/responder (Issue #22 / #34)."""

    def test_profissional_responde_orcamento_com_sucesso(
        self, client: TestClient, profissional_teste: models.Professional, db_session: Session
    ):
        # 1. Cria usuário e token para o profissional
        user_prof = models.User(
            name=profissional_teste.name,
            email=profissional_teste.email,
            hashed_password=profissional_teste.senha_hash,
            role=models.UserRole.PROFESSIONAL.value,
            is_active=True,
        )
        db_session.add(user_prof)
        db_session.commit()

        token_prof = create_access_token({"sub": profissional_teste.email, "role": "professional"})
        headers_prof = {"Authorization": f"Bearer {token_prof}"}

        # 2. Cria orçamento
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação completa de ventilador de teto.",
            "cliente_nome": "Patricia Silva",
            "cliente_email": "patricia@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # 3. Profissional responde com valor estimado
        payload = {
            "valor_estimado": 180.50,
            "resposta_profissional": "Consigo realizar o serviço na quinta-feira. Material não incluso.",
        }
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/responder", json=payload, headers=headers_prof)
        assert res_patch.status_code == 200
        corpo = res_patch.json()
        assert corpo["status"] == "respondido"
        assert corpo["valor_estimado"] == 180.50
        assert corpo["resposta_profissional"] == payload["resposta_profissional"]
        assert corpo["respondido_em"] is not None

    def test_rejeita_resposta_de_outro_usuario_nao_autorizado(
        self, client: TestClient, profissional_teste: models.Professional, db_session: Session
    ):
        # Outro profissional
        outro_user = models.User(
            name="Outro Usuário",
            email="outro@exemplo.com",
            hashed_password="hash",
            role=models.UserRole.PROFESSIONAL.value,
            is_active=True,
        )
        db_session.add(outro_user)
        db_session.commit()

        token_outro = create_access_token({"sub": "outro@exemplo.com", "role": "professional"})
        headers_outro = {"Authorization": f"Bearer {token_outro}"}

        # Cria orçamento para o profissional_teste
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de lâmpadas tubulares de LED.",
            "cliente_nome": "Patricia Silva",
            "cliente_email": "patricia@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        payload = {
            "valor_estimado": 200.0,
            "resposta_profissional": "Tentativa indevida de resposta.",
        }
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/responder", json=payload, headers=headers_outro)
        assert res_patch.status_code == 403
        assert "Apenas o profissional destinatário" in res_patch.json()["detail"]


class TestListarMeusOrcamentos:
    """Validação da rota GET /api/orcamentos/me."""

    def test_profissional_lista_seus_orcamentos(
        self, client: TestClient, profissional_teste: models.Professional, db_session: Session
    ):
        user_prof = models.User(
            name=profissional_teste.name,
            email=profissional_teste.email,
            hashed_password=profissional_teste.senha_hash,
            role=models.UserRole.PROFESSIONAL.value,
            is_active=True,
        )
        db_session.add(user_prof)
        db_session.commit()

        token_prof = create_access_token({"sub": profissional_teste.email, "role": "professional"})
        headers_prof = {"Authorization": f"Bearer {token_prof}"}

        # Cria 2 orçamentos
        for i in range(2):
            data = {
                "professional_id": str(profissional_teste.id),
                "descricao": f"Serviço elétrico número {i+1} detalhado.",
                "cliente_nome": f"Cliente {i+1}",
                "cliente_email": f"cliente{i+1}@exemplo.com",
            }
            client.post("/api/orcamentos", data=data)

        res = client.get("/api/orcamentos/me", headers=headers_prof)
        assert res.status_code == 200
        assert len(res.json()) >= 2
