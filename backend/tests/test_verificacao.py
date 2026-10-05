"""
Testes do fluxo de verificação de e-mail.

Cobrem:
- Emissão e persistência segura do token no cadastro do cliente.
- Confirmação (token válido, inválido, expirado, reutilizado e idempotência).
- Reenvio (integridade do token anterior, intervalo mínimo, anti-enumeração).
- Resiliência a falha de SMTP.
- Unidades de criptografia e de configuração do transporte de e-mail.

Nenhum teste toca em SMTP real ou em PostgreSQL: o envio é isolado pelo
transporte `memoria` (fixture autouse `email_em_memoria` do conftest) e o banco
é SQLite em memória.
"""

import re
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

import email_service
import models
import verificacao
from security import gerar_token_verificacao, hash_token, token_confere

# CPFs válidos distintos, para cenários que exigem mais de um cliente
CPF_PRINCIPAL = "12345678909"
CPF_SECUNDARIO = "52998224725"

EMAIL_PRINCIPAL = "cliente.verificacao@example.com"
EMAIL_SECUNDARIO = "outro.cliente@example.com"


def payload_cliente(**kwargs) -> dict:
    """Gera um payload válido de cadastro de cliente com overrides opcionais."""
    dados = {
        "nome": "Cliente Verificação",
        "email": EMAIL_PRINCIPAL,
        "cpf": CPF_PRINCIPAL,
        "data_nascimento": "1995-05-20",
        "senha": "SenhaForte123",
        "confirmar_senha": "SenhaForte123",
        "endereco": {
            "cep": "01001000",
            "logradouro": "Praça da Sé",
            "numero": "100",
            "complemento": "Apto 42",
            "bairro": "Sé",
            "cidade": "São Paulo",
            "estado": "SP",
        },
    }
    dados.update(kwargs)
    return dados


def extrair_token(mensagem) -> str:
    """Extrai o token de verificação do corpo em texto puro do e-mail capturado."""
    corpo = mensagem.get_body(preferencelist=("plain",))
    assert corpo is not None, "O e-mail deve possuir corpo em texto puro"
    achado = re.search(r"token=([A-Za-z0-9_\-]+)", corpo.get_content())
    assert achado is not None, "O e-mail deve conter o link de verificação"
    return achado.group(1)


def cadastrar_cliente(client, **kwargs) -> dict:
    """Cadastra um cliente e devolve o corpo da resposta 201."""
    resposta = client.post("/api/clientes", json=payload_cliente(**kwargs))
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def confirmar(client, token: str):
    """Chama o endpoint de confirmação com o token informado."""
    return client.post("/api/verificacao/confirmar", json={"token": token})


def reenviar(client, email: str):
    """Chama o endpoint de reenvio para o e-mail informado."""
    return client.post("/api/verificacao/reenviar", json={"email": email})


def obter_cliente(db_session, email: str = EMAIL_PRINCIPAL) -> models.Cliente:
    """Busca o cliente diretamente no banco em memória."""
    return (
        db_session.query(models.Cliente)
        .filter(models.Cliente.email == email)
        .first()
    )


# ===========================================================================
# Emissão do token no cadastro
# ===========================================================================


