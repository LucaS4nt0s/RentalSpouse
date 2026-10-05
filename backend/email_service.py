"""
Camada de transporte de e-mail transacional do RentalSpouse.

Responsabilidade única: **entregar** uma mensagem de e-mail. Nenhuma regra de
negócio de verificação vive aqui — o ciclo de vida do token é responsabilidade
de `verificacao.py`.

Decisão arquitetural (AI_RULES.md § 1): este módulo usa **exclusivamente a
biblioteca padrão** (`smtplib` + `email.message`), portanto **não introduz
nenhuma dependência nova** ao `requirements.txt`. Como as rotas do backend são
funções `def` síncronas, o FastAPI as executa em threadpool — logo o `smtplib`
bloqueante não trava o event loop.

Transportes disponíveis, selecionados pela variável de ambiente `EMAIL_BACKEND`:

| Valor     | Uso                                              |
|-----------|--------------------------------------------------|
| `console` | Padrão em desenvolvimento: registra o e-mail no log |
| `smtp`    | Envio real via SMTP (produção / Mailpit em Docker) |
| `memoria` | Guarda as mensagens em memória (testes automatizados) |
"""

import html
import logging
import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from typing import List, Protocol, Tuple
from urllib.parse import quote

logger = logging.getLogger("rentalspouse.email")

BACKEND_PADRAO = "console"


class ErroEnvioEmail(Exception):
    """Erro ao transportar uma mensagem de e-mail."""


# ---------------------------------------------------------------------------
# Contratos e transportes
# ---------------------------------------------------------------------------


class TransporteEmail(Protocol):
    """Contrato mínimo de um transporte de e-mail."""

    def enviar(self, mensagem: EmailMessage) -> None:
        """Entrega a mensagem ou levanta `ErroEnvioEmail`."""


class TransporteConsole:
    """
    Transporte de desenvolvimento: escreve o conteúdo no log da aplicação.

    Permite validar todo o fluxo de verificação (inclusive copiar o link) sem
    nenhuma configuração de SMTP.
    """

    def enviar(self, mensagem: EmailMessage) -> None:
        corpo = mensagem.get_body(preferencelist=("plain",))
        logger.warning(
            "\n"
            "================ E-MAIL (EMAIL_BACKEND=console) ================\n"
            "Para:    %s\n"
            "Assunto: %s\n"
            "----------------------------------------------------------------\n"
            "%s\n"
            "================================================================",
            mensagem["To"],
            mensagem["Subject"],
            corpo.get_content() if corpo else "(sem corpo)",
        )


class TransporteMemoria:
    """
    Transporte para testes automatizados: acumula as mensagens em uma lista,
    sem tocar em rede ou disco.
    """

    def __init__(self, caixa: List[EmailMessage]) -> None:
        self._caixa = caixa

    def enviar(self, mensagem: EmailMessage) -> None:
        self._caixa.append(mensagem)


class TransporteSmtp:
    """Transporte real via SMTP (com STARTTLS por padrão)."""

    def __init__(
        self,
        host: str,
        porta: int,
        usuario: str,
        senha: str,
        usar_tls: bool,
        timeout: int,
    ) -> None:
        self.host = host
        self.porta = porta
        self.usuario = usuario
        self.senha = senha
        self.usar_tls = usar_tls
        self.timeout = timeout

    def enviar(self, mensagem: EmailMessage) -> None:
        try:
            with smtplib.SMTP(self.host, self.porta, timeout=self.timeout) as smtp:
                smtp.ehlo()
                if self.usar_tls:
                    smtp.starttls()
                    smtp.ehlo()
                if self.usuario:
                    smtp.login(self.usuario, self.senha)
                smtp.send_message(mensagem)
        except (smtplib.SMTPException, OSError) as erro:
            raise ErroEnvioEmail(f"Falha ao enviar e-mail via SMTP: {erro}") from erro


# ---------------------------------------------------------------------------
# Caixa de saída em memória (usada pelos testes e por scripts de diagnóstico)
# ---------------------------------------------------------------------------

_CAIXA_DE_SAIDA: List[EmailMessage] = []


def caixa_de_saida() -> List[EmailMessage]:
    """Retorna a lista de mensagens retidas pelo transporte `memoria`."""
    return _CAIXA_DE_SAIDA


def limpar_caixa_de_saida() -> None:
    """Esvazia a caixa de saída em memória."""
    _CAIXA_DE_SAIDA.clear()


# ---------------------------------------------------------------------------
# Configuração (sempre lida em tempo de execução, para permitir override em testes)
# ---------------------------------------------------------------------------


def backend_configurado() -> str:
    """Nome do transporte selecionado em `EMAIL_BACKEND`."""
    return os.getenv("EMAIL_BACKEND", BACKEND_PADRAO).strip().lower()


def app_base_url() -> str:
    """URL base pública do frontend, usada para montar o link de verificação."""
    return os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/")


def remetente() -> Tuple[str, str]:
    """Retorna (nome, endereço) do remetente dos e-mails transacionais."""
    return (
        os.getenv("EMAIL_FROM_NAME", "RentalSpouse"),
        os.getenv("EMAIL_FROM_ADDRESS", "nao-responda@rentalspouse.local"),
    )


