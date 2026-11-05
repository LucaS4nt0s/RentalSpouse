"""
Testes automatizados para Pagamentos In-App via PIX e Cartão de Crédito com Mercado Pago (Issue #18).

Cobre os cenários BDD do PRD:
1. Geração de cobrança PIX e confirmação segura via Webhook (HMAC-SHA256 + Anti-Replay + Zero-Trust GET);
2. Pagamento com Cartão de Crédito via `card_token` em até 12x (Zero PAN/CVV no servidor);
3. Rejeição imediata (422) se o payload tentar enviar PAN (`numero_cartao`), `cvv` ou `valor`;
4. Rejeição de Webhook (401) sem `x-signature`, com HMAC inválido ou timestamp `ts` expirado (> 5 min);
5. Bloqueio de pagamento duplicado (409 Conflict), Idempotência e Anti-IDOR (403 Forbidden).
"""

from datetime import date
import time
import uuid

import pytest

import models
import payment_gateway
from rate_limiter import reset_rate_limits
from security import create_access_token


@pytest.fixture(autouse=True)
def _isolamento_pagamentos(monkeypatch):
    monkeypatch.setenv("PAYMENT_PROVIDER", "sandbox_mock")
    monkeypatch.setenv("MP_WEBHOOK_SECRET", "test_mp_webhook_secret_123")
    payment_gateway.limpar_mock_pagamentos()
    reset_rate_limits()
    yield
    payment_gateway.limpar_mock_pagamentos()
    reset_rate_limits()


def _seed_cenario_pagamento(db_session, valor_estimado: float = 180.0, status_orc: str = "aceito"):
    prof = models.Professional(
        name="Carlos Eletricista",
        email="carlos@rentalspouse.com",
        phone="11999990000",
        bio="Eletricista residencial especializado em quadros e tomadas.",
        service_radius_km=15.0,
        specialties=["Elétrica"],
        city="São Paulo",
        state="SP",
        senha_hash="hash_teste",
        is_active=True,
        approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
    )
    cli1 = models.Cliente(
        nome="Mariana Ferreira",
        email="mariana@cliente.com",
        cpf="52998224725",
        data_nascimento=date(1992, 5, 14),
        senha_hash="hash_teste",
        cep="01001000",
        logradouro="Praça da Sé",
        numero="100",
        bairro="Sé",
        cidade="São Paulo",
        estado="SP",
        email_verificado=True,
    )
    cli2 = models.Cliente(
        nome="Outro Cliente",
        email="outro@cliente.com",
        cpf="11144477735",
        data_nascimento=date(1990, 1, 20),
        senha_hash="hash_teste",
        cep="01001000",
        logradouro="Praça da Sé",
        numero="200",
        bairro="Sé",
        cidade="São Paulo",
        estado="SP",
        email_verificado=True,
    )
    db_session.add_all([prof, cli1, cli2])
    db_session.commit()
    db_session.refresh(prof)
    db_session.refresh(cli1)
    db_session.refresh(cli2)

    orcamento = models.Orcamento(
        cliente_id=cli1.id,
        cliente_nome=cli1.nome,
        cliente_email=cli1.email,
        professional_id=prof.id,
        descricao="Instalação de disjuntor DR e tomada 20A na cozinha.",
        status=status_orc,
        valor_estimado=valor_estimado,
    )
    db_session.add(orcamento)
    db_session.commit()
    db_session.refresh(orcamento)

    token_cli1 = create_access_token(
        {"sub": cli1.email, "role": models.UserRole.CLIENT.value, "user_id": cli1.id}
    )
    token_cli2 = create_access_token(
        {"sub": cli2.email, "role": models.UserRole.CLIENT.value, "user_id": cli2.id}
    )
    token_prof = create_access_token(
        {"sub": prof.email, "role": models.UserRole.PROFESSIONAL.value, "user_id": prof.id}
    )
    return {
        "prof": prof,
        "cli1": cli1,
        "cli2": cli2,
        "orcamento": orcamento,
        "headers_cli1": {"Authorization": f"Bearer {token_cli1}"},
        "headers_cli2": {"Authorization": f"Bearer {token_cli2}"},
        "headers_prof": {"Authorization": f"Bearer {token_prof}"},
    }


