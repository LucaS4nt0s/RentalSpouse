"""
Regras de negócio do ciclo de vida da verificação de e-mail.

Este módulo NÃO conhece HTTP nem SQLAlchemy além do necessário para persistir
estado — as rotas (`routes/verificacao.py`) apenas traduzem estas regras para
respostas da API.

Fluxo implementado:

    cadastro  ->  emite token  ->  envia e-mail  ->  usuário clica no link
                                                          |
                                              confirma token (uso único)
                                                          |
                                                 email_verificado = True

Garantias de segurança:
- O token nunca é persistido em claro (guarda-se apenas o hash SHA-256).
- O token é de **uso único**: ao ser consumido, o hash é apagado do banco.
- O token expira (padrão: 24 h, configurável por `EMAIL_VERIFICACAO_EXPIRA_HORAS`).
- O reenvio respeita um intervalo mínimo (padrão: 60 s), evitando spam de e-mails.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

import email_service
import models
from security import gerar_token_verificacao, hash_token

logger = logging.getLogger("rentalspouse.verificacao")

EXPIRACAO_PADRAO_HORAS = 24
INTERVALO_REENVIO_PADRAO_SEGUNDOS = 60

# Mensagens expostas pela API. São intencionalmente específicas o suficiente
# para orientar o usuário, mas nunca revelam se um e-mail está cadastrado.
MENSAGEM_TOKEN_INVALIDO = (
    "Token de verificação inválido ou já utilizado. Solicite um novo e-mail."
)
MENSAGEM_TOKEN_EXPIRADO = (
    "Este link de verificação expirou. Solicite um novo e-mail."
)
MENSAGEM_JA_VERIFICADO = "Este e-mail já foi verificado anteriormente."
MENSAGEM_REENVIO_SOLICITADO = (
    "Se este e-mail estiver cadastrado e ainda não verificado, "
    "enviamos um novo link de confirmação."
)


class ErroVerificacao(Exception):
    """Erro de negócio do fluxo de verificação, traduzido para HTTP pela rota."""

    def __init__(self, mensagem: str, status_code: int = 400) -> None:
        self.mensagem = mensagem
        self.status_code = status_code
        super().__init__(mensagem)


# ---------------------------------------------------------------------------
# Configuração e utilidades de tempo
# ---------------------------------------------------------------------------


def _inteiro_de_ambiente(nome: str, padrao: int) -> int:
    """Lê um inteiro positivo de variável de ambiente, com fallback seguro."""
    bruto = os.getenv(nome, "").strip()
    try:
        valor = int(bruto)
    except (TypeError, ValueError):
        return padrao
    return valor if valor > 0 else padrao


def expiracao_horas() -> int:
    """Validade do token de verificação, em horas."""
    return _inteiro_de_ambiente("EMAIL_VERIFICACAO_EXPIRA_HORAS", EXPIRACAO_PADRAO_HORAS)


def intervalo_reenvio_segundos() -> int:
    """Intervalo mínimo entre dois reenvios consecutivos, em segundos."""
    return _inteiro_de_ambiente(
        "EMAIL_VERIFICACAO_REENVIO_SEGUNDOS", INTERVALO_REENVIO_PADRAO_SEGUNDOS
    )


def utcnow() -> datetime:
    """
    Retorna o instante atual em UTC **sem tzinfo**.

    Decisão deliberada: as colunas de data do projeto usam `TIMESTAMP WITHOUT
    TIME ZONE` no PostgreSQL e o tipo DATETIME do SQLite nos testes. Manter o
    padrão naive-UTC evita o `TypeError` de comparar `datetime` aware com naive
    e garante o mesmo comportamento na suíte de testes e em produção.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Emissão de token
# ---------------------------------------------------------------------------


def _persistir_novo_token(cliente: models.Cliente) -> str:
    """
    Gera um token novo, grava o hash e a expiração na entidade (sem commit).

    Retorna o token em claro, que existe apenas em memória durante o envio do
    e-mail — depois disso ele é irrecuperável.
    """
    token = gerar_token_verificacao()
    agora = utcnow()

    cliente.verificacao_token_hash = hash_token(token)
    cliente.verificacao_expira_em = agora + timedelta(hours=expiracao_horas())
    cliente.verificacao_enviada_em = agora
    return token