def obter_transporte() -> TransporteEmail:
    """
    Instancia o transporte configurado.

    Levanta `ErroEnvioEmail` se a configuração for inconsistente (ex.: backend
    `smtp` sem `SMTP_HOST` definido), evitando falhas silenciosas.
    """
    backend = backend_configurado()

    if backend == "memoria":
        return TransporteMemoria(_CAIXA_DE_SAIDA)

    if backend == "smtp":
        host = os.getenv("SMTP_HOST", "").strip()
        if not host:
            raise ErroEnvioEmail(
                "EMAIL_BACKEND=smtp exige a variável de ambiente SMTP_HOST."
            )
        return TransporteSmtp(
            host=host,
            porta=int(os.getenv("SMTP_PORT", "587")),
            usuario=os.getenv("SMTP_USER", "").strip(),
            senha=os.getenv("SMTP_PASSWORD", ""),
            usar_tls=os.getenv("SMTP_USE_TLS", "true").strip().lower()
            in ("1", "true", "yes"),
            timeout=int(os.getenv("SMTP_TIMEOUT", "10")),
        )

    if backend != "console":
        logger.warning(
            "EMAIL_BACKEND='%s' desconhecido. Usando 'console'.", backend
        )

    return TransporteConsole()


# ---------------------------------------------------------------------------
# Composição e envio
# ---------------------------------------------------------------------------


def montar_link_verificacao(token: str) -> str:
    """
    Monta o link de confirmação que o usuário recebe por e-mail.

    O token trafega como parâmetro de URL (padrão para links de e-mail). A
    página do frontend lê o parâmetro e o submete no corpo da requisição, para
    que o token não apareça nos logs de acesso da API.
    """
    return f"{app_base_url()}/verificar-email?token={quote(token)}"


def montar_mensagem_verificacao(
    destinatario: str,
    nome: str,
    token: str,
    expira_horas: int,
) -> EmailMessage:
    """Compõe a mensagem (texto puro + HTML) de confirmação de e-mail.

    O nome informado no cadastro é dado controlado pelo usuário e aceita
    caracteres gerais. Por isso ele é **escapado** (`html.escape`) antes de ser
    interpolado no corpo HTML, impedindo que um nome contendo marcação injete
    tags no e-mail. No corpo em texto puro o nome vai sem escape, pois não há
    interpretação de marcação. O link recebe o mesmo tratamento por rigor: é
    montado a partir de uma URL base confiável e de um token URL-safe, mas
    ainda assim é escapado para o atributo `href`.
    """
    nome_remetente, endereco_remetente = remetente()
    link = montar_link_verificacao(token)
    primeiro_nome_puro = (nome or "").split(" ")[0] or "olá"
    # Somente para interpolação em HTML — nunca no corpo em texto puro.
    primeiro_nome_html = html.escape(primeiro_nome_puro)
    link_html = html.escape(link, quote=True)

    mensagem = EmailMessage()
    mensagem["Subject"] = "Confirme seu e-mail na RentalSpouse"
    mensagem["From"] = formataddr((nome_remetente, endereco_remetente))
    mensagem["To"] = destinatario

    texto = (
        f"Olá, {primeiro_nome_puro}!\n\n"
        "Falta pouco para concluir seu cadastro na RentalSpouse.\n"
        "Confirme seu endereço de e-mail acessando o link abaixo:\n\n"
        f"{link}\n\n"
        f"Este link é de uso único e expira em {expira_horas} hora(s).\n\n"
        "Se você não realizou esse cadastro, basta ignorar esta mensagem.\n\n"
        "Equipe RentalSpouse"
    )

    corpo_html = f"""\
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0E1B2E;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0"
                 style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px;font-size:20px;color:#1E40AF;">Confirme seu e-mail</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;">
                  Olá, <strong>{primeiro_nome_html}</strong>! Falta pouco para concluir seu cadastro
                  na RentalSpouse.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:22px;">
                  Confirme seu endereço de e-mail clicando no botão abaixo:
                </p>
                <p style="margin:0 0 24px;">
                  <a href="{link_html}"
                     style="display:inline-block;background:#1D4ED8;color:#ffffff;text-decoration:none;
                            font-size:14px;font-weight:bold;padding:12px 24px;border-radius:12px;">
                    Confirmar meu e-mail
                  </a>
                </p>
                <p style="margin:0 0 16px;font-size:12px;line-height:20px;color:#64748B;">
                  Este link é de uso único e expira em {expira_horas} hora(s).
                </p>
                <p style="margin:0;font-size:12px;line-height:20px;color:#64748B;">
                  Se você não realizou esse cadastro, basta ignorar esta mensagem.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""

    mensagem.set_content(texto)
    mensagem.add_alternative(corpo_html, subtype="html")
    return mensagem


def enviar_email_verificacao(
    destinatario: str,
    nome: str,
    token: str,
    expira_horas: int,
) -> None:
    """
    Compõe e transporta o e-mail de verificação.

    Propaga `ErroEnvioEmail` em caso de falha — cabe à camada de serviço decidir
    se o erro é fatal ou se deve ser apenas registrado.
    """
    mensagem = montar_mensagem_verificacao(destinatario, nome, token, expira_horas)
    transporte = obter_transporte()
    transporte.enviar(mensagem)
    logger.info("E-mail de verificação enviado para %s", destinatario)
