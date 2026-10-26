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

    def test_rejeita_resposta_orcamento_ja_aceito_400(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de lâmpadas tubulares de LED.",
            "cliente_nome": "Patricia Silva",
            "cliente_email": "patricia@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Aceita o orçamento
        res_aceite = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json={}, headers=headers_prof)
        assert res_aceite.status_code == 200
        assert res_aceite.json()["status"] == "aceito"

        # Tenta responder após o aceite -> 400
        res_resp = client.patch(
            f"/api/orcamentos/{orcamento_id}/responder",
            json={"valor_estimado": 150.0, "resposta_profissional": "Tentativa de nova estimativa."},
            headers=headers_prof,
        )
        assert res_resp.status_code == 400
        assert "Esta solicitação já foi decidida e não pode receber nova estimativa." in res_resp.json()["detail"]

    def test_rejeita_resposta_orcamento_ja_recusado_400(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de tomadas.",
            "cliente_nome": "Roberto",
            "cliente_email": "roberto@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Recusa o orçamento
        res_rec = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "Agenda lotada"},
            headers=headers_prof,
        )
        assert res_rec.status_code == 200

        # Tenta responder -> 400
        res_resp = client.patch(
            f"/api/orcamentos/{orcamento_id}/responder",
            json={"valor_estimado": 150.0, "resposta_profissional": "Estimativa após recusa."},
            headers=headers_prof,
        )
        assert res_resp.status_code == 400
        assert "Esta solicitação já foi decidida e não pode receber nova estimativa." in res_resp.json()["detail"]

    def test_encadeamento_aceito_responder_recusar_mantem_estado_aceito(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Reforma do quadro de distribuição.",
            "cliente_nome": "Carlos Cliente",
            "cliente_email": "carlos_cli@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # 1. Aceita -> 200
        res_aceite = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json={}, headers=headers_prof)
        assert res_aceite.status_code == 200
        assert res_aceite.json()["status"] == "aceito"

        # 2. Tenta burlar transição via responder -> 400
        res_resp = client.patch(
            f"/api/orcamentos/{orcamento_id}/responder",
            json={"valor_estimado": 250.0, "resposta_profissional": "Tentativa de burla de estado."},
            headers=headers_prof,
        )
        assert res_resp.status_code == 400

        # 3. Tenta recusar após tentativa de responder -> continua 400 porque segue aceito
        res_rec = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "Mudei de ideia"},
            headers=headers_prof,
        )
        assert res_rec.status_code == 400
        assert "já foi aceita" in res_rec.json()["detail"]

        # 4. Confirma que no banco o status permanece "aceito"
        orc = db_session.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
        assert orc.status == "aceito"


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
        # Verifica se o professional_name é retornado
        assert res.json()[0]["professional_name"] == profissional_teste.name

    def test_cliente_lista_seus_orcamentos_e_filtra_por_status(
        self, client: TestClient, profissional_teste: models.Professional, db_session: Session
    ):
        from datetime import date
        email_cliente = "carolina.cliente@exemplo.com"
        user_cli = models.User(
            name="Carolina Cliente",
            email=email_cliente,
            hashed_password=hash_senha("Senha123!"),
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        cli = models.Cliente(
            nome="Carolina Cliente",
            email=email_cliente,
            cpf="98765432100",
            data_nascimento=date(1995, 5, 20),
            senha_hash=hash_senha("Senha123!"),
            cep="01310100",
            logradouro="Rua Teste",
            numero="123",
            bairro="Centro",
            cidade="São Paulo",
            estado="SP",
            email_verificado=True,
        )
        db_session.add(user_cli)
        db_session.add(cli)
        db_session.commit()

        token_cli = create_access_token({"sub": email_cliente, "role": "client"})
        headers_cli = {"Authorization": f"Bearer {token_cli}"}

        # Cria orçamento da Carolina
        client.post(
            "/api/orcamentos",
            data={
                "professional_id": str(profissional_teste.id),
                "descricao": "Instalação de lustre de cristal na sala de jantar.",
                "cliente_nome": "Carolina Cliente",
                "cliente_email": email_cliente,
            },
        )

        # Cria orçamento de outro cliente
        client.post(
            "/api/orcamentos",
            data={
                "professional_id": str(profissional_teste.id),
                "descricao": "Troca de disjuntor principal da residência.",
                "cliente_nome": "Outro Cliente",
                "cliente_email": "outro.alguem@exemplo.com",
            },
        )

        # Carolina lista seus orçamentos
        res = client.get("/api/orcamentos/me", headers=headers_cli)
        assert res.status_code == 200
        orcamentos_carolina = res.json()
        assert len(orcamentos_carolina) == 1
        assert orcamentos_carolina[0]["cliente_email"] == email_cliente
        assert orcamentos_carolina[0]["professional_name"] == profissional_teste.name
        assert orcamentos_carolina[0]["status"] == "pendente"

        # Filtra por pendente -> retorna 1
        res_pend = client.get("/api/orcamentos/me?status_filtro=pendente", headers=headers_cli)
        assert res_pend.status_code == 200
        assert len(res_pend.json()) == 1

        # Filtra por respondido -> retorna 0
        res_resp = client.get("/api/orcamentos/me?status_filtro=respondido", headers=headers_cli)
        assert res_resp.status_code == 200
        assert len(res_resp.json()) == 0

    def test_cliente_acesso_detalhes_seguranca_bloqueia_outro_cliente(
        self, client: TestClient, profissional_teste: models.Professional, db_session: Session
    ):
        email_autor = "autor@exemplo.com"
        email_invasor = "invasor@exemplo.com"

        user_autor = models.User(
            name="Autor",
            email=email_autor,
            hashed_password="hash",
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        user_invasor = models.User(
            name="Invasor",
            email=email_invasor,
            hashed_password="hash",
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(user_autor)
        db_session.add(user_invasor)
        db_session.commit()

        # Cria orçamento para o autor
        res_post = client.post(
            "/api/orcamentos",
            data={
                "professional_id": str(profissional_teste.id),
                "descricao": "Reparo estrutural elétrico no escritório.",
                "cliente_nome": "Autor",
                "cliente_email": email_autor,
            },
        )
        orc_id = res_post.json()["id"]

        token_autor = create_access_token({"sub": email_autor, "role": "client"})
        token_invasor = create_access_token({"sub": email_invasor, "role": "client"})

        # Autor acessa detalhes com sucesso
        res_autor = client.get(f"/api/orcamentos/{orc_id}", headers={"Authorization": f"Bearer {token_autor}"})
        assert res_autor.status_code == 200
        assert res_autor.json()["id"] == orc_id
        assert res_autor.json()["professional_name"] == profissional_teste.name

        # Invasor tenta acessar detalhes -> 403 Forbidden
        res_invasor = client.get(f"/api/orcamentos/{orc_id}", headers={"Authorization": f"Bearer {token_invasor}"})
        assert res_invasor.status_code == 403
        assert "Acesso negado aos detalhes deste orçamento." in res_invasor.json()["detail"]


class TestAceitarOrcamento:
    """Validação da rota PATCH /api/orcamentos/{id}/aceitar (Issue #29)."""

    def test_profissional_aceita_orcamento_com_sucesso(
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

        # Cria solicitação de orçamento
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de disjuntor bipolar no quadro de força.",
            "cliente_nome": "Juliana Mendes",
            "cliente_email": "juliana@exemplo.com",
            "cliente_telefone": "11988887777",
        }
        res_post = client.post("/api/orcamentos", data=data)
        assert res_post.status_code == 201
        orcamento_id = res_post.json()["id"]

        # Aceita a solicitação informando estimativa preliminar e data sugerida
        payload = {
            "valor_estimado": 250.0,
            "mensagem": "Orçamento aceito! Levarei os materiais necessários para a instalação.",
            "data_prevista": "2099-10-20T14:00:00Z",
        }
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json=payload, headers=headers_prof)
        assert res_patch.status_code == 200
        body = res_patch.json()
        assert body["id"] == orcamento_id
        assert body["status"] == "aceito"
        assert body["valor_estimado"] == 250.0
        assert "Orçamento aceito!" in body["resposta_profissional"]
        assert body["decidido_em"] is not None
        assert body["data_prevista"] is not None

        # Valida persistência direta no banco
        db_orcamento = db_session.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
        assert db_orcamento.status == "aceito"
        assert db_orcamento.decidido_em is not None
        assert db_orcamento.valor_estimado == 250.0

        # Valida que notificação de aceite foi gerada para o cliente
        notif = (
            db_session.query(models.Notificacao)
            .filter(models.Notificacao.referencia_id == orcamento_id, models.Notificacao.tipo == "orcamento_aceito")
            .first()
        )
        assert notif is not None
        assert notif.user_email == "juliana@exemplo.com"
        assert "Aceito" in notif.titulo

    def test_profissional_aceita_orcamento_direto_sem_estimativa(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Vistoria para troca de cabeamento geral.",
            "cliente_nome": "Marcos Silva",
            "cliente_email": "marcos@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Aceite simples com mensagem de confirmação
        payload = {"mensagem": "Solicitação aceita. Entrarei em contato para agendar."}
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json=payload, headers=headers_prof)
        assert res_patch.status_code == 200
        assert res_patch.json()["status"] == "aceito"
        assert res_patch.json()["resposta_profissional"] == "Solicitação aceita. Entrarei em contato para agendar."

    def test_rejeita_aceite_por_outro_profissional_403(
        self, client: TestClient, profissional_teste: models.Professional, db_session: Session
    ):
        # Usuário profissional não dono
        outro_user = models.User(
            name="Outro Profissional",
            email="outro_aceite@exemplo.com",
            hashed_password="hash",
            role=models.UserRole.PROFESSIONAL.value,
            is_active=True,
        )
        db_session.add(outro_user)
        db_session.commit()

        token_outro = create_access_token({"sub": "outro_aceite@exemplo.com", "role": "professional"})
        headers_outro = {"Authorization": f"Bearer {token_outro}"}

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Troca de interruptores de parede.",
            "cliente_nome": "Carla Lima",
            "cliente_email": "carla@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        res_patch = client.patch(
            f"/api/orcamentos/{orcamento_id}/aceitar",
            json={"mensagem": "Aceito indevido"},
            headers=headers_outro,
        )
        assert res_patch.status_code == 403
        assert "Apenas o profissional destinatário" in res_patch.json()["detail"]

    def test_rejeita_aceite_sem_autenticacao_401(self, client: TestClient, profissional_teste: models.Professional):
        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Troca de fiação no banheiro.",
            "cliente_nome": "Renato Santos",
            "cliente_email": "renato@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json={})
        assert res_patch.status_code == 401

    def test_rejeita_aceite_orcamento_inexistente_404(
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

        res_patch = client.patch("/api/orcamentos/999999/aceitar", json={}, headers=headers_prof)
        assert res_patch.status_code == 404

    def test_rejeita_aceite_orcamento_ja_aceito_400(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Conserto de curto circuito em tomada.",
            "cliente_nome": "Fernanda Rosa",
            "cliente_email": "fernanda@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Primeiro aceite
        client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json={}, headers=headers_prof)

        # Segundo aceite repetido
        res_patch_2 = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json={}, headers=headers_prof)
        assert res_patch_2.status_code == 400
        assert "já foi aceita" in res_patch_2.json()["detail"]

    def test_rejeita_aceite_orcamento_ja_recusado_400(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de ar condicionado split.",
            "cliente_nome": "Lucas Prado",
            "cliente_email": "lucas@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Recusa primeiro
        client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "Agenda lotada no período"},
            headers=headers_prof,
        )

        # Tenta aceitar em seguida
        res_patch_aceite = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json={}, headers=headers_prof)
        assert res_patch_aceite.status_code == 400
        assert "já foi recusada" in res_patch_aceite.json()["detail"]

    def test_rejeita_aceite_com_data_prevista_no_passado_422(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de circuito elétrico.",
            "cliente_nome": "Lucas Data",
            "cliente_email": "lucas_data@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        payload = {
            "data_prevista": "2020-01-01T10:00:00Z",
        }
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json=payload, headers=headers_prof)
        assert res_patch.status_code == 422
        assert "passado" in str(res_patch.json())

    def test_aceite_com_mensagem_espacos_normaliza_para_none(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de tomada dupla.",
            "cliente_nome": "Carla Msg",
            "cliente_email": "carla_msg@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        payload = {"mensagem": "     "}
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json=payload, headers=headers_prof)
        assert res_patch.status_code == 200
        orc = db_session.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
        assert orc.resposta_profissional is None