def test_cenario_1_pix_e_confirmacao_webhook_hmac(client, db_session, caixa_de_entrada):
    """Cenário 1: Geração de PIX no Mercado Pago e aprovação via Webhook HMAC-SHA256 + Zero-Trust GET."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=180.0)
    idem_key = str(uuid.uuid4())

    resp = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": idem_key,
        },
    )
    assert resp.status_code == 201, resp.text
    dados = resp.json()
    assert dados["status"] == "pendente"
    assert dados["valor"] == 180.0
    assert dados["valor_parcela"] == 180.0
    assert dados["gateway_txid"]
    assert dados["pix_copia_e_cola"].startswith("000201")
    assert dados["pix_qr_code_base64"]
    assert dados["pix_expira_em"] is not None

    # Idempotência: reenviar a mesma idempotency_key retorna a mesma transação sem duplicar
    resp_idem = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": idem_key,
        },
    )
    assert resp_idem.status_code == 201
    assert resp_idem.json()["id"] == dados["id"]
    assert resp_idem.json()["gateway_txid"] == dados["gateway_txid"]

    # Simula liquidação do PIX no Mercado Pago antes do disparo do Webhook
    txid = dados["gateway_txid"]
    payment_gateway.simular_status_mp(txid, novo_status="approved", status_detail="accredited")

    request_id = "req-mp-webhook-001"
    x_signature, _ = payment_gateway.gerar_assinatura_webhook(data_id=txid, x_request_id=request_id)

    resp_wh = client.post(
        f"/api/pagamentos/webhook?data.id={txid}",
        headers={
            "x-signature": x_signature,
            "x-request-id": request_id,
        },
        json={"action": "payment.updated", "type": "payment", "data": {"id": txid}},
    )
    assert resp_wh.status_code == 200, resp_wh.text
    assert resp_wh.json()["pagamento_status"] == "aprovado"

    # Confere atualização do pagamento e notificações geradas
    resp_get = client.get(f"/api/pagamentos/{dados['id']}", headers=ctx["headers_cli1"])
    assert resp_get.status_code == 200
    assert resp_get.json()["status"] == "aprovado"
    assert resp_get.json()["pago_em"] is not None

    notificacoes = (
        db_session.query(models.Notificacao)
        .filter(models.Notificacao.tipo == "pagamento_confirmado")
        .all()
    )
    destinatarios = {n.user_email for n in notificacoes}
    assert ctx["prof"].email in destinatarios
    assert ctx["cli1"].email in destinatarios
    assert len(caixa_de_entrada) >= 2


def test_cenario_2_cartao_tokenizado_parcelado_e_recusado(client, db_session):
    """Cenário 2: Pagamento com Cartão de Crédito via card_token em 3x e teste de cartão recusado."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=300.0)

    # 2a. Tentativa com cartão recusado pelo antifraude/emissor
    resp_rec = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "cartao_credito",
            "parcelas": 2,
            "idempotency_key": str(uuid.uuid4()),
            "cartao": {
                "card_token": "tok_recusado_antifraude_9988",
                "payment_method_id": "visa",
                "nome_titular": "MARIANA FERREIRA",
                "cpf_titular": "52998224725",
            },
        },
    )
    assert resp_rec.status_code == 201
    dados_rec = resp_rec.json()
    assert dados_rec["status"] == "recusado"
    assert dados_rec["motivo_recusa"] is not None

    # 2b. Nova tentativa com cartão aprovado em 3x de R$ 100,00
    resp_ok = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "cartao_credito",
            "parcelas": 3,
            "idempotency_key": str(uuid.uuid4()),
            "cartao": {
                "card_token": "ff8080814c11e237014c1ff593b55432",
                "payment_method_id": "master",
                "issuer_id": "24",
                "nome_titular": "MARIANA FERREIRA",
                "cpf_titular": "52998224725",
                "device_session_id": "mp_device_session_abc123",
            },
        },
    )
    assert resp_ok.status_code == 201, resp_ok.text
    dados_ok = resp_ok.json()
    assert dados_ok["status"] == "aprovado"
    assert dados_ok["parcelas"] == 3
    assert dados_ok["valor"] == 300.0
    assert dados_ok["valor_parcela"] == 100.0
    assert dados_ok["cartao_ultimos_digitos"] == "5432"
    assert dados_ok["cartao_bandeira"] == "master"
    assert dados_ok["pago_em"] is not None


