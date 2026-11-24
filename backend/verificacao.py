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
- O token é de **uso único**: só consegue efetivar a confirmação uma vez. Depois
  disso ele se torna um no-op idempotente (ver `confirmar_verificacao`) e é
  descartado na primeira tentativa após expirar.
- O token expira (padrão: 24 h, configurável por `EMAIL_VERIFICACAO_EXPIRA_HORAS`).
- O reenvio respeita um intervalo mínimo (padrão: 60 s), evitando spam de e-mails.

O envio de e-mail é preparado aqui e despachado pelas rotas, normalmente como
`BackgroundTask` — por isso `EmailPendente` carrega apenas dados primitivos e
nenhuma sessão de banco (a sessão da requisição já foi fechada quando a tarefa
de fundo executa).
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import NamedTuple, Optional, Tuple, Union

from sqlalchemy.orm import Session

import email_service
import models
from security import gerar_token_verificacao, hash_token

ContaVerificavel = Union[models.Cliente, models.Professional]

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
MENSAGEM_CONFIRMADO = "E-mail confirmado com sucesso! Sua conta está pronta para uso."
MENSAGEM_JA_VERIFICADO = (
    "Este e-mail já estava confirmado — sua conta segue ativa, nada a fazer."
)
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


class EmailPendente(NamedTuple):
    """
    Dados necessários para despachar um e-mail de verificação.

    Contém apenas valores primitivos de propósito: pode ser entregue a uma
    `BackgroundTask` do FastAPI sem segurar a sessão de banco da requisição.
    """

    destinatario: str
    nome: str
    token: str
    expira_horas: int


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


def _nome_da_conta(conta: ContaVerificavel) -> str:
    """Extrai o nome de exibição tanto de `Cliente` (`nome`) quanto de `Professional` (`name`)."""
    return getattr(conta, "nome", None) or getattr(conta, "name", "")


def preparar_verificacao(db: Session, conta: ContaVerificavel) -> EmailPendente:
    """
    Gera um token novo, persiste o estado (em `Cliente` ou `Professional`) e devolve os dados do e-mail.

    O token em claro existe apenas em memória: o banco recebe somente o hash.
    Um novo token sempre substitui o anterior, invalidando links antigos.
    """
    token = gerar_token_verificacao()
    agora = utcnow()
    horas = expiracao_horas()

    conta.verificacao_token_hash = hash_token(token)
    conta.verificacao_expira_em = agora + timedelta(hours=horas)
    conta.verificacao_enviada_em = agora

    db.add(conta)
    db.commit()
    db.refresh(conta)

    return EmailPendente(
        destinatario=conta.email,
        nome=_nome_da_conta(conta),
        token=token,
        expira_horas=horas,
    )


def enviar_email_de_verificacao(pendente: EmailPendente) -> bool:
    """
    Despacha o e-mail de verificação, absorvendo falhas de transporte.

    Pensada para rodar como `BackgroundTask`: nunca propaga exceção, apenas
    registra o erro no log. Uma falha de SMTP **não** invalida o cadastro — o
    token já está persistido e o usuário pode pedir um novo link. Perder um
    cadastro por indisponibilidade do provedor de e-mail seria pior do que
    exigir um reenvio.

    Retorna `True` quando a mensagem foi efetivamente entregue ao transporte.
    """
    destinatario_mascarado = email_service.mascarar_email(pendente.destinatario)
    try:
        email_service.enviar_email_verificacao(
            destinatario=pendente.destinatario,
            nome=pendente.nome,
            token=pendente.token,
            expira_horas=pendente.expira_horas,
        )
    except email_service.ErroEnvioEmail as erro:
        logger.error(
            "Não foi possível enviar o e-mail de verificação para %s: %s",
            destinatario_mascarado,
            erro,
        )
        return False
    except Exception as erro:
        logger.exception(
            "Erro inesperado ao despachar e-mail de verificação para %s: %s",
            destinatario_mascarado,
            erro,
        )
        return False
    return True


def iniciar_verificacao(
    db: Session, cliente: models.Cliente
) -> Tuple[bool, str]:
    """
    Conveniência síncrona: emite o token e envia o e-mail na mesma chamada.

    Usada em scripts, testes e em qualquer contexto que não seja uma rota HTTP
    (nas rotas o envio é delegado a uma `BackgroundTask`).
    """
    pendente = preparar_verificacao(db, cliente)
    return enviar_email_de_verificacao(pendente), pendente.token


# ---------------------------------------------------------------------------
# Confirmação do token
# ---------------------------------------------------------------------------


