"""
Regras de negócio do fluxo "Esqueci minha senha" (issue #75).

O fluxo é deliberadamente genérico para não revelar se um e-mail está
cadastrado:

    solicitação  ->  localiza a conta  ->  emite token  ->  envia link
                                                              |
                                                     usuário define nova senha
                                                              |
                                                 token é consumido (uso único)

Garantias de segurança:
- O token em claro existe apenas em memória; o banco guarda somente o hash
  SHA-256 (mesmo padrão da verificação de e-mail).
- O link expira (padrão: 60 min, configurável por `SENHA_RESET_EXPIRA_MINUTOS`).
- Cada solicitação invalida os links anteriores ainda ativos.
- Um intervalo mínimo entre solicitações evita abuso de envio de e-mails.
- A resposta HTTP é idêntica para e-mails cadastrados ou não.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import NamedTuple, Optional, Tuple

from sqlalchemy.orm import Session

import email_service
import models
from security import gerar_token_verificacao, hash_senha, hash_token

logger = logging.getLogger("rentalspouse.recuperacao_senha")

EXPIRACAO_PADRAO_MINUTOS = 60
INTERVALO_REENVIO_PADRAO_SEGUNDOS = 60

MENSAGEM_SOLICITACAO = (
    "Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha."
)
MENSAGEM_TOKEN_INVALIDO = (
    "Link de redefinição inválido ou já utilizado. Solicite um novo link."
)
MENSAGEM_TOKEN_EXPIRADO = (
    "Este link de redefinição expirou. Solicite um novo link."
)
MENSAGEM_SENHA_REDEFINIDA = (
    "Senha redefinida com sucesso! Você já pode entrar com a nova senha."
)


class ErroRecuperacaoSenha(Exception):
    """Erro de negócio do fluxo de recuperação, traduzido para HTTP pela rota."""

    def __init__(self, mensagem: str, status_code: int = 400) -> None:
        self.mensagem = mensagem
        self.status_code = status_code
        super().__init__(mensagem)


class EmailPendente(NamedTuple):
    """Dados primitivos necessários para despachar o e-mail em background."""

    destinatario: str
    nome: str
    token: str
    expira_minutos: int


def _inteiro_de_ambiente(nome: str, padrao: int) -> int:
    """Lê um inteiro positivo de variável de ambiente, com fallback seguro."""
    bruto = os.getenv(nome, "").strip()
    try:
        valor = int(bruto)
    except (TypeError, ValueError):
        return padrao
    return valor if valor > 0 else padrao


def expiracao_minutos() -> int:
    """Validade do token de redefinição, em minutos."""
    return _inteiro_de_ambiente("SENHA_RESET_EXPIRA_MINUTOS", EXPIRACAO_PADRAO_MINUTOS)


def intervalo_reenvio_segundos() -> int:
    """Intervalo mínimo entre duas solicitações consecutivas, em segundos."""
    return _inteiro_de_ambiente(
        "SENHA_RESET_REENVIO_SEGUNDOS", INTERVALO_REENVIO_PADRAO_SEGUNDOS
    )


def utcnow() -> datetime:
    """Retorna o instante atual em UTC sem tzinfo, compatível com as colunas do banco."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _localizar_conta(db: Session, email: str) -> Optional[Tuple[str, bool]]:
    """
    Localiza a conta pelo e-mail, priorizando a tabela unificada `users`.

    Retorna `(nome, ativo)` ou `None`. Contas desativadas não recebem o link,
    mas a resposta pública continua genérica.
    """
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is not None:
        return user.name, bool(user.is_active)

    cliente = db.query(models.Cliente).filter(models.Cliente.email == email).first()
    if cliente is not None:
        return cliente.nome, True

    profissional = (
        db.query(models.Professional)
        .filter(models.Professional.email == email)
        .first()
    )
    if profissional is not None:
        return profissional.name, bool(profissional.is_active)

    return None


