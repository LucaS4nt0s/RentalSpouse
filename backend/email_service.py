"""
Camada de transporte de e-mail transacional do RentalSpouse.

Responsabilidade única: **entregar** uma mensagem de e-mail com alta
resiliência, conformidade com RFCs anti-spam e observabilidade estruturada.
Nenhuma regra de negócio de verificação vive aqui — o ciclo de vida do token
é responsabilidade de `verificacao.py`.

Decisão arquitetural (AI_RULES.md § 1): este módulo usa **exclusivamente a
biblioteca padrão** (`smtplib` + `email.message` + `ssl`), portanto **não introduz
nenhuma dependência nova** ao `requirements.txt`. Como as rotas do backend são
funções `def` síncronas, o FastAPI as executa em threadpool — logo o `smtplib`
bloqueante não trava o event loop.

Transportes disponíveis, selecionados pela variável de ambiente `EMAIL_BACKEND`:

| Valor     | Uso                                                    |
|-----------|--------------------------------------------------------|
| `console` | Padrão em desenvolvimento: registra o e-mail no log    |
| `smtp`    | Envio real via SMTP (produção / Mailpit em Docker)     |
| `memoria` | Guarda as mensagens em memória (testes automatizados)  |
"""

import html
import logging
import os
import smtplib
import ssl
import time
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from typing import List, Optional, Protocol, Tuple
from urllib.parse import quote

logger = logging.getLogger("rentalspouse.email")

BACKEND_PADRAO = "console"


class ErroEnvioEmail(Exception):
    """Erro ao transportar uma mensagem de e-mail."""


def mascarar_email(email: str) -> str:
    """
    Mascaramento seguro de e-mail para logs e auditoria em conformidade com a LGPD.

    Exemplos:
        'usuario@exemplo.com' -> 'u***o@exemplo.com'
        'ab@exemplo.com'      -> 'a*@exemplo.com'
        ''                    -> '***'
    """
    if not email or "@" not in email:
        return "***"
    usuario, dominio = email.split("@", 1)
    if len(usuario) <= 2:
        usuario_mascarado = f"{usuario[0]}*" if usuario else "*"
    else:
        usuario_mascarado = f"{usuario[0]}***{usuario[-1]}"
    return f"{usuario_mascarado}@{dominio}"


def _parse_int_seguro(
    valor: Optional[str], padrao: int, minimo: int = 1, maximo: Optional[int] = None
) -> int:
    """Converte string para inteiro de forma defensiva com limites seguros."""
    if not valor:
        return padrao
    try:
        num = int(str(valor).strip())
        if num < minimo:
            return padrao
        if maximo is not None and num > maximo:
            return padrao
        return num
    except (ValueError, TypeError):
        return padrao


def _parse_bool_seguro(valor: Optional[str], padrao: bool = False) -> bool:
    """Converte valor de ambiente em booleano estrito."""
    if valor is None:
        return padrao
    return str(valor).strip().lower() in ("1", "true", "yes", "on", "sim")


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


@dataclass(frozen=True)
class ConfiguracaoSmtp:
    """Configuração imutável, validada e defensiva para transporte SMTP."""

    host: str
    porta: int = 587
    usuario: str = ""
    senha: str = ""
    usar_tls: bool = True
    usar_ssl: bool = False
    timeout: int = 10
    max_tentativas: int = 3
    backoff_inicial: float = 0.5

    @classmethod
    def do_ambiente(cls) -> "ConfiguracaoSmtp":
        host = os.getenv("SMTP_HOST", "").strip()
        porta = _parse_int_seguro(os.getenv("SMTP_PORT"), padrao=587, minimo=1, maximo=65535)
        usar_ssl = _parse_bool_seguro(os.getenv("SMTP_USE_SSL"), padrao=(porta == 465))
        usar_tls = _parse_bool_seguro(os.getenv("SMTP_USE_TLS"), padrao=True)
        timeout = _parse_int_seguro(os.getenv("SMTP_TIMEOUT"), padrao=10, minimo=1, maximo=120)
        max_tentativas = _parse_int_seguro(os.getenv("SMTP_MAX_RETRIES"), padrao=3, minimo=1, maximo=10)

        return cls(
            host=host,
            porta=porta,
            usuario=os.getenv("SMTP_USER", "").strip(),
            senha=os.getenv("SMTP_PASSWORD", ""),
            usar_tls=usar_tls,
            usar_ssl=usar_ssl,
            timeout=timeout,
            max_tentativas=max_tentativas,
        )