def _limpar_token(conta: ContaVerificavel) -> None:
    """Remove o token de verificação da entidade (torna o link inutilizável)."""
    conta.verificacao_token_hash = None
    conta.verificacao_expira_em = None


def _buscar_conta_por_token_hash(db: Session, token_hash_val: str) -> Optional[ContaVerificavel]:
    """Localiza `Cliente` ou `Professional` pelo hash SHA-256 do token de verificação."""
    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.verificacao_token_hash == token_hash_val)
        .first()
    )
    if cliente is not None:
        return cliente
    return (
        db.query(models.Professional)
        .filter(models.Professional.verificacao_token_hash == token_hash_val)
        .first()
    )


def _sincronizar_email_verificado_user(db: Session, email: str) -> None:
    """Reflete `email_verificado=True` na tabela central `users` caso o registro já exista."""
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is not None and not user.email_verificado:
        user.email_verificado = True
        db.add(user)


def confirmar_verificacao(db: Session, token: str) -> Tuple[ContaVerificavel, bool]:
    """
    Confirma o e-mail do cliente ou profissional a partir de um token.

    Retorna a tupla `(conta, ja_estava_verificado)`.

    Levanta `ErroVerificacao` quando o token não existe ou expirou.

    **Idempotência:** o token deixa de efetivar a confirmação após o primeiro
    sucesso — a partir daí ele é um no-op que devolve a mesma resposta amigável.
    Isso cobre o usuário que dá F5 na página ou clica duas vezes no link do
    e-mail, situações em que responder "link inválido" seria enganoso. O hash é
    mantido apenas como registro de reacesso e é descartado na primeira
    tentativa após expirar (limpeza preguiçosa), de modo que o token não
    permanece utilizável indefinidamente.
    """
    token = (token or "").strip()
    if not token:
        raise ErroVerificacao(MENSAGEM_TOKEN_INVALIDO)

    conta = _buscar_conta_por_token_hash(db, hash_token(token))

    if conta is None:
        raise ErroVerificacao(MENSAGEM_TOKEN_INVALIDO)

    expira_em = conta.verificacao_expira_em
    expirado = expira_em is None or expira_em < utcnow()

    # Reacesso idempotente: F5, clique repetido ou e-mail reaberto.
    if conta.email_verificado:
        if expirado:
            _limpar_token(conta)
            db.add(conta)
            db.commit()
        return conta, True

    if expirado:
        _limpar_token(conta)
        db.add(conta)
        db.commit()
        raise ErroVerificacao(MENSAGEM_TOKEN_EXPIRADO)

    conta.email_verificado = True
    db.add(conta)
    _sincronizar_email_verificado_user(db, conta.email)
    db.commit()
    db.refresh(conta)

    logger.info("E-mail verificado com sucesso: %s", conta.email)
    return conta, False


# ---------------------------------------------------------------------------
# Reenvio
# ---------------------------------------------------------------------------


def solicitar_reenvio(db: Session, email: str) -> Optional[EmailPendente]:
    """
    Prepara um novo e-mail de verificação (para `Cliente` ou `Professional`),
    respeitando o intervalo mínimo.

    Retorna o `EmailPendente` quando um novo e-mail deve ser despachado, ou
    `None` quando nada deve sair. A rota é quem efetivamente envia (em
    background) e quem responde, sempre com 202 genérico.

    Por segurança, **não revela** se o e-mail está cadastrado: contas
    inexistentes e contas já verificadas resultam em `None`.
    """
    email_normalizado = (email or "").strip().lower()
    if not email_normalizado:
        return None

    conta: Optional[ContaVerificavel] = (
        db.query(models.Cliente)
        .filter(models.Cliente.email == email_normalizado)
        .first()
    )
    if conta is None:
        conta = (
            db.query(models.Professional)
            .filter(models.Professional.email == email_normalizado)
            .first()
        )

    if conta is None or conta.email_verificado:
        return None

    # Intervalo mínimo entre reenvios (anti-spam). Em vez de responder 429 — o
    # que permitiria enumerar e-mails cadastrados — simplesmente não reenviamos.
    enviado_em = conta.verificacao_enviada_em
    if enviado_em is not None:
        decorrido = (utcnow() - enviado_em).total_seconds()
        if decorrido < intervalo_reenvio_segundos():
            logger.info(
                "Reenvio ignorado para %s: intervalo mínimo de %ss ainda não decorrido.",
                conta.email,
                intervalo_reenvio_segundos(),
            )
            return None

    return preparar_verificacao(db, conta)