def solicitar_recuperacao(db: Session, email: str) -> Optional[EmailPendente]:
    """
    Prepara um novo link de redefinição, respeitando o intervalo mínimo.

    Retorna o `EmailPendente` quando um e-mail deve ser despachado ou `None`
    quando a conta não existe, está inativa ou ainda está em cooldown.
    """
    email_normalizado = (email or "").strip().lower()
    if not email_normalizado:
        return None

    conta = _localizar_conta(db, email_normalizado)
    if conta is None or not conta[1]:
        return None

    ultimo = (
        db.query(models.RecuperacaoSenhaToken)
        .filter(models.RecuperacaoSenhaToken.email == email_normalizado)
        .order_by(models.RecuperacaoSenhaToken.id.desc())
        .first()
    )
    agora = utcnow()
    if ultimo is not None and ultimo.criado_em is not None:
        decorrido = (agora - ultimo.criado_em).total_seconds()
        if decorrido < intervalo_reenvio_segundos():
            logger.info(
                "Solicitação de redefinição ignorada para %s: cooldown de %ss ainda ativo.",
                email_service.mascarar_email(email_normalizado),
                intervalo_reenvio_segundos(),
            )
            return None

    # Invalida links anteriores antes de emitir o novo token.
    db.query(models.RecuperacaoSenhaToken).filter(
        models.RecuperacaoSenhaToken.email == email_normalizado,
        models.RecuperacaoSenhaToken.usado_em.is_(None),
    ).update(
        {models.RecuperacaoSenhaToken.usado_em: agora},
        synchronize_session=False,
    )

    token = gerar_token_verificacao()
    minutos = expiracao_minutos()
    registro = models.RecuperacaoSenhaToken(
        email=email_normalizado,
        token_hash=hash_token(token),
        expira_em=agora + timedelta(minutes=minutos),
        criado_em=agora,
    )
    db.add(registro)
    db.commit()

    return EmailPendente(
        destinatario=email_normalizado,
        nome=conta[0],
        token=token,
        expira_minutos=minutos,
    )


def enviar_email_de_redefinicao(pendente: EmailPendente) -> bool:
    """
    Despacha o e-mail de redefinição absorvendo falhas de transporte.

    Pensada para rodar como `BackgroundTask`: uma indisponibilidade de SMTP não
    pode derrubar a requisição nem invalidar o token já persistido.
    """
    try:
        email_service.enviar_email_redefinicao(
            destinatario=pendente.destinatario,
            nome=pendente.nome,
            token=pendente.token,
            expira_minutos=pendente.expira_minutos,
        )
    except email_service.ErroEnvioEmail as erro:
        logger.error(
            "Não foi possível enviar o e-mail de redefinição para %s: %s",
            email_service.mascarar_email(pendente.destinatario),
            erro,
        )
        return False
    return True


def _obter_registro_valido(db: Session, token: str) -> models.RecuperacaoSenhaToken:
    """Busca o registro do token e valida uso único e expiração."""
    token_limpo = (token or "").strip()
    if not token_limpo:
        raise ErroRecuperacaoSenha(MENSAGEM_TOKEN_INVALIDO)

    registro = (
        db.query(models.RecuperacaoSenhaToken)
        .filter(models.RecuperacaoSenhaToken.token_hash == hash_token(token_limpo))
        .first()
    )
    if registro is None or registro.usado_em is not None:
        raise ErroRecuperacaoSenha(MENSAGEM_TOKEN_INVALIDO)

    agora = utcnow()
    if registro.expira_em is None or registro.expira_em < agora:
        registro.usado_em = agora
        db.add(registro)
        db.commit()
        raise ErroRecuperacaoSenha(MENSAGEM_TOKEN_EXPIRADO)

    return registro


def redefinir_senha(db: Session, token: str, nova_senha: str) -> str:
    """
    Consome o token e aplica a nova senha em todas as tabelas que contêm a conta.

    Retorna o e-mail cuja senha foi alterada. Levanta `ErroRecuperacaoSenha`
    quando o link é inválido, expirado ou já foi utilizado.
    """
    registro = _obter_registro_valido(db, token)
    novo_hash = hash_senha(nova_senha)
    agora = utcnow()
    atualizados = 0

    user = db.query(models.User).filter(models.User.email == registro.email).first()
    if user is not None:
        user.hashed_password = novo_hash
        atualizados += 1

    cliente = (
        db.query(models.Cliente).filter(models.Cliente.email == registro.email).first()
    )
    if cliente is not None:
        cliente.senha_hash = novo_hash
        atualizados += 1

    profissional = (
        db.query(models.Professional)
        .filter(models.Professional.email == registro.email)
        .first()
    )
    if profissional is not None:
        profissional.senha_hash = novo_hash
        atualizados += 1

    if atualizados == 0:
        registro.usado_em = agora
        db.add(registro)
        db.commit()
        raise ErroRecuperacaoSenha(MENSAGEM_TOKEN_INVALIDO)

    registro.usado_em = agora
    db.add(registro)
    db.query(models.RecuperacaoSenhaToken).filter(
        models.RecuperacaoSenhaToken.email == registro.email,
        models.RecuperacaoSenhaToken.id != registro.id,
        models.RecuperacaoSenhaToken.usado_em.is_(None),
    ).update(
        {models.RecuperacaoSenhaToken.usado_em: agora},
        synchronize_session=False,
    )
    db.commit()

    logger.info(
        "Senha redefinida com sucesso para %s",
        email_service.mascarar_email(registro.email),
    )
    return registro.email