def test_cenario_3_bloqueio_pci_dss_pan_cvv_e_anti_tampering_valor(client, db_session):
    """Cenário 3: Rejeita imediatamente com 422 qualquer envio de numero_cartao, cvv ou valor."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=250.0)

    # Tentativa de enviar PAN e CVV dentro de 'cartao'
    resp_pci = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "cartao_credito",
            "parcelas": 1,
            "idempotency_key": str(uuid.uuid4()),
            "cartao": {
                "card_token": "tok_valido_12345678",
                "payment_method_id": "visa",
                "nome_titular": "MARIANA FERREIRA",
                "cpf_titular": "52998224725",
                "numero_cartao": "4111111111111234",
                "cvv": "123",
            },
        },
    )
    assert resp_pci.status_code == 422

    # Tentativa de manipular o valor no payload raiz (Anti-Tampering)
    resp_tamper = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "valor": 0.01,
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert resp_tamper.status_code == 422
    assert db_session.query(models.Pagamento).count() == 0


def test_cenario_4_webhook_assinatura_invalida_e_replay_attack(client, db_session):
    """Cenário 4: Rejeita com 401 Webhooks sem x-signature, com HMAC adulterado ou ts expirado (> 5 min)."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=150.0)
    resp = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    txid = resp.json()["gateway_txid"]
    payment_gateway.simular_status_mp(txid, novo_status="approved")

    # 4a. Sem cabeçalho x-signature
    r1 = client.post("/api/pagamentos/webhook", json={"data": {"id": txid}})
    assert r1.status_code == 401

    # 4b. Assinatura HMAC forjada com segredo errado
    sig_falsa, _ = payment_gateway.gerar_assinatura_webhook(
        data_id=txid, x_request_id="req-1", secret="segredo_atacante"
    )
    r2 = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig_falsa, "x-request-id": "req-1"},
        json={"data": {"id": txid}},
    )
    assert r2.status_code == 401

    # 4c. Replay Attack: assinatura criptograficamente válida, mas gerada há 10 minutos (> 300s)
    ts_expirado = int(time.time()) - 600
    sig_antiga, _ = payment_gateway.gerar_assinatura_webhook(
        data_id=txid, x_request_id="req-replay", ts=ts_expirado
    )
    r3 = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig_antiga, "x-request-id": "req-replay"},
        json={"data": {"id": txid}},
    )
    assert r3.status_code == 401

    # Pagamento permanece pendente
    pag = db_session.query(models.Pagamento).filter_by(gateway_txid=txid).first()
    assert pag.status == "pendente"


def test_cenario_5_bloqueio_pagamento_duplicado_e_anti_idor(client, db_session):
    """Cenário 5: Bloqueia pagamento duplicado (409) para orçamento já pago e protege contra IDOR (403)."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=220.0)

    # Outro cliente tentando pagar orçamento alheio -> 403 Forbidden
    resp_idor = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli2"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert resp_idor.status_code == 403

    # Cliente dono cria PIX e aprova via rota de simulação sandbox_mock
    resp_pix = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert resp_pix.status_code == 201
    pag_id = resp_pix.json()["id"]

    # Outro cliente tentando consultar o pagamento -> 403 Forbidden
    assert client.get(f"/api/pagamentos/{pag_id}", headers=ctx["headers_cli2"]).status_code == 403
    # Profissional recebedor pode consultar -> 200 OK
    assert client.get(f"/api/pagamentos/{pag_id}", headers=ctx["headers_prof"]).status_code == 200

    # Aprova no modo sandbox_mock
    resp_sim = client.post(
        f"/api/pagamentos/{pag_id}/simular-aprovacao",
        headers=ctx["headers_cli1"],
    )
    assert resp_sim.status_code == 200
    assert resp_sim.json()["status"] == "aprovado"

    # Tentativa de novo pagamento para o mesmo orçamento -> 409 Conflict
    resp_dup = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert resp_dup.status_code == 409

    # Listagem em /api/pagamentos/meus para cliente e profissional
    lista_cli = client.get("/api/pagamentos/meus", headers=ctx["headers_cli1"]).json()
    lista_prof = client.get("/api/pagamentos/meus", headers=ctx["headers_prof"]).json()
    lista_outro = client.get("/api/pagamentos/meus", headers=ctx["headers_cli2"]).json()
    assert len(lista_cli) == 1
    assert len(lista_prof) == 1
    assert len(lista_outro) == 0



def test_substituicao_pix_pendente_bloqueio_simulacao_prod_e_divergencia_webhook(
    client, db_session, monkeypatch
):
    """Garante cancelamento de PIX pendente anterior, bloqueio de simulação em produção e proteção contra valor divergente no webhook."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=200.0, status_orc="respondido")

    # 1. Cria primeiro PIX pendente
    r1 = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r1.status_code == 201
    pag1_id = r1.json()["id"]

    # 2. Cria segundo PIX para o mesmo orçamento -> substitui/cancela o anterior
    r2 = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r2.status_code == 201
    pag2_id = r2.json()["id"]
    txid2 = r2.json()["gateway_txid"]
    assert client.get(f"/api/pagamentos/{pag1_id}", headers=ctx["headers_cli1"]).json()["status"] == "cancelado"

    # 3. Webhook reportando valor menor no Mercado Pago (tentativa de pagamento parcial) -> 422
    payment_gateway.simular_status_mp(txid2, novo_status="approved", transaction_amount=1.00)
    sig, _ = payment_gateway.gerar_assinatura_webhook(data_id=txid2, x_request_id="req-div")
    r_wh_div = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig, "x-request-id": "req-div"},
        json={"data": {"id": txid2}},
    )
    assert r_wh_div.status_code == 422

    # 4. Rota simular-aprovacao bloqueada quando PAYMENT_PROVIDER == 'mercadopago'
    monkeypatch.setenv("PAYMENT_PROVIDER", "mercadopago")
    r_sim_prod = client.post(
        f"/api/pagamentos/{pag2_id}/simular-aprovacao",
        headers=ctx["headers_cli1"],
    )
    assert r_sim_prod.status_code == 403