class TestEmissaoNoCadastro:
    """O cadastro deve criar a conta como NÃO verificada e disparar o e-mail."""

    def test_cadastro_cria_conta_nao_verificada(self, client):
        corpo = cadastrar_cliente(client)

        assert corpo["email_verificado"] is False

    def test_cadastro_dispara_email_para_o_endereco_cadastrado(
        self, client, caixa_de_entrada
    ):
        cadastrar_cliente(client)

        assert len(caixa_de_entrada) == 1
        mensagem = caixa_de_entrada[0]
        assert mensagem["To"] == EMAIL_PRINCIPAL
        assert "Confirme seu e-mail" in mensagem["Subject"]

    def test_email_contem_link_de_verificacao_utilizavel(self, client, caixa_de_entrada):
        cadastrar_cliente(client)

        token = extrair_token(caixa_de_entrada[0])
        assert token

        # O token extraído do e-mail deve efetivamente confirmar a conta
        resposta = confirmar(client, token)
        assert resposta.status_code == 200, resposta.text

    def test_token_e_persistido_somente_como_hash(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        cliente = obter_cliente(db_session)
        assert cliente.verificacao_token_hash == hash_token(token)
        # O token em claro jamais é gravado no banco
        assert cliente.verificacao_token_hash != token
        assert len(cliente.verificacao_token_hash) == 64

    def test_token_recebe_expiracao_futura(self, client, db_session):
        cadastrar_cliente(client)

        cliente = obter_cliente(db_session)
        assert cliente.verificacao_expira_em is not None
        assert cliente.verificacao_expira_em > verificacao.utcnow()
        assert cliente.verificacao_enviada_em is not None

    def test_confirmar_senha_nao_e_exibido_na_resposta(self, client):
        corpo = cadastrar_cliente(client)

        assert "senha" not in corpo
        assert "confirmar_senha" not in corpo
        assert "senha_hash" not in corpo
        assert "verificacao_token_hash" not in corpo

    def test_falha_de_smtp_nao_impede_o_cadastro(
        self, client, caixa_de_entrada, monkeypatch, db_session
    ):
        # Backend `smtp` sem SMTP_HOST configurado => falha de transporte
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.delenv("SMTP_HOST", raising=False)

        corpo = cadastrar_cliente(client)

        assert corpo["email_verificado"] is False
        assert caixa_de_entrada == []

        # Mesmo com a falha de envio, o token ficou persistido e permite reenvio
        cliente = obter_cliente(db_session)
        assert cliente.verificacao_token_hash is not None


# ===========================================================================
# Confirmação
# ===========================================================================


class TestConfirmacao:
    """Consumo do token de verificação."""

    def test_confirma_com_token_valido(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        resposta = confirmar(client, token)

        assert resposta.status_code == 200
        dados = resposta.json()
        assert dados["email"] == EMAIL_PRINCIPAL
        assert dados["email_verificado"] is True
        assert "mensagem" in dados

        cliente = obter_cliente(db_session)
        assert cliente.email_verificado is True

    def test_hash_permanece_para_permitir_reacesso_idempotente(
        self, client, caixa_de_entrada, db_session
    ):
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        confirmar(client, token)

        cliente = obter_cliente(db_session)
        assert cliente.email_verificado is True
        # O hash é mantido como registro de reacesso (F5 / clique repetido no
        # link) e só é descartado na primeira tentativa após expirar.
        assert cliente.verificacao_token_hash == hash_token(token)

    def test_reacesso_ao_link_e_idempotente(self, client, caixa_de_entrada, db_session):
        """Clicar duas vezes no link ou dar F5 não deve cair em tela de erro."""
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        primeira = confirmar(client, token)
        segunda = confirmar(client, token)

        assert primeira.status_code == 200
        assert segunda.status_code == 200
        assert primeira.json()["mensagem"] == verificacao.MENSAGEM_CONFIRMADO
        assert segunda.json()["mensagem"] == verificacao.MENSAGEM_JA_VERIFICADO
        assert segunda.json()["email_verificado"] is True

        db_session.expire_all()
        assert obter_cliente(db_session).email_verificado is True

    def test_reacesso_apos_expirar_o_token_ainda_e_idempotente(
        self, client, caixa_de_entrada, db_session
    ):
        """Conta já confirmada não deve receber 'link expirado' ao reabrir o link."""
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])
        confirmar(client, token)

        cliente = obter_cliente(db_session)
        cliente.verificacao_expira_em = verificacao.utcnow() - timedelta(minutes=1)
        db_session.commit()

        resposta = confirmar(client, token)

        assert resposta.status_code == 200
        assert resposta.json()["mensagem"] == verificacao.MENSAGEM_JA_VERIFICADO

        # Limpeza preguiçosa: o token já cumpriu seu papel e sai do banco
        db_session.expire_all()
        assert obter_cliente(db_session).verificacao_token_hash is None

    def test_token_invalido_retorna_400(self, client):
        resposta = confirmar(client, "token-que-nunca-existiu-na-base-123456")

        assert resposta.status_code == 400
        assert resposta.json()["detail"] == verificacao.MENSAGEM_TOKEN_INVALIDO

    def test_token_expirado_retorna_400(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        # Simula a passagem do tempo empurrando a expiração para o passado
        cliente = obter_cliente(db_session)
        cliente.verificacao_expira_em = verificacao.utcnow() - timedelta(minutes=1)
        db_session.commit()

        resposta = confirmar(client, token)

        assert resposta.status_code == 400
        assert resposta.json()["detail"] == verificacao.MENSAGEM_TOKEN_EXPIRADO

    def test_token_expirado_e_descartado(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        cliente = obter_cliente(db_session)
        cliente.verificacao_expira_em = verificacao.utcnow() - timedelta(seconds=1)
        db_session.commit()

        confirmar(client, token)

        db_session.expire_all()
        assert obter_cliente(db_session).verificacao_token_hash is None

    def test_token_de_um_cliente_nao_afeta_outro(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        cadastrar_cliente(
            client,
            email=EMAIL_SECUNDARIO,
            cpf=CPF_SECUNDARIO,
            nome="Outro Cliente",
        )

        token_principal = extrair_token(caixa_de_entrada[0])
        confirmar(client, token_principal)

        assert obter_cliente(db_session, EMAIL_PRINCIPAL).email_verificado is True
        assert obter_cliente(db_session, EMAIL_SECUNDARIO).email_verificado is False

    def test_conta_verificada_por_outro_caminho_e_idempotente(
        self, client, caixa_de_entrada, db_session
    ):
        """
        Conta marcada como verificada por outro caminho (ex.: backoffice) e que
        ainda possui token válido pendente: o link não deve gerar erro.
        """
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        cliente = obter_cliente(db_session)
        cliente.email_verificado = True
        db_session.commit()

        resposta = confirmar(client, token)

        assert resposta.status_code == 200
        assert resposta.json()["mensagem"] == verificacao.MENSAGEM_JA_VERIFICADO

    def test_token_curto_demais_retorna_422(self, client):
        resposta = confirmar(client, "curto")

        assert resposta.status_code == 422

    def test_confirmacao_sem_token_no_payload_retorna_422(self, client):
        resposta = client.post("/api/verificacao/confirmar", json={})

        assert resposta.status_code == 422

    def test_espacos_no_token_sao_ignorados(self, client, caixa_de_entrada):
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])

        resposta = confirmar(client, f"  {token}  ")

        assert resposta.status_code == 200


# ===========================================================================
# Reenvio
# ===========================================================================


class TestReenvio:
    """Reenvio do e-mail de verificação."""

    def test_reenvio_dispara_novo_email(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        _avancar_janela_de_reenvio(db_session)

        resposta = reenviar(client, EMAIL_PRINCIPAL)

        assert resposta.status_code == 202
        assert len(caixa_de_entrada) == 2

    def test_reenvio_invalida_o_token_anterior(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        token_antigo = extrair_token(caixa_de_entrada[0])
        _avancar_janela_de_reenvio(db_session)

        reenviar(client, EMAIL_PRINCIPAL)

        # O token antigo deixa de funcionar; o novo passa a valer
        assert confirmar(client, token_antigo).status_code == 400
        assert confirmar(client, extrair_token(caixa_de_entrada[1])).status_code == 200

    def test_reenvio_respeita_intervalo_minimo(self, client, caixa_de_entrada):
        cadastrar_cliente(client)

        resposta = reenviar(client, EMAIL_PRINCIPAL)

        assert resposta.status_code == 202
        # Nenhum e-mail novo: o intervalo mínimo ainda não decorreu
        assert len(caixa_de_entrada) == 1

    def test_reenvio_ignora_email_desconhecido_sem_revelar_cadastro(
        self, client, caixa_de_entrada
    ):
        resposta = reenviar(client, "nao.existe@example.com")

        assert resposta.status_code == 202
        assert resposta.json()["mensagem"] == verificacao.MENSAGEM_REENVIO_SOLICITADO
        assert caixa_de_entrada == []

    def test_reenvio_para_conta_ja_verificada_nao_envia(
        self, client, caixa_de_entrada, db_session
    ):
        cadastrar_cliente(client)
        token = extrair_token(caixa_de_entrada[0])
        confirmar(client, token)
        _avancar_janela_de_reenvio(db_session)

        resposta = reenviar(client, EMAIL_PRINCIPAL)

        assert resposta.status_code == 202
        assert len(caixa_de_entrada) == 1

    def test_reenvio_com_email_invalido_retorna_422(self, client):
        resposta = reenviar(client, "nao-e-email")

        assert resposta.status_code == 422

    def test_reenvio_normaliza_email_em_maiusculas(self, client, caixa_de_entrada, db_session):
        cadastrar_cliente(client)
        _avancar_janela_de_reenvio(db_session)

        resposta = reenviar(client, EMAIL_PRINCIPAL.upper())

        assert resposta.status_code == 202
        assert len(caixa_de_entrada) == 2

    def test_reenvio_funciona_apos_falha_de_envio_no_cadastro(
        self, client, caixa_de_entrada, monkeypatch, db_session
    ):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.delenv("SMTP_HOST", raising=False)
        cadastrar_cliente(client)
        assert caixa_de_entrada == []

        # Serviço de e-mail volta a funcionar: o cliente consegue se verificar
        monkeypatch.setenv("EMAIL_BACKEND", "memoria")
        _avancar_janela_de_reenvio(db_session)
        reenviar(client, EMAIL_PRINCIPAL)

        assert len(caixa_de_entrada) == 1
        token = extrair_token(caixa_de_entrada[0])
        assert confirmar(client, token).status_code == 200


def _avancar_janela_de_reenvio(db_session, segundos: int = 120) -> None:
    """Empurra o último envio para o passado, liberando um novo reenvio."""
    cliente = (
        db_session.query(models.Cliente)
        .filter(models.Cliente.email == EMAIL_PRINCIPAL)
        .first()
    )
    cliente.verificacao_enviada_em = verificacao.utcnow() - timedelta(seconds=segundos)
    db_session.commit()


# ===========================================================================
# Unidades: criptografia do token
# ===========================================================================


class TestSegurancaToken:
    """Funções criptográficas de `security.py`."""

    def test_tokens_gerados_sao_unicos_e_longos(self):
        tokens = {gerar_token_verificacao() for _ in range(50)}

        assert len(tokens) == 50
        assert all(len(token) >= 32 for token in tokens)

    def test_hash_do_token_e_deterministico(self):
        token = gerar_token_verificacao()

        assert hash_token(token) == hash_token(token)
        assert len(hash_token(token)) == 64

    def test_hash_nao_revela_o_token(self):
        token = gerar_token_verificacao()

        assert token not in hash_token(token)

    def test_token_confere_valida_correspondencia(self):
        token = gerar_token_verificacao()

        assert token_confere(hash_token(token), token) is True
        assert token_confere(hash_token(token), gerar_token_verificacao()) is False

    @pytest.mark.parametrize("entrada", ["", None])
    def test_token_confere_rejeita_entradas_vazias(self, entrada):
        assert token_confere("", entrada) is False
        assert token_confere(None, "algo") is False


# ===========================================================================
# Unidades: configuração do transporte de e-mail
# ===========================================================================


class TestConfiguracaoEmail:
    """Seleção de transporte e composição da mensagem."""

    def test_backend_padrao_e_console(self, monkeypatch):
        monkeypatch.delenv("EMAIL_BACKEND", raising=False)

        assert email_service.backend_configurado() == "console"
        assert isinstance(email_service.obter_transporte(), email_service.TransporteConsole)

    def test_backend_memoria_retorna_transporte_memoria(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "memoria")

        assert isinstance(email_service.obter_transporte(), email_service.TransporteMemoria)

    def test_backend_smtp_sem_host_levanta_erro(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.delenv("SMTP_HOST", raising=False)

        with pytest.raises(email_service.ErroEnvioEmail):
            email_service.obter_transporte()

    def test_backend_smtp_com_host_retorna_transporte_smtp(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.setenv("SMTP_HOST", "localhost")
        monkeypatch.setenv("SMTP_PORT", "1025")

        transporte = email_service.obter_transporte()

        assert isinstance(transporte, email_service.TransporteSmtp)
        assert transporte.host == "localhost"
        assert transporte.porta == 1025
        assert transporte.usar_ssl is False

    def test_backend_smtp_com_ssl_configurado(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
        monkeypatch.setenv("SMTP_PORT", "465")
        monkeypatch.setenv("SMTP_USE_SSL", "true")

        transporte = email_service.obter_transporte()
        assert isinstance(transporte, email_service.TransporteSmtp)
        assert transporte.usar_ssl is True
        assert transporte.porta == 465

    def test_backend_desconhecido_cai_para_console(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "transporte-inexistente")

        assert isinstance(email_service.obter_transporte(), email_service.TransporteConsole)

    def test_link_de_verificacao_usa_app_base_url(self, monkeypatch):
        monkeypatch.setenv("APP_BASE_URL", "https://app.rentalspouse.com/")

        link = email_service.montar_link_verificacao("abc123")

        assert link == "https://app.rentalspouse.com/verificar-email?token=abc123"

    def test_mensagem_possui_texto_puro_e_html(self):
        mensagem = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome="Maria Silva",
            token="abc123",
            expira_horas=24,
        )

        assert mensagem["To"] == EMAIL_PRINCIPAL
        assert mensagem.is_multipart()
        subtipos = {parte.get_content_subtype() for parte in mensagem.iter_parts()}
        assert "plain" in subtipos
        assert "html" in subtipos
        assert "Maria" in mensagem.get_body(preferencelist=("plain",)).get_content()

    def test_mensagem_possui_cabecalhos_anti_spam(self):
        mensagem = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome="Carlos Teste",
            token="xyz789",
            expira_horas=24,
        )
        assert "Date" in mensagem
        assert "Message-ID" in mensagem
        assert mensagem["Auto-Submitted"] == "auto-generated"

    def test_remetente_fallback_para_smtp_user(self, monkeypatch):
        monkeypatch.setenv("EMAIL_FROM_ADDRESS", "nao-responda@rentalspouse.local")
        monkeypatch.setenv("SMTP_USER", "real.sender@gmail.com")
        nome, endereco = email_service.remetente()
        assert endereco == "real.sender@gmail.com"

    def test_remetente_preserva_endereco_customizado(self, monkeypatch):
        monkeypatch.setenv("EMAIL_FROM_ADDRESS", "contato@rentalspouse.com")
        monkeypatch.setenv("SMTP_USER", "outro.usuario@gmail.com")
        nome, endereco = email_service.remetente()
        assert endereco == "contato@rentalspouse.com"

    def test_mensagem_escapa_html_no_nome(self):
        mensagem = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome="<script>alert('xss')</script> João",
            token="abc123",
            expira_horas=24,
        )
        corpo_html = mensagem.get_body(preferencelist=("html",)).get_content()
        assert "<script>" not in corpo_html
        assert "&lt;script&gt;alert(" in corpo_html

    def test_expiracao_e_intervalo_respeitam_variaveis_de_ambiente(self, monkeypatch):
        monkeypatch.setenv("EMAIL_VERIFICACAO_EXPIRA_HORAS", "2")
        monkeypatch.setenv("EMAIL_VERIFICACAO_REENVIO_SEGUNDOS", "30")

        assert verificacao.expiracao_horas() == 2
        assert verificacao.intervalo_reenvio_segundos() == 30

    @pytest.mark.parametrize("valor_invalido", ["", "abc", "0", "-5"])
    def test_valores_invalidos_de_ambiente_usam_fallback(self, monkeypatch, valor_invalido):
        monkeypatch.setenv("EMAIL_VERIFICACAO_EXPIRA_HORAS", valor_invalido)

        assert verificacao.expiracao_horas() == verificacao.EXPIRACAO_PADRAO_HORAS

    def test_smtp_transmite_erro_de_conexao_como_erro_envio_email(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.setenv("SMTP_HOST", "localhost")
        monkeypatch.setenv("SMTP_PORT", "1")
        monkeypatch.setenv("SMTP_TIMEOUT", "1")

        with patch("smtplib.SMTP", side_effect=OSError("conexão recusada")):
            with pytest.raises(email_service.ErroEnvioEmail):
                email_service.enviar_email_verificacao(
                    destinatario=EMAIL_PRINCIPAL,
                    nome="Cliente",
                    token="abc123",
                    expira_horas=24,
                )


# ===========================================================================
# Unidades: transportes de e-mail
# ===========================================================================


class TestTransportes:
    """Comportamento de cada transporte concreto."""

    def test_transporte_memoria_acumula_mensagens(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "memoria")
        email_service.limpar_caixa_de_saida()
        transporte = email_service.obter_transporte()

        transporte.enviar(MagicMock())
        transporte.enviar(MagicMock())

        assert len(email_service.caixa_de_saida()) == 2

    def test_transporte_console_nao_levanta_erro(self, monkeypatch, caplog):
        monkeypatch.setenv("EMAIL_BACKEND", "console")

        # Não deve propagar exceção: em dev o e-mail apenas vai para o log
        email_service.enviar_email_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome="Cliente Console",
            token="abc123",
            expira_horas=24,
        )

    def test_transporte_smtp_executa_handshake_envio(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
        monkeypatch.setenv("SMTP_PORT", "587")
        monkeypatch.setenv("SMTP_USER", "usuario")
        monkeypatch.setenv("SMTP_PASSWORD", "senha-secreta")
        monkeypatch.setenv("SMTP_USE_TLS", "true")

        falso_smtp = MagicMock()
        with patch("smtplib.SMTP", return_value=falso_smtp) as construtor:
            email_service.enviar_email_verificacao(
                destinatario=EMAIL_PRINCIPAL,
                nome="Cliente SMTP",
                token="abc123",
                expira_horas=24,
            )

        construtor.assert_called_once_with("smtp.example.com", 587, timeout=10)
        conexao = falso_smtp.__enter__.return_value
        assert conexao.ehlo.call_count == 2  # antes e depois do STARTTLS
        conexao.starttls.assert_called_once()
        conexao.login.assert_called_once_with("usuario", "senha-secreta")
        conexao.send_message.assert_called_once()

    def test_transporte_smtp_sem_tls_e_sem_credenciais(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.setenv("SMTP_HOST", "localhost")
        monkeypatch.setenv("SMTP_USE_TLS", "false")
        monkeypatch.setenv("SMTP_USER", "")

        falso_smtp = MagicMock()
        with patch("smtplib.SMTP", return_value=falso_smtp):
            email_service.enviar_email_verificacao(
                destinatario=EMAIL_PRINCIPAL,
                nome="Cliente SMTP",
                token="abc123",
                expira_horas=24,
            )

        conexao = falso_smtp.__enter__.return_value
        conexao.starttls.assert_not_called()
        conexao.login.assert_not_called()
        conexao.send_message.assert_called_once()

    def test_transporte_smtp_ssl_direto_porta_465(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
        monkeypatch.setenv("SMTP_PORT", "465")
        monkeypatch.setenv("SMTP_USER", "usuario@gmail.com")
        monkeypatch.setenv("SMTP_PASSWORD", "senha-app")
        monkeypatch.setenv("SMTP_USE_SSL", "true")

        falso_ssl = MagicMock()
        with patch("smtplib.SMTP_SSL", return_value=falso_ssl) as construtor_ssl:
            email_service.enviar_email_verificacao(
                destinatario=EMAIL_PRINCIPAL,
                nome="Cliente SSL",
                token="token465",
                expira_horas=24,
            )

        assert construtor_ssl.call_count == 1
        args, kwargs = construtor_ssl.call_args
        assert args[0] == "smtp.gmail.com"
        assert args[1] == 465
        assert kwargs["timeout"] == 10
        assert "context" in kwargs

        conexao = falso_ssl.__enter__.return_value
        conexao.login.assert_called_once_with("usuario@gmail.com", "senha-app")
        conexao.send_message.assert_called_once()


# ===========================================================================
# Unidades: guardas defensivas da camada de negócio
# ===========================================================================


class TestGuardasDeNegocio:
    """
    Guardas que protegem a camada de negócio caso ela seja chamada diretamente,
    sem a validação de payload do Pydantic.
    """

    def test_confirmar_com_token_em_branco_levanta_erro(self, db_session):
        with pytest.raises(verificacao.ErroVerificacao) as erro:
            verificacao.confirmar_verificacao(db_session, "   ")

        assert erro.value.mensagem == verificacao.MENSAGEM_TOKEN_INVALIDO
        assert erro.value.status_code == 400

    def test_reenvio_com_email_em_branco_retorna_none(self, db_session):
        assert verificacao.solicitar_reenvio(db_session, "   ") is None
        assert verificacao.solicitar_reenvio(db_session, None) is None


# ===========================================================================
# Segurança: escape do conteúdo controlado pelo usuário no corpo do e-mail
# ===========================================================================


class TestSegurancaDoCorpoDoEmail:
    """
    O nome informado no cadastro é dado controlado pelo usuário e não pode
    injetar marcação HTML no corpo do e-mail.
    """

    NOME_MALICIOSO = '<script>alert("xss")</script>'

    def test_nome_e_escapado_no_corpo_html(self):
        mensagem = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome=f"{self.NOME_MALICIOSO} Silva",
            token="abc123",
            expira_horas=24,
        )

        corpo_html = mensagem.get_body(preferencelist=("html",)).get_content()

        assert "<script>" not in corpo_html
        assert "&lt;script&gt;" in corpo_html

    def test_caracteres_especiais_nao_quebram_o_html(self):
        mensagem = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome='Tom&Jerry"aspas"',
            token="abc123",
            expira_horas=24,
        )

        corpo_html = mensagem.get_body(preferencelist=("html",)).get_content()

        assert "Tom&amp;Jerry" in corpo_html
        assert "&quot;aspas&quot;" in corpo_html

    def test_texto_puro_preserva_o_nome_sem_entidades(self):
        mensagem = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome='Tom&Jerry"aspas"',
            token="abc123",
            expira_horas=24,
        )

        texto = mensagem.get_body(preferencelist=("plain",)).get_content()

        # Em texto puro não há interpretação de marcação: o valor vai literal
        assert 'Tom&Jerry"aspas"' in texto
        assert "&amp;" not in texto

    def test_link_aparece_escapado_no_href(self):
        mensagem = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome="Ana",
            token="abc123",
            expira_horas=24,
        )

        corpo_html = mensagem.get_body(preferencelist=("html",)).get_content()

        assert 'href="http://localhost:3000/verificar-email?token=abc123"' in corpo_html


# ===========================================================================
# Contrato do envio em BackgroundTask
# ===========================================================================


class TestEmailPendenteEPreparacao:
    """`preparar_verificacao` devolve dados primitivos e o envio é resiliente."""

    def test_preparar_verificacao_devolve_apenas_dados_primitivos(
        self, client, db_session
    ):
        cadastrar_cliente(client)

        pendente = verificacao.preparar_verificacao(
            db_session, obter_cliente(db_session)
        )

        assert isinstance(pendente, verificacao.EmailPendente)
        assert pendente.destinatario == EMAIL_PRINCIPAL
        assert pendente.nome == "Cliente Verificação"
        assert isinstance(pendente.token, str) and pendente.token
        assert pendente.expira_horas == verificacao.expiracao_horas()

    def test_preparar_verificacao_substitui_o_token_anterior(self, client, db_session):
        cadastrar_cliente(client)
        cliente = obter_cliente(db_session)
        hash_anterior = cliente.verificacao_token_hash

        pendente = verificacao.preparar_verificacao(db_session, cliente)

        assert cliente.verificacao_token_hash == hash_token(pendente.token)
        assert cliente.verificacao_token_hash != hash_anterior

    def test_envio_absorve_falha_de_smtp(self, monkeypatch):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.delenv("SMTP_HOST", raising=False)
        pendente = verificacao.EmailPendente(EMAIL_PRINCIPAL, "Ana", "abc123", 24)

        # Não propaga exceção: a BackgroundTask não pode derrubar a requisição
        assert verificacao.enviar_email_de_verificacao(pendente) is False

    def test_envio_retorna_true_quando_entrega(self, caixa_de_entrada):
        pendente = verificacao.EmailPendente(EMAIL_PRINCIPAL, "Ana", "abc123", 24)

        assert verificacao.enviar_email_de_verificacao(pendente) is True
        assert len(caixa_de_entrada) == 1
        assert caixa_de_entrada[0]["To"] == EMAIL_PRINCIPAL

    def test_iniciar_verificacao_emite_e_envia_na_mesma_chamada(
        self, client, caixa_de_entrada, db_session
    ):
        cadastrar_cliente(client)
        caixa_de_entrada.clear()

        enviado, token = verificacao.iniciar_verificacao(
            db_session, obter_cliente(db_session)
        )

        assert enviado is True
        assert len(caixa_de_entrada) == 1
        assert extrair_token(caixa_de_entrada[0]) == token


# ===========================================================================
# Refatoração Sênior: Retries, Configuração Defensiva, LGPD e Headers RFC
# ===========================================================================


class TestRefatoracaoSeniorEmail:
    """Valida resiliência de transporte, retries exponenciais, parsing e privacidade."""

    def test_mascarar_email_protege_privacidade_lgpd(self):
        assert email_service.mascarar_email("") == "***"
        assert email_service.mascarar_email("invalido") == "***"
        assert email_service.mascarar_email("a@exemplo.com") == "a*@exemplo.com"
        assert email_service.mascarar_email("ab@exemplo.com") == "a*@exemplo.com"
        assert email_service.mascarar_email("usuario@exemplo.com") == "u***o@exemplo.com"
        assert email_service.mascarar_email("carlos.silva@aluguel.com") == "c***a@aluguel.com"

    @pytest.mark.parametrize(
        "valor,padrao,minimo,maximo,esperado",
        [
            ("465", 587, 1, 65535, 465),
            ("", 587, 1, 65535, 587),
            ("invalido", 587, 1, 65535, 587),
            ("0", 587, 1, 65535, 587),  # abaixo do mínimo
            ("70000", 587, 1, 65535, 587),  # acima do máximo
            ("10", 10, 1, 120, 10),
        ],
    )
    def test_parse_int_seguro_aplica_limites_e_fallbacks(
        self, valor, padrao, minimo, maximo, esperado
    ):
        assert (
            email_service._parse_int_seguro(valor, padrao, minimo, maximo) == esperado
        )

    def test_configuracao_smtp_carrega_do_ambiente_com_defaults(self, monkeypatch):
        monkeypatch.setenv("SMTP_HOST", "smtp.provedor.com")
        monkeypatch.setenv("SMTP_PORT", "465")
        monkeypatch.setenv("SMTP_USE_SSL", "true")
        monkeypatch.setenv("SMTP_MAX_RETRIES", "5")
        monkeypatch.setenv("SMTP_TIMEOUT", "15")

        cfg = email_service.ConfiguracaoSmtp.do_ambiente()
        assert cfg.host == "smtp.provedor.com"
        assert cfg.porta == 465
        assert cfg.usar_ssl is True
        assert cfg.max_tentativas == 5
        assert cfg.timeout == 15

    def test_transporte_smtp_reintenta_apos_falha_transitoria_e_tem_sucesso(
        self, monkeypatch
    ):
        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        transporte = email_service.TransporteSmtp(
            host="smtp.example.com",
            porta=587,
            usuario="user",
            senha="pwd",
            usar_tls=True,
            timeout=5,
            max_tentativas=3,
            backoff_inicial=0.01,
        )

        mock_disparo = MagicMock(side_effect=[OSError("Rede instável"), None])
        monkeypatch.setattr(transporte, "_executar_disparo", mock_disparo)

        msg = email_service.EmailMessage()
        msg["To"] = EMAIL_PRINCIPAL
        transporte.enviar(msg)

        assert mock_disparo.call_count == 2

    def test_transporte_smtp_falha_rapido_em_erro_de_autenticacao_sem_retry(
        self, monkeypatch
    ):
        transporte = email_service.TransporteSmtp(
            host="smtp.example.com",
            porta=587,
            usuario="user",
            senha="wrong",
            usar_tls=True,
            timeout=5,
            max_tentativas=3,
            backoff_inicial=0.01,
        )

        erro_auth = email_service.smtplib.SMTPAuthenticationError(535, b"Bad credentials")
        mock_disparo = MagicMock(side_effect=erro_auth)
        monkeypatch.setattr(transporte, "_executar_disparo", mock_disparo)

        msg = email_service.EmailMessage()
        msg["To"] = EMAIL_PRINCIPAL
        with pytest.raises(email_service.ErroEnvioEmail) as exc:
            transporte.enviar(msg)

        assert "Falha de autenticação SMTP" in str(exc.value)
        assert mock_disparo.call_count == 1  # Fail-fast, sem gastar retries

    def test_transporte_smtp_esgota_tentativas_e_lanca_erro(self, monkeypatch):
        transporte = email_service.TransporteSmtp(
            host="smtp.example.com",
            porta=587,
            usuario="user",
            senha="pwd",
            usar_tls=True,
            timeout=5,
            max_tentativas=2,
            backoff_inicial=0.01,
        )

        mock_disparo = MagicMock(side_effect=OSError("Timeout de socket"))
        monkeypatch.setattr(transporte, "_executar_disparo", mock_disparo)

        msg = email_service.EmailMessage()
        msg["To"] = EMAIL_PRINCIPAL
        with pytest.raises(email_service.ErroEnvioEmail) as exc:
            transporte.enviar(msg)

        assert "após 2 tentativas" in str(exc.value)
        assert mock_disparo.call_count == 2

    def test_mensagem_inclui_cabecalhos_rfc_e_reply_to_customizado(self, monkeypatch):
        monkeypatch.setenv("EMAIL_REPLY_TO", "atendimento@rentalspouse.com")
        msg = email_service.montar_mensagem_verificacao(
            destinatario=EMAIL_PRINCIPAL,
            nome="Mariana",
            token="token-teste-rfc",
            expira_horas=12,
        )

        assert msg["Reply-To"] == "atendimento@rentalspouse.com"
        assert msg["X-Mailer"] == "RentalSpouse Transacional/1.0"
        assert msg["Auto-Submitted"] == "auto-generated"
        assert "Date" in msg
        assert "Message-ID" in msg
