"""
Rotas de Pagamento In-App via PIX e Cartão de Crédito com Mercado Pago API (Issue #18).

Implementa:
- `POST /api/pagamentos` -> Cria transação PIX ou Cartão Tokenizado (Zero PAN/CVV no servidor);
- `POST /api/pagamentos/webhook` -> Recebe notificações do Mercado Pago com validação
  HMAC-SHA256 (`x-signature`), proteção Anti-Replay (`ts` <= 5 min) e consulta cruzada
  Server-to-Server (`GET /v1/payments/{id}`);
- `POST /api/pagamentos/{pagamento_id}/simular-aprovacao` -> Simulador dev/test restrito
  a `PAYMENT_PROVIDER=sandbox_mock`;
- `GET  /api/pagamentos/meus` -> Histórico paginado de pagamentos do cliente/profissional;
- `GET  /api/pagamentos/{pagamento_id}` -> Consulta detalhes e comprovante digital.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from client_access import get_current_cliente
from database import get_db
import models
import payment_gateway
from rate_limiter import check_payment_rate_limit
from routes.notificacoes import (
    enviar_email_alerta_orcamento,
    registrar_e_enviar_notificacao,
)
import schemas
from security import get_current_user

logger = logging.getLogger("rentalspouse.pagamentos")

router = APIRouter(prefix="/api/pagamentos", tags=["Pagamentos"])


def _parse_iso_datetime(valor: Optional[str]) -> Optional[datetime]:
    if not valor:
        return None
    try:
        limpo = valor.replace("Z", "+00:00")
        dt = datetime.fromisoformat(limpo)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _verificar_expiracao_pix(db: Session, pagamento: models.Pagamento) -> models.Pagamento:
    """Atualiza automaticamente para 'expirado' se for um PIX pendente cujo prazo venceu."""
    if (
        pagamento.status == models.PagamentoStatus.PENDENTE.value
        and pagamento.pix_expira_em is not None
    ):
        exp = (
            pagamento.pix_expira_em
            if pagamento.pix_expira_em.tzinfo
            else pagamento.pix_expira_em.replace(tzinfo=timezone.utc)
        )
        if datetime.now(timezone.utc) > exp:
            pagamento.status = models.PagamentoStatus.EXPIRADO.value
            db.commit()
            db.refresh(pagamento)
    return pagamento


def _notificar_pagamento_confirmado(
    db: Session,
    background_tasks: BackgroundTasks,
    pagamento: models.Pagamento,
    orcamento: models.Orcamento,
) -> None:
    """Dispara alerta em tempo real (WebSocket + persistência) e e-mail para profissional e cliente."""
    prof = (
        db.query(models.Professional)
        .filter(models.Professional.id == pagamento.professional_id)
        .first()
    )
    cli = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == pagamento.cliente_id)
        .first()
    )
    metodo_label = "PIX" if pagamento.metodo == models.PagamentoMetodo.PIX.value else "Cartão de Crédito"
    valor_fmt = f"R$ {pagamento.valor:.2f}"

    payload_ws = {
        "pagamento_id": pagamento.id,
        "orcamento_id": pagamento.orcamento_id,
        "valor": pagamento.valor,
        "metodo": pagamento.metodo,
        "status": pagamento.status,
        "gateway_txid": pagamento.gateway_txid,
        "external_reference": pagamento.external_reference,
    }

    if prof and prof.email:
        titulo_prof = f"Pagamento de {valor_fmt} confirmado via Mercado Pago!"
        msg_prof = (
            f"O pagamento do Orçamento #{orcamento.id} ({valor_fmt} via {metodo_label}) "
            f"foi aprovado (Transação MP #{pagamento.gateway_txid})."
        )
        registrar_e_enviar_notificacao(
            db=db,
            user_email=prof.email,
            titulo=titulo_prof,
            mensagem=msg_prof,
            tipo="pagamento_confirmado",
            referencia_id=pagamento.id,
            payload_extra=payload_ws,
        )
        background_tasks.add_task(
            enviar_email_alerta_orcamento,
            destinatario_email=prof.email,
            destinatario_nome=prof.name,
            titulo=titulo_prof,
            descricao=msg_prof,
            orcamento_id=orcamento.id,
        )

    email_cliente = (cli.email if cli else orcamento.cliente_email or "").strip().lower()
    nome_cliente = cli.nome if cli else orcamento.cliente_nome
    if email_cliente:
        titulo_cli = f"Comprovante: Pagamento de {valor_fmt} aprovado!"
        msg_cli = (
            f"Seu pagamento de {valor_fmt} via {metodo_label} para o Orçamento #{orcamento.id} "
            f"foi confirmado pelo Mercado Pago (ID #{pagamento.gateway_txid})."
        )
        registrar_e_enviar_notificacao(
            db=db,
            user_email=email_cliente,
            titulo=titulo_cli,
            mensagem=msg_cli,
            tipo="pagamento_confirmado",
            referencia_id=pagamento.id,
            payload_extra=payload_ws,
        )
        background_tasks.add_task(
            enviar_email_alerta_orcamento,
            destinatario_email=email_cliente,
            destinatario_nome=nome_cliente,
            titulo=titulo_cli,
            descricao=msg_cli,
            orcamento_id=orcamento.id,
        )


@router.post(
    "",
    response_model=schemas.PagamentoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Iniciar pagamento via PIX ou Cartão de Crédito (Mercado Pago)",
)
def criar_pagamento(
    payload: schemas.PagamentoCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    cliente: models.Cliente = Depends(get_current_cliente),
    db: Session = Depends(get_db),
):
    # 1. Idempotência: se a mesma chave já foi processada para o mesmo cliente/orçamento/método,
    # devolve o registro existente antes mesmo de contabilizar rate limit.
    existente_idem = (
        db.query(models.Pagamento)
        .filter(models.Pagamento.idempotency_key == payload.idempotency_key)
        .first()
    )
    if existente_idem is not None:
        if (
            existente_idem.cliente_id != cliente.id
            or existente_idem.orcamento_id != payload.orcamento_id
            or existente_idem.metodo != payload.metodo
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Chave de idempotência já utilizada em outra operação de pagamento.",
            )
        return _verificar_expiracao_pix(db, existente_idem)

    # 2. Rate limit Anti-Carding (máx. 5 tentativas por minuto por cliente/IP)
    check_payment_rate_limit(request, cliente.id)

    # 3. Busca orçamento e valida propriedade Anti-IDOR
    orcamento = (
        db.query(models.Orcamento)
        .filter(models.Orcamento.id == payload.orcamento_id)
        .first()
    )
    if orcamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orçamento não encontrado.",
        )

    pertence_ao_cliente = orcamento.cliente_id == cliente.id or (
        orcamento.cliente_id is None
        and (orcamento.cliente_email or "").strip().lower() == cliente.email.strip().lower()
    )
    if not pertence_ao_cliente:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para realizar o pagamento deste orçamento.",
        )

    if orcamento.cliente_id is None:
        orcamento.cliente_id = cliente.id

    # 4. Valida elegibilidade e valor estimado do orçamento (Fonte única da verdade)
    if orcamento.status not in (
        models.OrcamentoStatus.ACEITO.value,
        models.OrcamentoStatus.RESPONDIDO.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Apenas orçamentos aceitos ou respondidos com estimativa podem ser pagos.",
        )

    if orcamento.valor_estimado is None or orcamento.valor_estimado <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O orçamento não possui um valor estimado válido para pagamento.",
        )

    # 5. Valida agendamento associado (se informado)
    if payload.agendamento_id is not None:
        agendamento = (
            db.query(models.Agendamento)
            .filter(models.Agendamento.id == payload.agendamento_id)
            .first()
        )
        if agendamento is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agendamento informado não encontrado.",
            )
        if (
            agendamento.cliente_id != cliente.id
            or agendamento.professional_id != orcamento.professional_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="O agendamento informado não pertence a este cliente ou profissional.",
            )

    # 6. Bloqueia duplicidade se o orçamento já estiver pago
    pagamento_aprovado = (
        db.query(models.Pagamento)
        .filter(
            models.Pagamento.orcamento_id == orcamento.id,
            models.Pagamento.status == models.PagamentoStatus.APROVADO.value,
        )
        .first()
    )
    if pagamento_aprovado is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este orçamento já possui um pagamento aprovado.",
        )

    # 7. Substitui intenções pendentes anteriores para o mesmo orçamento
    provider = payment_gateway.MercadoPagoProvider()
    pendentes_anteriores = (
        db.query(models.Pagamento)
        .filter(
            models.Pagamento.orcamento_id == orcamento.id,
            models.Pagamento.status == models.PagamentoStatus.PENDENTE.value,
        )
        .all()
    )
    for ant in pendentes_anteriores:
        provider.cancelar_pagamento(ant.gateway_txid)
        ant.status = models.PagamentoStatus.CANCELADO.value

    valor_servidor = round(float(orcamento.valor_estimado), 2)
    external_reference = f"rs-orc-{orcamento.id}-pag-{uuid.uuid4().hex[:8]}"
    descricao_mp = f"RentalSpouse - Orcamento #{orcamento.id}"

    # 8. Chamada ao Mercado Pago API (/v1/payments)
    try:
        if payload.metodo == models.PagamentoMetodo.PIX.value:
            mp_resp = provider.criar_pagamento_pix(
                valor=valor_servidor,
                descricao=descricao_mp,
                external_reference=external_reference,
                idempotency_key=payload.idempotency_key,
                payer_email=cliente.email,
                payer_nome=cliente.nome,
                payer_cpf=cliente.cpf,
            )
        else:
            cartao = payload.cartao
            assert cartao is not None
            mp_resp = provider.criar_pagamento_cartao(
                valor=valor_servidor,
                descricao=descricao_mp,
                external_reference=external_reference,
                idempotency_key=payload.idempotency_key,
                card_token=cartao.card_token,
                payment_method_id=cartao.payment_method_id,
                parcelas=payload.parcelas,
                issuer_id=cartao.issuer_id,
                payer_email=cliente.email,
                nome_titular=cartao.nome_titular,
                cpf_titular=cartao.cpf_titular,
                device_session_id=cartao.device_session_id,
            )
    except httpx.HTTPError as exc:
        logger.error(
            "Falha de comunicação com Mercado Pago para orcamento_id=%d: %s",
            orcamento.id,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível processar o pagamento junto ao Mercado Pago no momento.",
        )

    mp_status_raw = str(mp_resp.get("status", "pending"))
    status_interno = payment_gateway.mapear_status_mp(mp_status_raw)
    status_detail = mp_resp.get("status_detail")
    motivo_recusa = (
        payment_gateway.mapear_motivo_recusa(status_detail)
        if status_interno == models.PagamentoStatus.RECUSADO.value
        else None
    )

    tx_data = (
        (mp_resp.get("point_of_interaction") or {}).get("transaction_data") or {}
    )
    card_data = mp_resp.get("card") or {}

    agora_utc = datetime.now(timezone.utc)
    pago_em = (
        _parse_iso_datetime(mp_resp.get("date_approved")) or agora_utc
        if status_interno == models.PagamentoStatus.APROVADO.value
        else None
    )

    pagamento = models.Pagamento(
        orcamento_id=orcamento.id,
        agendamento_id=payload.agendamento_id,
        cliente_id=cliente.id,
        professional_id=orcamento.professional_id,
        valor=valor_servidor,
        metodo=payload.metodo,
        status=status_interno,
        parcelas=payload.parcelas,
        gateway_provider=provider.mode,
        gateway_txid=str(mp_resp["id"]),
        external_reference=external_reference,
        idempotency_key=payload.idempotency_key,
        pix_copia_e_cola=tx_data.get("qr_code"),
        pix_qr_code_base64=tx_data.get("qr_code_base64"),
        pix_expira_em=_parse_iso_datetime(mp_resp.get("date_of_expiration")),
        cartao_ultimos_digitos=card_data.get("last_four_digits"),
        cartao_bandeira=(
            mp_resp.get("payment_method_id")
            if payload.metodo == models.PagamentoMetodo.CARTAO_CREDITO.value
            else None
        ),
        cartao_nome_titular=(
            payload.cartao.nome_titular if payload.cartao else None
        ),
        mp_status_detail=status_detail,
        motivo_recusa=motivo_recusa,
        pago_em=pago_em,
    )

    db.add(pagamento)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflito de concorrência: já existe um pagamento aprovado ou idempotente para este orçamento.",
        )

    db.refresh(pagamento)

    if pagamento.status == models.PagamentoStatus.APROVADO.value:
        _notificar_pagamento_confirmado(db, background_tasks, pagamento, orcamento)

    logger.info(
        "Pagamento #%d criado (orcamento_id=%d, metodo=%s, status=%s, gateway_txid=%s).",
        pagamento.id,
        pagamento.orcamento_id,
        pagamento.metodo,
        pagamento.status,
        pagamento.gateway_txid,
    )
    return pagamento


@router.post(
    "/webhook",
    summary="Webhook oficial de notificações do Mercado Pago",
    status_code=status.HTTP_200_OK,
)
async def webhook_mercadopago(
    request: Request,
    background_tasks: BackgroundTasks,
    x_signature: Optional[str] = Header(None, alias="x-signature"),
    x_request_id: Optional[str] = Header(None, alias="x-request-id"),
    db: Session = Depends(get_db),
):
    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        body = {}

    data_id = (
        request.query_params.get("data.id")
        or request.query_params.get("id")
        or (body.get("data") or {}).get("id")
    )
    if data_id is not None:
        data_id = str(data_id).strip()

    # Camadas 1, 2 e 3: Validação estrutural, Anti-Replay (ts <= 5 min) e HMAC-SHA256 constante
    if not payment_gateway.validar_assinatura_webhook(
        x_signature=x_signature,
        x_request_id=x_request_id,
        data_id=data_id,
    ):
        logger.warning(
            "Webhook Mercado Pago rejeitado: assinatura HMAC inválida ou timestamp expirado (data.id=%s).",
            data_id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Assinatura de webhook inválida ou expirada.",
        )

    # Camada 4: Confirmação Server-to-Server Zero-Trust (GET /v1/payments/{id})
    provider = payment_gateway.MercadoPagoProvider()
    try:
        mp_payment = provider.consultar_pagamento(str(data_id))
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transação não encontrada no Mercado Pago.",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Erro ao verificar transação no Mercado Pago.",
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Erro de comunicação ao verificar transação no Mercado Pago.",
        )

    txid_mp = str(mp_payment.get("id") or data_id)
    ext_ref_mp = mp_payment.get("external_reference")

    pagamento = (
        db.query(models.Pagamento)
        .filter(models.Pagamento.gateway_txid == txid_mp)
        .first()
    )
    if pagamento is None and ext_ref_mp:
        pagamento = (
            db.query(models.Pagamento)
            .filter(models.Pagamento.external_reference == ext_ref_mp)
            .first()
        )
    if pagamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pagamento não encontrado na base local.",
        )

    # Validação de integridade do valor e referência cruzada (Anti-Fraude)
    valor_mp = round(float(mp_payment.get("transaction_amount", 0.0)), 2)
    valor_local = round(float(pagamento.valor), 2)
    if valor_mp != valor_local or (
        ext_ref_mp and ext_ref_mp != pagamento.external_reference
    ):
        logger.error(
            "Divergência de integridade no webhook do pagamento #%d (valor_mp=%.2f, valor_local=%.2f).",
            pagamento.id,
            valor_mp,
            valor_local,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Divergência de valor ou referência externa na confirmação do pagamento.",
        )

    novo_status = payment_gateway.mapear_status_mp(mp_payment.get("status"))
    status_anterior = pagamento.status
    status_detail = mp_payment.get("status_detail")

    pagamento.mp_status_detail = status_detail
    pagamento.status = novo_status
    if novo_status == models.PagamentoStatus.RECUSADO.value:
        pagamento.motivo_recusa = payment_gateway.mapear_motivo_recusa(status_detail)

    transicionou_aprovado = (
        status_anterior != models.PagamentoStatus.APROVADO.value
        and novo_status == models.PagamentoStatus.APROVADO.value
    )
    if transicionou_aprovado:
        pagamento.pago_em = (
            _parse_iso_datetime(mp_payment.get("date_approved"))
            or datetime.now(timezone.utc)
        )

    db.commit()
    db.refresh(pagamento)

    if transicionou_aprovado:
        orcamento = (
            db.query(models.Orcamento)
            .filter(models.Orcamento.id == pagamento.orcamento_id)
            .first()
        )
        if orcamento:
            _notificar_pagamento_confirmado(db, background_tasks, pagamento, orcamento)

    return {
        "status": "processed",
        "pagamento_id": pagamento.id,
        "pagamento_status": pagamento.status,
    }


@router.post(
    "/{pagamento_id}/simular-aprovacao",
    response_model=schemas.PagamentoRead,
    summary="Simular confirmação de pagamento PIX (restrito a sandbox_mock)",
)
def simular_aprovacao_pix(
    pagamento_id: int,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payment_gateway.obter_provider_mode() != "sandbox_mock":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A simulação de aprovação está disponível apenas em modo sandbox_mock.",
        )

    pagamento = (
        db.query(models.Pagamento)
        .filter(models.Pagamento.id == pagamento_id)
        .first()
    )
    if pagamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pagamento não encontrado.",
        )

    cli = (
        db.query(models.Cliente)
        .filter(models.Cliente.email == current_user.email.strip().lower())
        .first()
    )
    eh_dono = cli is not None and cli.id == pagamento.cliente_id
    eh_admin = current_user.role == models.UserRole.ADMIN.value
    if not (eh_dono or eh_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para simular a aprovação deste pagamento.",
        )

    try:
        payment_gateway.simular_status_mp(
            pagamento.gateway_txid,
            novo_status="approved",
            status_detail="accredited",
            transaction_amount=pagamento.valor,
        )
    except KeyError:
        pass

    era_aprovado = pagamento.status == models.PagamentoStatus.APROVADO.value
    pagamento.status = models.PagamentoStatus.APROVADO.value
    pagamento.mp_status_detail = "accredited"
    pagamento.pago_em = pagamento.pago_em or datetime.now(timezone.utc)
    db.commit()
    db.refresh(pagamento)

    if not era_aprovado:
        orcamento = (
            db.query(models.Orcamento)
            .filter(models.Orcamento.id == pagamento.orcamento_id)
            .first()
        )
        if orcamento:
            _notificar_pagamento_confirmado(db, background_tasks, pagamento, orcamento)

    return pagamento


@router.get(
    "/meus",
    response_model=List[schemas.PagamentoRead],
    summary="Listar histórico de pagamentos do usuário autenticado",
)
def listar_meus_pagamentos(
    status_filtro: Optional[str] = Query(None, alias="status"),
    metodo: Optional[str] = Query(None),
    orcamento_id: Optional[int] = Query(None, gt=0),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(models.Pagamento)
    email_limpo = current_user.email.strip().lower()

    if current_user.role == models.UserRole.PROFESSIONAL.value:
        prof = (
            db.query(models.Professional)
            .filter(models.Professional.email == email_limpo)
            .first()
        )
        if not prof:
            return []
        query = query.filter(models.Pagamento.professional_id == prof.id)
    elif current_user.role == models.UserRole.ADMIN.value:
        pass
    else:
        cli = (
            db.query(models.Cliente)
            .filter(models.Cliente.email == email_limpo)
            .first()
        )
        if not cli:
            return []
        query = query.filter(models.Pagamento.cliente_id == cli.id)

    if status_filtro:
        query = query.filter(models.Pagamento.status == status_filtro.strip().lower())
    if metodo:
        query = query.filter(models.Pagamento.metodo == metodo.strip().lower())
    if orcamento_id:
        query = query.filter(models.Pagamento.orcamento_id == orcamento_id)

    pagamentos = (
        query.order_by(models.Pagamento.criado_em.desc(), models.Pagamento.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_verificar_expiracao_pix(db, p) for p in pagamentos]


@router.get(
    "/{pagamento_id}",
    response_model=schemas.PagamentoRead,
    summary="Consultar detalhes e comprovante de um pagamento",
)
def obter_pagamento(
    pagamento_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pagamento = (
        db.query(models.Pagamento)
        .filter(models.Pagamento.id == pagamento_id)
        .first()
    )
    if pagamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pagamento não encontrado.",
        )

    if current_user.role != models.UserRole.ADMIN.value:
        email_limpo = current_user.email.strip().lower()
        cli = (
            db.query(models.Cliente)
            .filter(models.Cliente.email == email_limpo)
            .first()
        )
        prof = (
            db.query(models.Professional)
            .filter(models.Professional.email == email_limpo)
            .first()
        )
        eh_cliente_dono = cli is not None and cli.id == pagamento.cliente_id
        eh_prof_recebedor = prof is not None and prof.id == pagamento.professional_id
        if not (eh_cliente_dono or eh_prof_recebedor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado aos detalhes deste pagamento.",
            )

    return _verificar_expiracao_pix(db, pagamento)