class TransporteSmtp:
    """
    Transporte resiliente via SMTP com suporte a STARTTLS (porta 587),
    SSL/TLS direto (porta 465), retries com backoff exponencial e métricas de latência.
    """

    def __init__(
        self,
        host: str,
        porta: int,
        usuario: str,
        senha: str,
        usar_tls: bool,
        timeout: int,
        usar_ssl: bool = False,
        max_tentativas: int = 3,
        backoff_inicial: float = 0.5,
    ) -> None:
        self.host = host
        self.porta = porta
        self.usuario = usuario
        self.senha = senha
        self.usar_tls = usar_tls
        self.timeout = timeout
        # Se usar_ssl não for explícito, infere SSL direto se a porta for 465
        self.usar_ssl = usar_ssl or (porta == 465)
        self.max_tentativas = max(1, max_tentativas)
        self.backoff_inicial = max(0.01, backoff_inicial)

    def _executar_disparo(self, mensagem: EmailMessage) -> None:
        """Executa um ciclo pontual de conexão e entrega SMTP."""
        if self.usar_ssl:
            contexto_ssl = ssl.create_default_context()
            with smtplib.SMTP_SSL(
                self.host,
                self.porta,
                timeout=self.timeout,
                context=contexto_ssl,
            ) as smtp:
                smtp.ehlo()
                if self.usuario:
                    smtp.login(self.usuario, self.senha)
                smtp.send_message(mensagem)
        else:
            with smtplib.SMTP(self.host, self.porta, timeout=self.timeout) as smtp:
                smtp.ehlo()
                if self.usar_tls:
                    smtp.starttls()
                    smtp.ehlo()
                if self.usuario:
                    smtp.login(self.usuario, self.senha)
                smtp.send_message(mensagem)

    def enviar(self, mensagem: EmailMessage) -> None:
        """
        Entrega a mensagem com política de retries exponenciais para falhas transitórias.

        Erros definitivos de autenticação (535) falham imediatamente (fail-fast).
        Falhas de I/O de rede ou timeouts sofrem retries com backoff exponencial.
        """
        destinatario_mascarado = mascarar_email(str(mensagem.get("To", "")))
        msg_id = str(mensagem.get("Message-ID", "(sem-id)"))
        ultima_excecao: Optional[Exception] = None

        for tentativa in range(1, self.max_tentativas + 1):
            inicio = time.perf_counter()
            try:
                self._executar_disparo(mensagem)
                duracao_ms = (time.perf_counter() - inicio) * 1000
                logger.info(
                    "E-mail entregue com sucesso via SMTP para %s em %.2fms (tentativa %d/%d, ID: %s)",
                    destinatario_mascarado,
                    duracao_ms,
                    tentativa,
                    self.max_tentativas,
                    msg_id,
                )
                return
            except smtplib.SMTPAuthenticationError as erro:
                # Erro definitivo: credencial inválida não se resolve com retry
                logger.error(
                    "Falha irrecuperável de autenticação SMTP para %s: %s",
                    destinatario_mascarado,
                    erro,
                )
                raise ErroEnvioEmail(f"Falha de autenticação SMTP: {erro}") from erro
            except (smtplib.SMTPException, OSError) as erro:
                ultima_excecao = erro
                if tentativa < self.max_tentativas:
                    espera = self.backoff_inicial * (2 ** (tentativa - 1))
                    logger.warning(
                        "Falha transitória no envio SMTP para %s (tentativa %d/%d: %s). "
                        "Nova tentativa em %.2fs...",
                        destinatario_mascarado,
                        tentativa,
                        self.max_tentativas,
                        erro,
                        espera,
                    )
                    time.sleep(espera)
                else:
                    logger.error(
                        "Esgotadas as %d tentativas de envio SMTP para %s. Último erro: %s",
                        self.max_tentativas,
                        destinatario_mascarado,
                        erro,
                    )

        raise ErroEnvioEmail(
            f"Falha ao enviar e-mail via SMTP após {self.max_tentativas} tentativas: {ultima_excecao}"
        ) from ultima_excecao


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
    """
    Retorna (nome, endereço) do remetente dos e-mails transacionais.

    Caso o endereço padrão seja um domínio fictício (ex.: .local) ou vazio,
    e houver um SMTP_USER configurado com formato de e-mail, adota o SMTP_USER
    como remetente para evitar rejeições de envio (ex.: erro 550 por SPF/spoofing).
    """
    nome = (os.getenv("EMAIL_FROM_NAME") or "RentalSpouse").strip()
    endereco = (os.getenv("EMAIL_FROM_ADDRESS") or "").strip()
    smtp_user = (os.getenv("SMTP_USER") or "").strip()

    if not endereco or endereco.endswith(".local"):
        if "@" in smtp_user:
            endereco = smtp_user
        elif not endereco:
            endereco = "nao-responda@rentalspouse.local"

    return (nome, endereco)


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
        cfg = ConfiguracaoSmtp.do_ambiente()
        if not cfg.host:
            raise ErroEnvioEmail(
                "EMAIL_BACKEND=smtp exige a variável de ambiente SMTP_HOST."
            )
        return TransporteSmtp(
            host=cfg.host,
            porta=cfg.porta,
            usuario=cfg.usuario,
            senha=cfg.senha,
            usar_tls=cfg.usar_tls,
            timeout=cfg.timeout,
            usar_ssl=cfg.usar_ssl,
            max_tentativas=cfg.max_tentativas,
            backoff_inicial=cfg.backoff_inicial,
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
    """
    Compõe a mensagem transacional (texto puro + HTML) com headers anti-spam RFC 5322.

    Headers incluídos para máxima entregabilidade em provedores reais (Gmail, Outlook):
    - `Date`: carimbo UTC/Local padronizado (RFC 5322)
    - `Message-ID`: identificador único por domínio do remetente
    - `Auto-Submitted`: marcação de mensagem gerada por sistema
    - `Reply-To`: canal de resposta para atendimento ao usuário
    - `X-Mailer`: identificação do software emissor
    """
    nome_remetente, endereco_remetente = remetente()
    link = montar_link_verificacao(token)
    primeiro_nome_puro = (nome or "").split(" ")[0] or "olá"
    primeiro_nome_html = html.escape(primeiro_nome_puro)
    link_html = html.escape(link, quote=True)

    mensagem = EmailMessage()
    mensagem["Subject"] = "Confirme seu e-mail na RentalSpouse"
    mensagem["From"] = formataddr((nome_remetente, endereco_remetente))
    mensagem["To"] = destinatario
    mensagem["Date"] = formatdate(localtime=True)

    dominio = "rentalspouse.com"
    if "@" in endereco_remetente:
        dominio_candidato = endereco_remetente.split("@")[-1].strip()
        if dominio_candidato and "." in dominio_candidato:
            dominio = dominio_candidato

    mensagem["Message-ID"] = make_msgid(domain=dominio)
    mensagem["Auto-Submitted"] = "auto-generated"
    mensagem["X-Mailer"] = "RentalSpouse Transacional/1.0"

    reply_to = (os.getenv("EMAIL_REPLY_TO") or "").strip() or endereco_remetente
    if reply_to and "@" in reply_to:
        mensagem["Reply-To"] = reply_to

    texto = (
        f"Olá, {primeiro_nome_puro}!\n\n"
        "Falta pouco para concluir seu cadastro na RentalSpouse.\n"
        "Confirme seu endereço de e-mail acessando o link abaixo:\n\n"
        f"{link}\n\n"
        f"Este link é de uso único e expira em {expira_horas} hora(s).\n\n"
        "Dica: caso esta mensagem tenha caído na sua pasta de Spam ou Lixo Eletrônico, "
        "marque-a como 'Não é spam' para receber futuras notificações com tranquilidade.\n\n"
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
                <p style="margin:0 0 20px;">
                  <a href="{link_html}"
                     style="display:inline-block;background:#1D4ED8;color:#ffffff;text-decoration:none;
                            font-size:14px;font-weight:bold;padding:12px 24px;border-radius:12px;">
                    Confirmar meu e-mail
                  </a>
                </p>
                <p style="margin:0 0 20px;font-size:12px;line-height:18px;color:#64748B;">
                  Se o botão não funcionar, copie e cole este link no navegador:<br/>
                  <a href="{link_html}" style="color:#1D4ED8;word-break:break-all;">{link_html}</a>
                </p>
                <p style="margin:0 0 16px;font-size:12px;line-height:20px;color:#64748B;">
                  Este link é de uso único e expira em {expira_horas} hora(s).
                </p>
                <p style="margin:0 0 16px;font-size:12px;line-height:20px;color:#64748B;background:#F8FAFC;padding:12px;border-radius:8px;border:1px dashed #CBD5E1;">
                  <strong>Dica:</strong> Se esta mensagem foi parar no Spam ou Lixo Eletrônico, marque-a como &ldquo;Não é spam&rdquo; para que os próximos e-mails de orçamentos e serviços cheguem diretamente à sua Caixa de Entrada.
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
    Compõe a mensagem de confirmação e a entrega através do transporte ativo.

    Levanta `ErroEnvioEmail` se a entrega falhar após todas as tentativas.
    """
    transporte = obter_transporte()
    mensagem = montar_mensagem_verificacao(
        destinatario=destinatario,
        nome=nome,
        token=token,
        expira_horas=expira_horas,
    )
    transporte.enviar(mensagem)
