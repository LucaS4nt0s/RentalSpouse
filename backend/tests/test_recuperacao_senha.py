"""
Testes automatizados do fluxo "Esqueci minha senha" (issue #75).

Cobrem a solicitação do link, o consumo do token de uso único e a atualização
das três origens de conta (users, clientes e professionals).
"""

from datetime import date, timedelta
import re

import pytest

from database import SessionLocal
import email_service
import models
import recuperacao_senha
from security import hash_senha, hash_token, verificar_senha

EMAIL_CLIENTE = "maria.senha@exemplo.com"
EMAIL_PROFISSIONAL = "profissional.senha@exemplo.com"
EMAIL_ADMIN = "admin.senha@exemplo.com"
SENHA_ATUAL = "SenhaAtual123"
NOVA_SENHA = "NovaSenha456"


def criar_cliente(
    db,
    email: str = EMAIL_CLIENTE,
    nome: str = "Maria da Silva",
    senha: str = SENHA_ATUAL,
    cpf: str = "12345678909",
    verificado: bool = True,
) -> models.Cliente:
    """Cria um cliente diretamente no banco de testes."""
    cliente = models.Cliente(
        nome=nome,
        email=email,
        cpf=cpf,
        data_nascimento=date(1992, 8, 15),
        senha_hash=hash_senha(senha),
        cep="01001000",
        logradouro="Praça da Sé",
        numero="50",
        complemento=None,
        bairro="Sé",
        cidade="São Paulo",
        estado="SP",
        email_verificado=verificado,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


def criar_profissional(db, email: str = EMAIL_PROFISSIONAL) -> models.Professional:
    """Cria um profissional ativo diretamente no banco de testes."""
    profissional = models.Professional(
        name="Eletricista Silva",
        email=email,
        phone="(11) 99999-8888",
        bio="Profissional com ampla experiência em instalações residenciais.",
        service_radius_km=20.0,
        specialties=["Elétrica"],
        city="São Paulo",
        state="SP",
        senha_hash=hash_senha(SENHA_ATUAL),
        is_active=True,
    )
    db.add(profissional)
    db.commit()
    db.refresh(profissional)
    return profissional


def criar_user(
    db,
    email: str = EMAIL_ADMIN,
    role: str = models.UserRole.ADMIN.value,
    ativo: bool = True,
) -> models.User:
    """Cria um usuário na tabela unificada diretamente no banco de testes."""
    user = models.User(
        name="Administrador Teste",
        email=email,
        hashed_password=hash_senha(SENHA_ATUAL),
        role=role,
        is_active=ativo,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def extrair_token(mensagem) -> str:
    """Extrai o token do link de redefinição no corpo texto puro do e-mail."""
    corpo = mensagem.get_body(preferencelist=("plain",)).get_content()
    encontrado = re.search(r"/redefinir-senha\?token=([A-Za-z0-9_-]+)", corpo)
    assert encontrado is not None, "O e-mail deve conter o link de redefinição."
    return encontrado.group(1)


def solicitar(client, email: str = EMAIL_CLIENTE):
    """Dispara a solicitação de recuperação pela API."""
    return client.post("/api/auth/esqueci-senha", json={"email": email})


def redefinir(client, token: str, nova_senha: str = NOVA_SENHA):
    """Dispara a redefinição de senha pela API."""
    return client.post(
        "/api/auth/redefinir-senha",
        json={
            "token": token,
            "nova_senha": nova_senha,
            "confirmar_nova_senha": nova_senha,
        },
    )


def avancar_cooldown(db, email: str = EMAIL_CLIENTE, segundos: int = 120) -> None:
    """Empurra a criação do último token para o passado, liberando novo envio."""
    registro = (
        db.query(models.RecuperacaoSenhaToken)
        .filter(models.RecuperacaoSenhaToken.email == email)
        .order_by(models.RecuperacaoSenhaToken.id.desc())
        .first()
    )
    assert registro is not None
    registro.criado_em = recuperacao_senha.utcnow() - timedelta(seconds=segundos)
    db.commit()


# ===========================================================================
# Solicitação do link
# ===========================================================================


class TestSolicitacao:
    def test_solicita_link_para_cliente_ativo(self, client, caixa_de_entrada, db_session):
        criar_cliente(db_session)

        resposta = solicitar(client, EMAIL_CLIENTE.upper())

        assert resposta.status_code == 202
        assert resposta.json()["mensagem"] == recuperacao_senha.MENSAGEM_SOLICITACAO
        assert len(caixa_de_entrada) == 1
        assert caixa_de_entrada[0]["To"] == EMAIL_CLIENTE
        assert "Redefinição de senha" in caixa_de_entrada[0]["Subject"]

        token = extrair_token(caixa_de_entrada[0])
        registro = db_session.query(models.RecuperacaoSenhaToken).one()
        assert registro.email == EMAIL_CLIENTE
        assert registro.token_hash == hash_token(token)
        assert token not in registro.token_hash

    def test_solicita_link_para_profissional_ativo(
        self, client, caixa_de_entrada, db_session
    ):
        criar_profissional(db_session)

        resposta = solicitar(client, EMAIL_PROFISSIONAL)

        assert resposta.status_code == 202
        assert len(caixa_de_entrada) == 1
        assert caixa_de_entrada[0]["To"] == EMAIL_PROFISSIONAL

    def test_solicita_link_para_usuario_admin(self, client, caixa_de_entrada, db_session):
        criar_user(db_session)

        resposta = solicitar(client, EMAIL_ADMIN)

        assert resposta.status_code == 202
        assert len(caixa_de_entrada) == 1
        assert caixa_de_entrada[0]["To"] == EMAIL_ADMIN

    def test_email_desconhecido_responde_igual_sem_enviar(
        self, client, caixa_de_entrada, db_session
    ):
        resposta = solicitar(client, "nao.existe@exemplo.com")

        assert resposta.status_code == 202
        assert resposta.json()["mensagem"] == recuperacao_senha.MENSAGEM_SOLICITACAO
        assert caixa_de_entrada == []
        assert db_session.query(models.RecuperacaoSenhaToken).count() == 0

    def test_conta_desativada_nao_recebe_link(
        self, client, caixa_de_entrada, db_session
    ):
        criar_cliente(db_session)
        criar_user(
            db_session,
            email=EMAIL_CLIENTE,
            role=models.UserRole.CLIENT.value,
            ativo=False,
        )

        resposta = solicitar(client, EMAIL_CLIENTE)

        assert resposta.status_code == 202
        assert caixa_de_entrada == []

    def test_email_invalido_retorna_422(self, client):
        resposta = solicitar(client, "nao-e-email")

        assert resposta.status_code == 422

    def test_respeita_intervalo_minimo_entre_envios(
        self, client, caixa_de_entrada, db_session
    ):
        criar_cliente(db_session)

        primeira = solicitar(client, EMAIL_CLIENTE)
        segunda = solicitar(client, EMAIL_CLIENTE)

        assert primeira.status_code == 202
        assert segunda.status_code == 202
        assert len(caixa_de_entrada) == 1

    def test_nova_solicitacao_invalida_link_anterior(
        self, client, caixa_de_entrada, db_session
    ):
        criar_cliente(db_session)
        solicitar(client, EMAIL_CLIENTE)
        token_antigo = extrair_token(caixa_de_entrada[0])

        avancar_cooldown(db_session)
        solicitar(client, EMAIL_CLIENTE)

        assert len(caixa_de_entrada) == 2
        assert redefinir(client, token_antigo).status_code == 400
        token_novo = extrair_token(caixa_de_entrada[1])
        assert redefinir(client, token_novo).status_code == 200


# ===========================================================================
# Redefinição da senha
# ===========================================================================


class TestRedefinicao:
    def test_cliente_consegue_logar_com_nova_senha(
        self, client, caixa_de_entrada, db_session
    ):
        criar_cliente(db_session)
        solicitar(client, EMAIL_CLIENTE)
        token = extrair_token(caixa_de_entrada[0])

        resposta = redefinir(client, token)

        assert resposta.status_code == 200
        assert resposta.json()["mensagem"] == recuperacao_senha.MENSAGEM_SENHA_REDEFINIDA

        antiga = client.post(
            "/api/auth/login",
            json={"email": EMAIL_CLIENTE, "senha": SENHA_ATUAL},
        )
        nova = client.post(
            "/api/auth/login",
            json={"email": EMAIL_CLIENTE, "senha": NOVA_SENHA},
        )
        assert antiga.status_code == 401
        assert nova.status_code == 200

    def test_atualiza_user_e_cliente_sincronizados(
        self, client, caixa_de_entrada, db_session
    ):
        criar_cliente(db_session)
        criar_user(
            db_session,
            email=EMAIL_CLIENTE,
            role=models.UserRole.CLIENT.value,
        )
        solicitar(client, EMAIL_CLIENTE)
        token = extrair_token(caixa_de_entrada[0])

        resposta = redefinir(client, token)

        assert resposta.status_code == 200
        db_session.expire_all()
        user = (
            db_session.query(models.User)
            .filter(models.User.email == EMAIL_CLIENTE)
            .one()
        )
        cliente = (
            db_session.query(models.Cliente)
            .filter(models.Cliente.email == EMAIL_CLIENTE)
            .one()
        )
        assert verificar_senha(NOVA_SENHA, user.hashed_password) is True
        assert verificar_senha(NOVA_SENHA, cliente.senha_hash) is True

    def test_atualiza_senha_do_profissional(
        self, client, caixa_de_entrada, db_session
    ):
        criar_profissional(db_session)
        solicitar(client, EMAIL_PROFISSIONAL)
        token = extrair_token(caixa_de_entrada[0])

        resposta = redefinir(client, token)

        assert resposta.status_code == 200
        db_session.expire_all()
        profissional = (
            db_session.query(models.Professional)
            .filter(models.Professional.email == EMAIL_PROFISSIONAL)
            .one()
        )
        assert verificar_senha(NOVA_SENHA, profissional.senha_hash) is True

    def test_token_e_de_uso_unico(self, client, caixa_de_entrada, db_session):
        criar_cliente(db_session)
        solicitar(client, EMAIL_CLIENTE)
        token = extrair_token(caixa_de_entrada[0])

        primeira = redefinir(client, token)
        segunda = redefinir(client, token)

        assert primeira.status_code == 200
        assert segunda.status_code == 400
        assert segunda.json()["detail"] == recuperacao_senha.MENSAGEM_TOKEN_INVALIDO

    def test_token_expirado_e_rejeitado(self, client, caixa_de_entrada, db_session):
        criar_cliente(db_session)
        solicitar(client, EMAIL_CLIENTE)
        token = extrair_token(caixa_de_entrada[0])

        registro = db_session.query(models.RecuperacaoSenhaToken).one()
        registro.expira_em = recuperacao_senha.utcnow() - timedelta(minutes=1)
        db_session.commit()

        resposta = redefinir(client, token)

        assert resposta.status_code == 400
        assert resposta.json()["detail"] == recuperacao_senha.MENSAGEM_TOKEN_EXPIRADO
        db_session.expire_all()
        assert db_session.query(models.RecuperacaoSenhaToken).one().usado_em is not None

    def test_token_invalido_retorna_400(self, client):
        resposta = redefinir(client, "token-que-nunca-existiu-123456")

        assert resposta.status_code == 400
        assert resposta.json()["detail"] == recuperacao_senha.MENSAGEM_TOKEN_INVALIDO

    def test_token_curto_retorna_422(self, client):
        resposta = client.post(
            "/api/auth/redefinir-senha",
            json={
                "token": "curto",
                "nova_senha": NOVA_SENHA,
                "confirmar_nova_senha": NOVA_SENHA,
            },
        )

        assert resposta.status_code == 422

    def test_confirmacao_divergente_retorna_422(self, client):
        resposta = client.post(
            "/api/auth/redefinir-senha",
            json={
                "token": "token-suficientemente-longo-123",
                "nova_senha": NOVA_SENHA,
                "confirmar_nova_senha": "OutraSenha789",
            },
        )

        assert resposta.status_code == 422

    @pytest.mark.parametrize("senha_fraca", ["curta1", "somenteletras", "12345678"])
    def test_senha_fraca_retorna_422(self, client, senha_fraca):
        resposta = client.post(
            "/api/auth/redefinir-senha",
            json={
                "token": "token-suficientemente-longo-123",
                "nova_senha": senha_fraca,
                "confirmar_nova_senha": senha_fraca,
            },
        )

        assert resposta.status_code == 422

    def test_conta_removida_apos_solicitacao_retorna_400(
        self, client, caixa_de_entrada, db_session
    ):
        cliente = criar_cliente(db_session)
        solicitar(client, EMAIL_CLIENTE)
        token = extrair_token(caixa_de_entrada[0])

        db_session.delete(cliente)
        db_session.commit()

        resposta = redefinir(client, token)

        assert resposta.status_code == 400
        assert resposta.json()["detail"] == recuperacao_senha.MENSAGEM_TOKEN_INVALIDO


# ===========================================================================
# E-mail e configuração
# ===========================================================================


class TestEmailRedefinicao:
    def test_link_usa_app_base_url(self, monkeypatch):
        monkeypatch.setenv("APP_BASE_URL", "https://app.rentalspouse.com/")

        link = email_service.montar_link_redefinicao("abc123")

        assert link == "https://app.rentalspouse.com/redefinir-senha?token=abc123"

    def test_mensagem_possui_texto_puro_e_html(self):
        mensagem = email_service.montar_mensagem_redefinicao(
            destinatario=EMAIL_CLIENTE,
            nome="Maria Silva",
            token="abc123",
            expira_minutos=60,
        )

        assert mensagem["To"] == EMAIL_CLIENTE
        assert mensagem.is_multipart()
        subtipos = {parte.get_content_subtype() for parte in mensagem.iter_parts()}
        assert "plain" in subtipos
        assert "html" in subtipos
        corpo = mensagem.get_body(preferencelist=("plain",)).get_content()
        assert "Maria" in corpo
        assert "60 minuto" in corpo

    def test_nome_e_escapado_no_corpo_html(self):
        mensagem = email_service.montar_mensagem_redefinicao(
            destinatario=EMAIL_CLIENTE,
            nome="<script>alert('xss')</script> Maria",
            token="abc123",
            expira_minutos=60,
        )

        corpo_html = mensagem.get_body(preferencelist=("html",)).get_content()
        assert "<script>" not in corpo_html
        assert "&lt;script&gt;" in corpo_html

    def test_envio_absorve_falha_de_smtp(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.delenv("SMTP_HOST", raising=False)
        pendente = recuperacao_senha.EmailPendente(
            EMAIL_CLIENTE, "Maria", "abc123", 60
        )

        assert recuperacao_senha.enviar_email_de_redefinicao(pendente) is False

    def test_configuracao_respeita_variaveis_de_ambiente(self, monkeypatch):
        monkeypatch.setenv("SENHA_RESET_EXPIRA_MINUTOS", "15")
        monkeypatch.setenv("SENHA_RESET_REENVIO_SEGUNDOS", "30")

        assert recuperacao_senha.expiracao_minutos() == 15
        assert recuperacao_senha.intervalo_reenvio_segundos() == 30

    @pytest.mark.parametrize("valor_invalido", ["", "abc", "0", "-5"])
    def test_valores_invalidos_de_ambiente_usam_fallback(
        self, monkeypatch, valor_invalido
    ):
        monkeypatch.setenv("SENHA_RESET_EXPIRA_MINUTOS", valor_invalido)

        assert (
            recuperacao_senha.expiracao_minutos()
            == recuperacao_senha.EXPIRACAO_PADRAO_MINUTOS
        )