def iniciar_verificacao(
    db: Session, cliente: models.Cliente, persistir: bool = True
) -> Tuple[bool, Optional[str]]:
    """
    Gera um novo token de verificação, persiste o estado e envia o e-mail.

    Retorna a tupla `(email_enviado, token)`. O token só é retornado para
    facilitar diagnóstico/testes; a API nunca o expõe.

    Uma falha de SMTP **não** invalida o cadastro: o erro é registrado e o
    usuário pode solicitar um novo envio pelo endpoint de reenvio. Perder um
    cadastro por indisponibilidade do provedor de e-mail seria pior do que
    exigir um reenvio.
    """
    token = _persistir_novo_token(cliente)

    if persistir:
        db.add(cliente)
        db.commit()
        db.refresh(cliente)

    try:
        email_service.enviar_email_verificacao(
            destinatario=cliente.email,
            nome=cliente.nome,
            token=token,
            expira_horas=expiracao_horas(),
        )
    except email_service.ErroEnvioEmail as erro:
        logger.error(
            "Não foi possível enviar o e-mail de verificação para %s: %s",
            cliente.email,
            erro,
        )
        return False, token

    return True, token


# ---------------------------------------------------------------------------
# Confirmação do token
# ---------------------------------------------------------------------------


def _limpar_token(cliente: models.Cliente) -> None:
    """Remove o token de verificação da entidade (torna o link inutilizável)."""
    cliente.verificacao_token_hash = None
    cliente.verificacao_expira_em = None


def confirmar_verificacao(db: Session, token: str) -> models.Cliente:
    """
    Consome um token de verificação e marca o e-mail do cliente como confirmado.

    Levanta `ErroVerificacao` quando o token não existe, já foi utilizado ou
    expirou. A operação é idempotente para contas já verificadas.
    """
    token = (token or "").strip()
    if not token:
        raise ErroVerificacao(MENSAGEM_TOKEN_INVALIDO)

    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.verificacao_token_hash == hash_token(token))
        .first()
    )

    if cliente is None:
        raise ErroVerificacao(MENSAGEM_TOKEN_INVALIDO)

    # Conta já confirmada anteriormente: nada a fazer, resposta amigável.
    if cliente.email_verificado:
        _limpar_token(cliente)
        db.add(cliente)
        db.commit()
        return cliente

    expira_em = cliente.verificacao_expira_em
    if expira_em is None or expira_em < utcnow():
        _limpar_token(cliente)
        db.add(cliente)
        db.commit()
        raise ErroVerificacao(MENSAGEM_TOKEN_EXPIRADO)

    cliente.email_verificado = True
    _limpar_token(cliente)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    logger.info("E-mail verificado com sucesso: %s", cliente.email)
    return cliente


# ---------------------------------------------------------------------------
# Reenvio
# ---------------------------------------------------------------------------


def solicitar_reenvio(db: Session, email: str) -> bool:
    """
    Reenvia o e-mail de verificação, respeitando o intervalo mínimo entre envios.

    Retorna `True` quando um novo e-mail foi efetivamente despachado.

    Por segurança, **não revela** se o e-mail está cadastrado: a rota responde
    202 independentemente do resultado. Contas inexistentes e contas já
    verificadas são simplesmente ignoradas.
    """
    email_normalizado = (email or "").strip().lower()
    if not email_normalizado:
        return False

    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.email == email_normalizado)
        .first()
    )

    if cliente is None or cliente.email_verificado:
        return False

    # Intervalo mínimo entre reenvios (anti-spam). Em vez de responder 429 — o
    # que permitiria enumerar e-mails cadastrados — simplesmente não reenviamos.
    enviado_em = cliente.verificacao_enviada_em
    if enviado_em is not None:
        decorrido = (utcnow() - enviado_em).total_seconds()
        if decorrido < intervalo_reenvio_segundos():
            logger.info(
                "Reenvio ignorado para %s: intervalo mínimo de %ss ainda não decorrido.",
                cliente.email,
                intervalo_reenvio_segundos(),
            )
            return False

    enviado, _ = iniciar_verificacao(db, cliente)
    return enviado
