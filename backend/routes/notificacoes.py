"""
Rotas de Notificações Persistidas e WebSocket em Tempo Real (Issue #34).

Permite aos usuários consultar notificações no banco e receber eventos
instantâneos via WebSocket quando novos orçamentos ou respostas são gerados.
"""

import asyncio
import logging
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.orm import Session

from database import get_db
import email_service
import models
from schemas import NotificacaoRead
from security import decode_access_token, get_current_user
from websocket_manager import ws_manager

logger = logging.getLogger("rentalspouse.notificacoes")

router = APIRouter(prefix="/api/notificacoes", tags=["Notificações"])
ws_router = APIRouter(tags=["WebSocket"])


# ---------------------------------------------------------------------------
# Funções Auxiliares de Disparo
# ---------------------------------------------------------------------------


def registrar_e_enviar_notificacao(
    db: Session,
    user_email: str,
    titulo: str,
    mensagem: str,
    tipo: str,
    referencia_id: Optional[int] = None,
    payload_extra: Optional[dict] = None,
) -> models.Notificacao:
    """
    Persiste a notificação na tabela 'notificacoes' e dispara evento em tempo
    real via WebSocket para o usuário se houver conexão ativa.
    """
    notificacao = models.Notificacao(
        user_email=user_email.strip().lower(),
        titulo=titulo,
        mensagem=mensagem,
        tipo=tipo,
        referencia_id=referencia_id,
        lida=False,
    )
    db.add(notificacao)
    db.commit()
    db.refresh(notificacao)

    # Prepara payload em tempo real
    ws_payload = {
        "evento": tipo,
        "notificacao_id": notificacao.id,
        "titulo": notificacao.titulo,
        "mensagem": notificacao.mensagem,
        "tipo": notificacao.tipo,
        "referencia_id": notificacao.referencia_id,
        "criada_em": notificacao.criada_em.isoformat(),
    }
    if payload_extra:
        ws_payload.update(payload_extra)

    # Envia via WebSocket em background se houver loop assíncrono
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(ws_manager.send_personal_message(ws_payload, user_email))
    except RuntimeError:
        # Se chamado fora de contexto assíncrono (ex: thread síncrona), executa via asyncio.run
        try:
            asyncio.run(ws_manager.send_personal_message(ws_payload, user_email))
        except Exception as e:
            logger.warning("Não foi possível enviar mensagem WebSocket síncrona: %s", e)

    return notificacao


def enviar_email_alerta_orcamento(
    destinatario_email: str,
    destinatario_nome: str,
    titulo: str,
    descricao: str,
    orcamento_id: int,
) -> bool:
    """
    Envia e-mail de alerta transacional ao destinatário sobre a solicitação.
    Nunca levanta exceção para não quebrar a transação de negócio principal.
    """
    try:
        transporte = email_service.obter_transporte()
        nome_remetente, endereco_remetente = email_service.remetente()

        msg = email_service.EmailMessage()
        msg["Subject"] = f"RentalSpouse: {titulo}"
        msg["From"] = f"{nome_remetente} <{endereco_remetente}>"
        msg["To"] = destinatario_email
        msg["Auto-Submitted"] = "auto-generated"

        corpo_texto = (
            f"Olá, {destinatario_nome}!\n\n"
            f"{titulo}\n\n"
            f"Detalhes do pedido (Orçamento #{orcamento_id}):\n"
            f"\"{descricao}\"\n\n"
            "Acesse a plataforma RentalSpouse para visualizar o pedido completo e enviar sua estimativa:\n"
            f"{email_service.app_base_url()}/profissionais\n\n"
            "Atenciosamente,\nEquipe RentalSpouse"
        )
        msg.set_content(corpo_texto)

        transporte.enviar(msg)
        logger.info("E-mail de notificação de orçamento despachado para %s", email_service.mascarar_email(destinatario_email))
        return True
    except Exception as exc:
        logger.warning("Falha ao enviar e-mail de notificação para %s: %s", email_service.mascarar_email(destinatario_email), exc)
        return False


# ---------------------------------------------------------------------------
# Endpoints RESTful
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=List[NotificacaoRead],
    summary="Listar notificações do usuário",
    description="Retorna o histórico de notificações persistidas para o usuário autenticado.",
)
def listar_notificacoes(
    nao_lidas: bool = Query(False, description="Filtrar apenas notificações pendentes de leitura"),
    limit: int = Query(50, ge=1, le=100, description="Limite máximo de registros"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Notificacao)
        .filter(models.Notificacao.user_email == current_user.email.strip().lower())
    )
    if nao_lidas:
        query = query.filter(models.Notificacao.lida.is_(False))

    return query.order_by(models.Notificacao.criada_em.desc()).limit(limit).all()


@router.patch(
    "/{notificacao_id}/lida",
    response_model=NotificacaoRead,
    summary="Marcar notificação como lida",
    description="Atualiza a flag 'lida' para True na notificação informada.",
)
def marcar_como_lida(
    notificacao_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notificacao = (
        db.query(models.Notificacao)
        .filter(
            models.Notificacao.id == notificacao_id,
            models.Notificacao.user_email == current_user.email.strip().lower(),
        )
        .first()
    )
    if not notificacao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificação não encontrada.",
        )

    notificacao.lida = True
    db.commit()
    db.refresh(notificacao)
    return notificacao


@router.patch(
    "/marcar-todas-lidas",
    summary="Marcar todas as notificações como lidas",
    description="Atualiza todas as notificações pendentes do usuário para lidas.",
)
def marcar_todas_como_lidas(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    atualizados = (
        db.query(models.Notificacao)
        .filter(
            models.Notificacao.user_email == current_user.email.strip().lower(),
            models.Notificacao.lida.is_(False),
        )
        .update({"lida": True})
    )
    db.commit()
    return {"mensagem": "Todas as notificações foram marcadas como lidas.", "total": atualizados}


# ---------------------------------------------------------------------------
# Endpoint WebSocket em Tempo Real (Issue #34)
# ---------------------------------------------------------------------------


async def _handle_websocket_connection(websocket: WebSocket, token: Optional[str]):
    if not token or not token.strip():
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_access_token(token.strip())
        email = payload.get("sub")
        if not email:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect(email, websocket)
    try:
        # Envia confirmação de boas-vindas
        await websocket.send_json({"evento": "conectado", "mensagem": "Conexão em tempo real estabelecida."})
        while True:
            data = await websocket.receive_text()
            if data.strip() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(email, websocket)
    except Exception as exc:
        logger.warning("Exceção na sessão WebSocket para '%s': %s", email, exc)
        ws_manager.disconnect(email, websocket)


@router.websocket("/ws")
async def websocket_notificacoes_rota(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """Endpoint WebSocket sob o prefixo /api/notificacoes/ws."""
    await _handle_websocket_connection(websocket, token)


@ws_router.websocket("/api/ws/notificacoes")
@ws_router.websocket("/ws/notificacoes")
async def websocket_notificacoes_alias(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """Alias WebSocket para compatibilidade de rotas (/ws/notificacoes e /api/ws/notificacoes)."""
    await _handle_websocket_connection(websocket, token)
