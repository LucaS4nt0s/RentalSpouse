"""
Notificações por e-mail aos administradores (issue #55).

Responsabilidade única: avisar os administradores **ativos** sobre eventos que
exigem análise manual — hoje, o envio de documentos de um profissional.

Regra de resiliência: nenhuma função deste módulo levanta exceção. Uma falha
de e-mail (transporte mal configurado, SMTP fora do ar etc.) é apenas
registrada no log e o fluxo de negócio que disparou a notificação segue
normalmente — o envio de documentos nunca deve quebrar por causa de e-mail.
"""

import logging
from email.message import EmailMessage
from email.utils import formataddr
from typing import List

from sqlalchemy.orm import Session

import email_service
import models

logger = logging.getLogger("rentalspouse.notificacoes")

# Assunto fixo exigido pela issue #55: nome/e-mail do profissional vão apenas no corpo.
ASSUNTO_DOCUMENTOS_ENVIADOS = "RentalSpouse: novo envio de documentos para análise"


def _administradores_ativos(db: Session) -> List[models.User]:
    """Retorna todos os usuários com papel de administrador e conta ativa."""
    return (
        db.query(models.User)
        .filter(
            models.User.role == models.UserRole.ADMIN.value,
            models.User.is_active.is_(True),
        )
        .order_by(models.User.id.asc())
        .all()
    )


def montar_mensagem_documentos_enviados(
    destinatario: str,
    profissional: models.Professional,
) -> EmailMessage:
    """Compõe o e-mail (texto puro) avisando que `profissional` enviou documentos."""
    nome_remetente, endereco_remetente = email_service.remetente()

    mensagem = EmailMessage()
    mensagem["Subject"] = ASSUNTO_DOCUMENTOS_ENVIADOS
    mensagem["From"] = formataddr((nome_remetente, endereco_remetente))
    mensagem["To"] = destinatario
    mensagem.set_content(
        "Olá,\n\n"
        "Um profissional enviou documentos para análise na RentalSpouse.\n\n"
        f"Profissional: {profissional.name}\n"
        f"E-mail: {profissional.email}\n\n"
        "Acesse o painel administrativo para revisar o envio.\n\n"
        "Equipe RentalSpouse"
    )
    return mensagem


def notificar_admins_documentos_enviados(
    db: Session,
    profissional: models.Professional,
) -> int:
    """
    Envia um e-mail simples a cada administrador ativo.

    Devolve quantos e-mails foram efetivamente enviados. Nunca levanta
    exceção: falhas ao obter o transporte ou ao enviar para um destinatário
    são registradas em log e não interrompem o fluxo de negócio.
    """
    admins = _administradores_ativos(db)
    if not admins:
        logger.info(
            "Nenhum administrador ativo para notificar sobre documentos do profissional %s.",
            profissional.email,
        )
        return 0

    try:
        transporte = email_service.obter_transporte()
    except email_service.ErroEnvioEmail as erro:
        logger.warning(
            "Não foi possível preparar o transporte de e-mail para notificar os administradores: %s",
            erro,
        )
        return 0

    enviados = 0
    for admin in admins:
        mensagem = montar_mensagem_documentos_enviados(admin.email, profissional)
        try:
            transporte.enviar(mensagem)
        except email_service.ErroEnvioEmail as erro:
            logger.warning(
                "Falha ao notificar o administrador %s sobre documentos do profissional %s: %s",
                admin.email,
                profissional.email,
                erro,
            )
            continue
        enviados += 1

    logger.info(
        "Notificados %s administrador(es) sobre o envio de documentos do profissional %s.",
        enviados,
        profissional.email,
    )
    return enviados
