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
from typing import List, Optional

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


def montar_mensagem_solicitacao_orcamento(
    destinatario: str,
    profissional_nome: str,
    cliente_nome: str,
    cliente_email: str,
    cliente_telefone: Optional[str],
    categoria: str,
    mensagem_cliente: str,
    cliente_cidade: Optional[str] = None,
) -> EmailMessage:
    """Compõe a notificação transacional avisando o profissional sobre uma solicitação de orçamento."""
    nome_remetente, endereco_remetente = email_service.remetente()

    telefone_str = cliente_telefone or "Não informado"
    cidade_str = cliente_cidade or "Não informada"

    mensagem = EmailMessage()
    mensagem["Subject"] = f"RentalSpouse: Nova solicitação de orçamento de {cliente_nome}"
    mensagem["From"] = formataddr((nome_remetente, endereco_remetente))
    mensagem["To"] = destinatario
    mensagem["Reply-To"] = cliente_email

    texto = (
        f"Olá, {profissional_nome}!\n\n"
        f"Você recebeu uma nova solicitação de orçamento na plataforma RentalSpouse.\n\n"
        f"--- Detalhes do Cliente ---\n"
        f"Nome: {cliente_nome}\n"
        f"E-mail: {cliente_email}\n"
        f"Telefone: {telefone_str}\n"
        f"Cidade: {cidade_str}\n"
        f"Categoria do Serviço: {categoria}\n\n"
        f"--- Mensagem do Cliente ---\n"
        f"{mensagem_cliente}\n\n"
        "Para responder ao cliente, você pode responder diretamente a este e-mail "
        f"ou entrar em contato via telefone ({telefone_str}).\n\n"
        "Equipe RentalSpouse"
    )

    mensagem.set_content(texto)
    return mensagem


def notificar_profissional_solicitacao_orcamento(
    profissional: models.Professional,
    cliente_nome: str,
    cliente_email: str,
    cliente_telefone: Optional[str],
    categoria: str,
    mensagem: str,
    cliente_cidade: Optional[str] = None,
) -> bool:
    """
    Envia a notificação transacional para o profissional sobre um novo contato.
    Nunca levanta exceção para não quebrar a API em caso de instabilidade no envio.
    """
    try:
        transporte = email_service.obter_transporte()
    except email_service.ErroEnvioEmail as erro:
        logger.warning(
            "Não foi possível obter transporte de e-mail para avisar o profissional %s: %s",
            profissional.email,
            erro,
        )
        return False

    msg = montar_mensagem_solicitacao_orcamento(
        destinatario=profissional.email,
        profissional_nome=profissional.name,
        cliente_nome=cliente_nome,
        cliente_email=cliente_email,
        cliente_telefone=cliente_telefone,
        categoria=categoria,
        mensagem_cliente=mensagem,
        cliente_cidade=cliente_cidade,
    )

    try:
        transporte.enviar(msg)
        logger.info(
            "Notificação de solicitação de orçamento enviada com sucesso para o profissional %s.",
            profissional.email,
        )
        return True
    except email_service.ErroEnvioEmail as erro:
        logger.warning(
            "Falha ao enviar notificação de orçamento para o profissional %s: %s",
            profissional.email,
            erro,
        )
        return False

