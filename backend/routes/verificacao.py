"""
Rotas HTTP do fluxo de verificação de e-mail.

Este router expõe apenas a interface HTTP: valida o payload com Pydantic,
delega para a camada de negócio (`verificacao.py`) e traduz o resultado em
respostas da API.

O token trafega no **corpo** da requisição (e não como query string) porque a
página do frontend lê o parâmetro do link recebido por e-mail e o submete via
POST — assim o token não fica registrado nos logs de acesso do servidor.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import schemas
import verificacao

router = APIRouter(prefix="/api/verificacao", tags=["Verificação de E-mail"])


@router.post(
    "/confirmar",
    response_model=schemas.VerificacaoConfirmadaResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirmar endereço de e-mail",
    description=(
        "Consome o token de verificação de uso único recebido por e-mail e marca "
        "a conta como verificada. Retorna 400 quando o token é inválido, já foi "
        "utilizado ou expirou."
    ),
)
def confirmar_email(
    payload: schemas.ConfirmarVerificacaoRequest,
    db: Session = Depends(get_db),
):
    """Confirma o e-mail do cliente a partir do token recebido por e-mail."""
    try:
        cliente, ja_estava_verificado = verificacao.confirmar_verificacao(
            db, payload.token
        )
    except verificacao.ErroVerificacao as erro:
        raise HTTPException(status_code=erro.status_code, detail=erro.mensagem)

    return schemas.VerificacaoConfirmadaResponse(
        email=cliente.email,
        email_verificado=cliente.email_verificado,
        mensagem=(
            verificacao.MENSAGEM_JA_VERIFICADO
            if ja_estava_verificado
            else verificacao.MENSAGEM_CONFIRMADO
        ),
    )


@router.post(
    "/reenviar",
    response_model=schemas.MensagemResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Reenviar e-mail de verificação",
    description=(
        "Dispara um novo e-mail de verificação, respeitando um intervalo mínimo "
        "entre envios. A resposta é idêntica para e-mails cadastrados ou não, "
        "evitando a enumeração de contas."
    ),
)
def reenviar_email(
    payload: schemas.ReenviarVerificacaoRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Reenvia o e-mail de verificação.

    Responde 202 Accepted independentemente de o e-mail existir na base: a
    resposta não deve revelar se um endereço está cadastrado. O envio é
    delegado a uma `BackgroundTask` para não segurar a resposta.
    """
    pendente = verificacao.solicitar_reenvio(db, payload.email)

    if pendente is not None:
        background_tasks.add_task(verificacao.enviar_email_de_verificacao, pendente)

    return schemas.MensagemResponse(mensagem=verificacao.MENSAGEM_REENVIO_SOLICITADO)
