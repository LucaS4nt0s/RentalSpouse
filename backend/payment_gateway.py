"""
Integração com a API v1 de Pagamentos do Mercado Pago (Issue #18).

Usa `httpx` diretamente (sem SDK proprietário pesado) tanto para chamadas reais
(`https://api.mercadopago.com/v1/payments`) quanto para o modo determinístico offline
(`PAYMENT_PROVIDER=sandbox_mock`) via `httpx.MockTransport`.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Optional, Tuple
import uuid

import httpx

import models

logger = logging.getLogger("rentalspouse.payment_gateway")

# 1x1 PNG transparente válido para exibição de QR Code em modo sandbox_mock
_MOCK_QR_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

WEBHOOK_TOLERANCIA_SEGUNDOS = 300  # 5 minutos (Anti-Replay)

STATUS_MP_PARA_INTERNO: Dict[str, str] = {
    "pending": models.PagamentoStatus.PENDENTE.value,
    "in_process": models.PagamentoStatus.PENDENTE.value,
    "in_mediation": models.PagamentoStatus.PENDENTE.value,
    "authorized": models.PagamentoStatus.PENDENTE.value,
    "approved": models.PagamentoStatus.APROVADO.value,
    "accredited": models.PagamentoStatus.APROVADO.value,
    "rejected": models.PagamentoStatus.RECUSADO.value,
    "cancelled": models.PagamentoStatus.CANCELADO.value,
    "refunded": models.PagamentoStatus.ESTORNADO.value,
    "charged_back": models.PagamentoStatus.ESTORNADO.value,
}

MOTIVOS_RECUSA_MP: Dict[str, str] = {
    "cc_rejected_bad_filled_card_number": "Número do cartão inválido.",
    "cc_rejected_bad_filled_date": "Data de validade do cartão inválida.",
    "cc_rejected_bad_filled_other": "Dados do cartão preenchidos incorretamente.",
    "cc_rejected_bad_filled_security_code": "Código de segurança (CVV) inválido.",
    "cc_rejected_blacklist": "Não foi possível processar o pagamento com este cartão.",
    "cc_rejected_call_for_authorize": "O banco emissor exige autorização prévia para este valor.",
    "cc_rejected_card_disabled": "Cartão inativo ou bloqueado. Contate o banco emissor.",
    "cc_rejected_duplicated_payment": "Pagamento duplicado detectado para este valor.",
    "cc_rejected_high_risk": "Transação recusada pela análise de segurança antifraude do Mercado Pago.",
    "cc_rejected_insufficient_amount": "Saldo ou limite insuficiente no cartão de crédito.",
    "cc_rejected_invalid_installments": "O cartão não permite o número de parcelas selecionado.",
    "cc_rejected_max_attempts": "Limite de tentativas excedido para este cartão.",
    "cc_rejected_other_reason": "O banco emissor recusou o pagamento. Tente outro cartão ou PIX.",
}

# Armazenamento em memória para o modo determinístico offline (sandbox_mock / pytest)
# ponytail: dict em memória para sandbox_mock; API real do Mercado Pago é stateless via HTTP
_MOCK_PAYMENTS: Dict[str, Dict[str, Any]] = {}
_MOCK_IDEMPOTENCY: Dict[str, str] = {}


def limpar_mock_pagamentos() -> None:
    """Limpa o estado em memória do simulador Mercado Pago (usado nos testes)."""
    _MOCK_PAYMENTS.clear()
    _MOCK_IDEMPOTENCY.clear()


def obter_provider_mode() -> str:
    """Retorna 'mercadopago' ou 'sandbox_mock' conforme configuração de ambiente."""
    raw = os.getenv("PAYMENT_PROVIDER", "sandbox_mock").strip().lower()
    return "mercadopago" if raw == "mercadopago" else "sandbox_mock"


def obter_webhook_secret() -> str:
    """Retorna o segredo HMAC configurado para validação do header x-signature."""
    return os.getenv("MP_WEBHOOK_SECRET", "dev_mp_webhook_secret_change_in_production").strip()


def mapear_status_mp(mp_status: Optional[str]) -> str:
    """Converte o status do Mercado Pago para o enum interno `PagamentoStatus`."""
    if not mp_status:
        return models.PagamentoStatus.PENDENTE.value
    return STATUS_MP_PARA_INTERNO.get(
        mp_status.strip().lower(), models.PagamentoStatus.PENDENTE.value
    )


def mapear_motivo_recusa(status_detail: Optional[str]) -> Optional[str]:
    """Traduz `status_detail` de recusa do Mercado Pago para mensagem amigável."""
    if not status_detail:
        return None
    return MOTIVOS_RECUSA_MP.get(
        status_detail.strip().lower(),
        "Pagamento recusado pela operadora ou análise de segurança.",
    )


def _gerar_emv_pix(txid: str, valor: float) -> str:
    valor_str = f"{valor:.2f}"
    return (
        f"00020126580014br.gov.bcb.pix0136{uuid.uuid4()}"
        f"52040000530398654{len(valor_str):02d}{valor_str}5802BR"
        f"5912RENTALSPOUSE6009SAO PAULO62{len(txid) + 4:02d}05{len(txid):02d}{txid}6304ABCD"
    )


def simular_status_mp(
    gateway_txid: str,
    novo_status: str = "approved",
    status_detail: str = "accredited",
    transaction_amount: Optional[float] = None,
) -> Dict[str, Any]:
    """Atualiza uma transação no simulador in-memory para testes de Webhook e aprovação."""
    txid = str(gateway_txid)
    registro = _MOCK_PAYMENTS.get(txid)
    if not registro:
        raise KeyError(f"Transação mock '{txid}' não encontrada.")
    registro["status"] = novo_status
    registro["status_detail"] = status_detail
    if transaction_amount is not None:
        registro["transaction_amount"] = float(transaction_amount)
    if novo_status == "approved":
        registro["date_approved"] = datetime.now(timezone.utc).isoformat()
    return registro


def _mock_handler(request: httpx.Request) -> httpx.Response:
    """Handler HTTP determinístico que simula o contrato JSON de `/v1/payments` do Mercado Pago."""
    path = request.url.path
    method = request.method.upper()

    if method == "POST" and path == "/v1/payments":
        idem_key = request.headers.get("x-idempotency-key") or ""
        if idem_key and idem_key in _MOCK_IDEMPOTENCY:
            existing_id = _MOCK_IDEMPOTENCY[idem_key]
            return httpx.Response(200, json=_MOCK_PAYMENTS[existing_id])

        body = json.loads(request.content.decode("utf-8"))
        txid = str(10000000000 + len(_MOCK_PAYMENTS) + 1)
        now_utc = datetime.now(timezone.utc)
        exp_min = int(os.getenv("MP_PIX_EXPIRATION_MINUTES", "30") or "30")
        exp_utc = now_utc + timedelta(minutes=exp_min)
        amount = float(body.get("transaction_amount", 0.0))
        payment_method_id = str(body.get("payment_method_id", "pix")).lower()
        ext_ref = body.get("external_reference", "")

        if payment_method_id == "pix":
            emv = _gerar_emv_pix(txid, amount)
            mp_payload: Dict[str, Any] = {
                "id": int(txid),
                "status": "pending",
                "status_detail": "pending_waiting_transfer",
                "payment_method_id": "pix",
                "transaction_amount": amount,
                "installments": 1,
                "external_reference": ext_ref,
                "date_created": now_utc.isoformat(),
                "date_of_expiration": exp_utc.isoformat(),
                "date_approved": None,
                "point_of_interaction": {
                    "type": "PIX",
                    "transaction_data": {
                        "qr_code": emv,
                        "qr_code_base64": _MOCK_QR_BASE64,
                        "ticket_url": f"https://www.mercadopago.com.br/payments/{txid}/ticket",
                    },
                },
            }
        else:
            token_str = str(body.get("token", ""))
            token_lower = token_str.lower()
            is_rejected = any(
                tag in token_lower for tag in ("recusado", "rejected", "fail", "erro", "negado")
            )
            if "insufficient" in token_lower or "saldo" in token_lower:
                detail = "cc_rejected_insufficient_amount"
            elif is_rejected:
                detail = "cc_rejected_high_risk"
            else:
                detail = "accredited"

            digits = "".join(filter(str.isdigit, token_str))
            last_four = digits[-4:] if len(digits) >= 4 else "4242"
            status_str = "rejected" if is_rejected else "approved"

            mp_payload = {
                "id": int(txid),
                "status": status_str,
                "status_detail": detail,
                "payment_method_id": payment_method_id,
                "transaction_amount": amount,
                "installments": int(body.get("installments", 1)),
                "external_reference": ext_ref,
                "date_created": now_utc.isoformat(),
                "date_approved": None if is_rejected else now_utc.isoformat(),
                "card": {
                    "last_four_digits": last_four,
                    "cardholder": body.get("cardholder") or {},
                },
            }

        _MOCK_PAYMENTS[txid] = mp_payload
        if idem_key:
            _MOCK_IDEMPOTENCY[idem_key] = txid
        return httpx.Response(201, json=mp_payload)

    if path.startswith("/v1/payments/"):
        txid = path.rsplit("/", 1)[-1]
        registro = _MOCK_PAYMENTS.get(txid)
        if not registro:
            return httpx.Response(404, json={"message": "Payment not found", "status": 404})
        if method == "GET":
            return httpx.Response(200, json=registro)
        if method == "PUT":
            body = json.loads(request.content.decode("utf-8"))
            if "status" in body:
                registro["status"] = body["status"]
            return httpx.Response(200, json=registro)

    return httpx.Response(404, json={"message": "Not found"})


class MercadoPagoProvider:
    """Cliente HTTP para a API v1 de Pagamentos do Mercado Pago."""

    def __init__(self, transport: Optional[httpx.BaseTransport] = None) -> None:
        self.mode = obter_provider_mode()
        self.base_url = os.getenv("MP_API_BASE_URL", "https://api.mercadopago.com").rstrip("/")
        self.access_token = os.getenv("MP_ACCESS_TOKEN", "").strip()
        if transport is not None:
            self._transport = transport
        elif self.mode == "sandbox_mock":
            self._transport = httpx.MockTransport(_mock_handler)
        else:
            self._transport = None

    def _headers(
        self,
        idempotency_key: Optional[str] = None,
        device_session_id: Optional[str] = None,
    ) -> Dict[str, str]:
        token = self.access_token or "TEST-SANDBOX-MOCK-TOKEN"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if idempotency_key:
            headers["X-Idempotency-Key"] = idempotency_key
        if device_session_id:
            headers["X-meli-session-id"] = device_session_id
        return headers

    def _client(self) -> httpx.Client:
        return httpx.Client(
            base_url=self.base_url,
            transport=self._transport,
            timeout=15.0,
        )

    def criar_pagamento_pix(
        self,
        *,
        valor: float,
        descricao: str,
        external_reference: str,
        idempotency_key: str,
        payer_email: str,
        payer_nome: str,
        payer_cpf: str,
    ) -> Dict[str, Any]:
        exp_min = int(os.getenv("MP_PIX_EXPIRATION_MINUTES", "30") or "30")
        exp_dt = datetime.now(timezone.utc) + timedelta(minutes=exp_min)
        partes_nome = (payer_nome or "Cliente").strip().split(" ", 1)
        first_name = partes_nome[0]
        last_name = partes_nome[1] if len(partes_nome) > 1 else "RentalSpouse"

        payload: Dict[str, Any] = {
            "transaction_amount": round(float(valor), 2),
            "description": descricao[:250],
            "payment_method_id": "pix",
            "external_reference": external_reference,
            "date_of_expiration": exp_dt.strftime("%Y-%m-%dT%H:%M:%S.000+00:00"),
            "payer": {
                "email": payer_email,
                "first_name": first_name,
                "last_name": last_name,
                "identification": {"type": "CPF", "number": payer_cpf},
            },
        }
        notif_url = os.getenv("MP_WEBHOOK_NOTIFICATION_URL", "").strip()
        if notif_url:
            payload["notification_url"] = notif_url

        with self._client() as client:
            resp = client.post(
                "/v1/payments",
                headers=self._headers(idempotency_key=idempotency_key),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    def criar_pagamento_cartao(
        self,
        *,
        valor: float,
        descricao: str,
        external_reference: str,
        idempotency_key: str,
        card_token: str,
        payment_method_id: str,
        parcelas: int,
        issuer_id: Optional[str],
        payer_email: str,
        nome_titular: str,
        cpf_titular: str,
        device_session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "transaction_amount": round(float(valor), 2),
            "token": card_token,
            "description": descricao[:250],
            "installments": int(parcelas),
            "payment_method_id": payment_method_id,
            "capture": True,
            "binary_mode": True,
            "external_reference": external_reference,
            "payer": {
                "email": payer_email,
                "identification": {"type": "CPF", "number": cpf_titular},
            },
        }
        if issuer_id:
            payload["issuer_id"] = issuer_id
        notif_url = os.getenv("MP_WEBHOOK_NOTIFICATION_URL", "").strip()
        if notif_url:
            payload["notification_url"] = notif_url

        with self._client() as client:
            resp = client.post(
                "/v1/payments",
                headers=self._headers(
                    idempotency_key=idempotency_key,
                    device_session_id=device_session_id,
                ),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    def consultar_pagamento(self, gateway_txid: str) -> Dict[str, Any]:
        with self._client() as client:
            resp = client.get(
                f"/v1/payments/{gateway_txid}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    def cancelar_pagamento(self, gateway_txid: str) -> Optional[Dict[str, Any]]:
        try:
            with self._client() as client:
                resp = client.put(
                    f"/v1/payments/{gateway_txid}",
                    headers=self._headers(idempotency_key=f"cancel-{gateway_txid}-{uuid.uuid4().hex[:8]}"),
                    json={"status": "cancelled"},
                )
                if resp.status_code < 400:
                    return resp.json()
        except Exception as exc:
            logger.warning("Não foi possível cancelar pagamento pendente %s no MP: %s", gateway_txid, exc)
        return None


def gerar_assinatura_webhook(
    data_id: str,
    x_request_id: str,
    ts: Optional[int] = None,
    secret: Optional[str] = None,
) -> Tuple[str, int]:
    """Gera o cabeçalho `x-signature` no padrão oficial do Mercado Pago (`ts=...,v1=...`)."""
    timestamp = int(ts if ts is not None else time.time())
    segredo = secret if secret is not None else obter_webhook_secret()
    data_id_norm = str(data_id).strip().lower()
    manifest = f"id:{data_id_norm};request-id:{x_request_id.strip()};ts:{timestamp};"
    v1 = hmac.new(
        segredo.encode("utf-8"),
        manifest.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"ts={timestamp},v1={v1}", timestamp


def validar_assinatura_webhook(
    x_signature: Optional[str],
    x_request_id: Optional[str],
    data_id: Optional[str],
    secret: Optional[str] = None,
    now_ts: Optional[float] = None,
) -> bool:
    """
    Valida a assinatura criptográfica HMAC-SHA256 e a janela temporal Anti-Replay (<= 5 min)
    do Webhook do Mercado Pago.
    """
    if not x_signature or not x_request_id or not data_id:
        return False

    partes: Dict[str, str] = {}
    for item in x_signature.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            partes[k.strip()] = v.strip()

    ts_raw = partes.get("ts")
    received_v1 = partes.get("v1")
    if not ts_raw or not received_v1:
        return False

    try:
        ts_int = int(ts_raw)
    except ValueError:
        return False

    agora = float(now_ts if now_ts is not None else time.time())
    if abs(agora - ts_int) > WEBHOOK_TOLERANCIA_SEGUNDOS:
        logger.warning("Webhook Mercado Pago rejeitado por Anti-Replay (ts=%s, agora=%s).", ts_int, int(agora))
        return False

    segredo = secret if secret is not None else obter_webhook_secret()
    if not segredo:
        return False

    data_id_norm = str(data_id).strip().lower()
    manifest = f"id:{data_id_norm};request-id:{x_request_id.strip()};ts:{ts_int};"
    expected_v1 = hmac.new(
        segredo.encode("utf-8"),
        manifest.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(received_v1.lower(), expected_v1.lower())
