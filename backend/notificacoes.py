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
ASSUNTO_DOCUMENTOS_APROVADOS = "RentalSpouse: seu cadastro e documentos foram aprovados!"
ASSUNTO_DOCUMENTOS_REJEITADOS = "RentalSpouse: pendência na validação dos seus documentos"


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


def montar_mensagem_documentos_aprovados(
    destinatario: str,
    profissional: models.Professional,
) -> EmailMessage:
    """Compõe o e-mail avisando ao profissional que seus documentos foram aprovados."""
    nome_remetente, endereco_remetente = email_service.remetente()

    mensagem = EmailMessage()
    mensagem["Subject"] = ASSUNTO_DOCUMENTOS_APROVADOS
    mensagem["From"] = formataddr((nome_remetente, endereco_remetente))
    mensagem["To"] = destinatario
    mensagem.set_content(
        f"Olá, {profissional.name}!\n\n"
        "Temos uma ótima notícia: os seus documentos foram analisados e o seu cadastro foi APROVADO pela equipe da RentalSpouse!\n\n"
        "O seu perfil já está ativo e visível na vitrine de busca para contratação por novos clientes.\n\n"
        "Acesse a plataforma para acompanhar as solicitações de orçamento e gerenciar sua agenda.\n\n"
        "Equipe RentalSpouse"
    )
    return mensagem


def notificar_profissional_aprovado(profissional: models.Professional) -> bool:
    """
    Envia e-mail ao profissional informando que seu perfil foi aprovado.

    Retorna True se o e-mail foi enviado com sucesso, ou False caso contrário.
    Nunca levanta exceção.
    """
    try:
        transporte = email_service.obter_transporte()
    except email_service.ErroEnvioEmail as erro:
        logger.warning(
            "Não foi possível preparar o transporte de e-mail para avisar aprovação ao profissional %s: %s",
            profissional.email,
            erro,
        )
        return False

    mensagem = montar_mensagem_documentos_aprovados(profissional.email, profissional)
    try:
        transporte.enviar(mensagem)
        logger.info("E-mail de aprovação enviado com sucesso ao profissional %s.", profissional.email)
        return True
    except email_service.ErroEnvioEmail as erro:
        logger.warning(
            "Falha ao enviar e-mail de aprovação para o profissional %s: %s",
            profissional.email,
            erro,
        )
        return False


def montar_mensagem_documentos_rejeitados(
    destinatario: str,
    profissional: models.Professional,
    motivo: str,
) -> EmailMessage:
    """Compõe o e-mail avisando ao profissional sobre a reprovação/pendência de documentos com o motivo."""
    nome_remetente, endereco_remetente = email_service.remetente()

    mensagem = EmailMessage()
    mensagem["Subject"] = ASSUNTO_DOCUMENTOS_REJEITADOS
    mensagem["From"] = formataddr((nome_remetente, endereco_remetente))
    mensagem["To"] = destinatario
    mensagem.set_content(
        f"Olá, {profissional.name}.\n\n"
        "A equipe administrativa revisou os documentos enviados para o seu cadastro na RentalSpouse e identificou pendências que impedem a aprovação imediata.\n\n"
        f"Motivo informado pelo administrador:\n{motivo}\n\n"
        "Você pode acessar sua conta, ajustar ou reenviar a documentação necessária diretamente pela tela de documentos do profissional.\n\n"
        "Assim que reenviar, seus documentos serão analisados com prioridade pela nossa equipe.\n\n"
        "Equipe RentalSpouse"
    )
    return mensagem


def notificar_profissional_rejeitado(
    profissional: models.Professional,
    motivo: str,
) -> bool:
    """
    Envia e-mail ao profissional com a justificativa de reprovação de seus documentos.

    Retorna True se o e-mail foi enviado com sucesso, ou False caso contrário.
    Nunca levanta exceção.
    """
    try:
        transporte = email_service.obter_transporte()
    except email_service.ErroEnvioEmail as erro:
        logger.warning(
            "Não foi possível preparar o transporte de e-mail para avisar reprovação ao profissional %s: %s",
            profissional.email,
            erro,
        )
        return False

    mensagem = montar_mensagem_documentos_rejeitados(profissional.email, profissional, motivo)
    try:
        transporte.enviar(mensagem)
        logger.info("E-mail de rejeição de documentos enviado ao profissional %s.", profissional.email)
        return True
    except email_service.ErroEnvioEmail as erro:
        logger.warning(
            "Falha ao enviar e-mail de reprovação para o profissional %s: %s",
            profissional.email,
            erro,
        )
        return False