class TestRecusarOrcamento:
    """Validação da rota PATCH /api/orcamentos/{id}/recusar (Issue #29)."""

    def test_profissional_recusa_orcamento_com_sucesso(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Construção de muro e reforma geral da fachada.",
            "cliente_nome": "Beatriz Souza",
            "cliente_email": "beatriz@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        assert res_post.status_code == 201
        orcamento_id = res_post.json()["id"]

        payload = {
            "motivo": "Fora da área de cobertura técnica",
            "justificativa_detalhada": "Minha especialidade é instalações elétricas internas e pequenos reparos.",
        }
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/recusar", json=payload, headers=headers_prof)
        assert res_patch.status_code == 200
        body = res_patch.json()
        assert body["id"] == orcamento_id
        assert body["status"] == "recusado"
        assert body["motivo_recusa"] == "Fora da área de cobertura técnica"
        assert "especialidade" in body["justificativa_recusa"]
        assert body["decidido_em"] is not None

        # Valida no banco
        db_orcamento = db_session.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
        assert db_orcamento.status == "recusado"
        assert db_orcamento.motivo_recusa == "Fora da área de cobertura técnica"

        # Valida notificação para o cliente
        notif = (
            db_session.query(models.Notificacao)
            .filter(models.Notificacao.referencia_id == orcamento_id, models.Notificacao.tipo == "orcamento_recusado")
            .first()
        )
        assert notif is not None
        assert notif.user_email == "beatriz@exemplo.com"
        assert "Recusado" in notif.titulo

    def test_rejeita_recusa_sem_motivo_422(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de lâmpadas dicroicas na sala.",
            "cliente_nome": "Alice Lima",
            "cliente_email": "alice@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Payload sem motivo obrigatório
        res_patch = client.patch(f"/api/orcamentos/{orcamento_id}/recusar", json={}, headers=headers_prof)
        assert res_patch.status_code == 422

    def test_rejeita_recusa_por_outro_profissional_403(
        self, client: TestClient, profissional_teste: models.Professional, db_session: Session
    ):
        outro_user = models.User(
            name="Outro Usuário Recusa",
            email="outro_recusa@exemplo.com",
            hashed_password="hash",
            role=models.UserRole.PROFESSIONAL.value,
            is_active=True,
        )
        db_session.add(outro_user)
        db_session.commit()

        token_outro = create_access_token({"sub": "outro_recusa@exemplo.com", "role": "professional"})
        headers_outro = {"Authorization": f"Bearer {token_outro}"}

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Troca de disjuntor principal da residência.",
            "cliente_nome": "Tiago Barros",
            "cliente_email": "tiago@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        res_patch = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "Recusa indevida"},
            headers=headers_outro,
        )
        assert res_patch.status_code == 403

    def test_rejeita_recusa_orcamento_ja_recusado_400(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de tomadas adicionais no quarto.",
            "cliente_nome": "Bruna Costa",
            "cliente_email": "bruna@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Primeira recusa
        client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "Agenda lotada"},
            headers=headers_prof,
        )

        # Segunda recusa repetida
        res_2 = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "Agenda lotada novamente"},
            headers=headers_prof,
        )
        assert res_2.status_code == 400
        assert "já foi recusada" in res_2.json()["detail"]

    def test_rejeita_recusa_orcamento_ja_aceito_400(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Manutenção em circuito de iluminação externo.",
            "cliente_nome": "Fábio Neves",
            "cliente_email": "fabio@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        # Aceita primeiro
        client.patch(f"/api/orcamentos/{orcamento_id}/aceitar", json={}, headers=headers_prof)

        # Tenta recusar
        res_recusa = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "Mudei de ideia"},
            headers=headers_prof,
        )
        assert res_recusa.status_code == 400
        assert "já foi aceita" in res_recusa.json()["detail"]

    def test_rejeita_recusa_motivo_apenas_espacos_422(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de ventilador.",
            "cliente_nome": "Mariana",
            "cliente_email": "mariana_recusa@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        res_patch = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "     "},
            headers=headers_prof,
        )
        assert res_patch.status_code == 422
        assert "caracteres visíveis" in str(res_patch.json())

    def test_rejeita_recusa_motivo_menor_que_3_caracteres_visiveis_422(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de chuveiro.",
            "cliente_nome": "Paulo",
            "cliente_email": "paulo_recusa@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        res_patch = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "  ab  "},
            headers=headers_prof,
        )
        assert res_patch.status_code == 422

    def test_recusa_com_motivo_e_justificativa_normalizados_com_sucesso(
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

        data = {
            "professional_id": str(profissional_teste.id),
            "descricao": "Instalação de lâmpadas.",
            "cliente_nome": "Camila",
            "cliente_email": "camila_recusa@exemplo.com",
        }
        res_post = client.post("/api/orcamentos", data=data)
        orcamento_id = res_post.json()["id"]

        res_patch = client.patch(
            f"/api/orcamentos/{orcamento_id}/recusar",
            json={"motivo": "   Agenda lotada   ", "justificativa_detalhada": "    "},
            headers=headers_prof,
        )
        assert res_patch.status_code == 200
        orc = db_session.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
        assert orc.motivo_recusa == "Agenda lotada"
        assert orc.justificativa_recusa is None


class TestResumoCapacidade:
    """Validação da rota GET /api/orcamentos/capacidade/resumo (Issue #29)."""

    def test_obter_resumo_capacidade_profissional(
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

        # Cria 3 orçamentos
        ids = []
        for i in range(3):
            data = {
                "professional_id": str(profissional_teste.id),
                "descricao": f"Serviço elétrico de vistoria número {i+1}.",
                "cliente_nome": f"Cliente Capacidade {i+1}",
                "cliente_email": f"cap{i+1}@exemplo.com",
            }
            res = client.post("/api/orcamentos", data=data)
            ids.append(res.json()["id"])

        # Deixa id[0] como pendente
        # Aceita id[1]
        client.patch(f"/api/orcamentos/{ids[1]}/aceitar", json={"valor_estimado": 300.0}, headers=headers_prof)
        # Recusa id[2]
        client.patch(
            f"/api/orcamentos/{ids[2]}/recusar",
            json={"motivo": "Capacidade semanal atingida"},
            headers=headers_prof,
        )

        res_resumo = client.get("/api/orcamentos/capacidade/resumo", headers=headers_prof)
        assert res_resumo.status_code == 200
        data_resumo = res_resumo.json()
        assert data_resumo["total"] >= 3
        assert data_resumo["pendentes"] >= 1
        assert data_resumo["aceitos"] >= 1
        assert data_resumo["recusados"] >= 1

    def test_rejeita_resumo_capacidade_cliente_403(
        self, client: TestClient, db_session: Session
    ):
        user_cli = models.User(
            name="Cliente Teste",
            email="cli_resumo@exemplo.com",
            hashed_password="hash",
            role=models.UserRole.CLIENT.value,
            is_active=True,
        )
        db_session.add(user_cli)
        db_session.commit()

        token_cli = create_access_token({"sub": "cli_resumo@exemplo.com", "role": "client"})
        headers_cli = {"Authorization": f"Bearer {token_cli}"}

        res = client.get("/api/orcamentos/capacidade/resumo", headers=headers_cli)
        assert res.status_code == 403

    def test_filtro_status_aceito_e_recusado(
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

        # Cria e aceita um
        res_a = client.post(
            "/api/orcamentos",
            data={
                "professional_id": str(profissional_teste.id),
                "descricao": "Serviço para filtro aceito.",
                "cliente_nome": "Filtro A",
                "cliente_email": "filtroa@exemplo.com",
            },
        )
        client.patch(f"/api/orcamentos/{res_a.json()['id']}/aceitar", json={}, headers=headers_prof)

        # Cria e recusa outro
        res_r = client.post(
            "/api/orcamentos",
            data={
                "professional_id": str(profissional_teste.id),
                "descricao": "Serviço para filtro recusado.",
                "cliente_nome": "Filtro R",
                "cliente_email": "filtror@exemplo.com",
            },
        )
        client.patch(
            f"/api/orcamentos/{res_r.json()['id']}/recusar",
            json={"motivo": "Indisponível"},
            headers=headers_prof,
        )

        # Consulta com filtro "aceito"
        res_filtro_aceito = client.get("/api/orcamentos/me?status_filtro=aceito", headers=headers_prof)
        assert res_filtro_aceito.status_code == 200
        for item in res_filtro_aceito.json():
            assert item["status"] == "aceito"

        # Consulta com filtro "recusado"
        res_filtro_recusado = client.get("/api/orcamentos/me?status_filtro=recusado", headers=headers_prof)
        assert res_filtro_recusado.status_code == 200
        for item in res_filtro_recusado.json():
            assert item["status"] == "recusado"

    def test_obter_resumo_capacidade_agregado_multiplos_status(
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

        # Cria 4 orçamentos
        ids = []
        for i in range(4):
            data = {
                "professional_id": str(profissional_teste.id),
                "descricao": f"Serviço elétrico de teste de agregação #{i+1}.",
                "cliente_nome": f"Cliente Agregação {i+1}",
                "cliente_email": f"agreg{i+1}@exemplo.com",
            }
            res = client.post("/api/orcamentos", data=data)
            ids.append(res.json()["id"])

        # ids[0]: permanece pendente
        # ids[1]: respondido
        client.patch(
            f"/api/orcamentos/{ids[1]}/responder",
            json={"valor_estimado": 190.0, "resposta_profissional": "Estimativa preliminar de teste."},
            headers=headers_prof,
        )
        # ids[2]: aceito
        client.patch(f"/api/orcamentos/{ids[2]}/aceitar", json={}, headers=headers_prof)
        # ids[3]: recusado
        client.patch(
            f"/api/orcamentos/{ids[3]}/recusar",
            json={"motivo": "Agenda esgotada"},
            headers=headers_prof,
        )

        res_resumo = client.get("/api/orcamentos/capacidade/resumo", headers=headers_prof)
        assert res_resumo.status_code == 200
        data = res_resumo.json()
        assert data["total"] >= 4
        assert data["pendentes"] >= 1
        assert data["respondidos"] >= 1
        assert data["aceitos"] >= 1
        assert data["recusados"] >= 1


