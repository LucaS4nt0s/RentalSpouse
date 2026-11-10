"""
Testes automatizados para Pagamentos In-App via PIX e Cartão de Crédito com Mercado Pago (Issue #18).

Cobre os cenários BDD do PRD:
1. Geração de cobrança PIX e confirmação segura via Webhook (HMAC-SHA256 + Anti-Replay + Zero-Trust GET);
2. Pagamento com Cartão de Crédito via `card_token` em até 12x (Zero PAN/CVV no servidor);
3. Rejeição imediata (422) se o payload tentar enviar PAN (`numero_cartao`), `cvv` ou `valor`;
4. Rejeição de Webhook (401) sem `x-signature`, com HMAC inválido ou timestamp `ts` expirado (> 5 min);
5. Bloqueio de pagamento duplicado (409 Conflict), Idempotência e Anti-IDOR (403 Forbidden).
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import threading
import time
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from database import Base, get_db
from main import app
import models
import payment_gateway
from rate_limiter import check_payment_rate_limit, reset_rate_limits
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

    # 2c. O payload enviado ao MP leva o nome do titular e o device fingerprint.
    payload_mp = payment_gateway._MOCK_PAYMENTS[dados_ok["gateway_txid"]]
    assert payload_mp["payer"]["first_name"] == "MARIANA"
    assert payload_mp["payer"]["last_name"] == "FERREIRA"
    assert payload_mp["device_session_id"] == "mp_device_session_abc123"


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
    corpo_erro = resp_pci.json()
    assert "4111111111111234" not in resp_pci.text
    assert '"input"' not in resp_pci.text
    for erro in corpo_erro["detail"]:
        assert "input" not in erro
        assert "ctx" not in erro

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



def test_reaproveita_pix_pendente_bloqueio_simulacao_prod_e_divergencia_webhook(
    client, db_session, monkeypatch
):
    """Reaproveita PIX pendente válido, bloqueia simulação em produção e protege contra valor divergente."""
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

    # 2. Segundo PIX para o mesmo orçamento -> reaproveita o pendente válido
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
    assert pag2_id == pag1_id
    assert r2.json()["gateway_txid"] == r1.json()["gateway_txid"]
    assert client.get(f"/api/pagamentos/{pag1_id}", headers=ctx["headers_cli1"]).json()["status"] == "pendente"
    assert db_session.query(models.Pagamento).count() == 1

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


def test_concorrencia_pix_e_cartao_nao_gera_cobranca_orfa(client, tmp_path):
    """Duas intenções concorrentes com chaves diferentes: no máximo uma cobrança externa."""
    # Banco em arquivo com conexões independentes: o SQLite em memória do
    # restante da suíte usa uma única conexão e não representa concorrência real.
    engine = create_engine(
        f"sqlite:///{tmp_path / 'concorrencia.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _configurar_sqlite(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    sessao_seed = SessionLocal()
    try:
        ctx = _seed_cenario_pagamento(sessao_seed, valor_estimado=180.0)
    finally:
        sessao_seed.close()

    barreira = threading.Barrier(2)

    payloads = [
        {
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
        {
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "cartao_credito",
            "parcelas": 1,
            "idempotency_key": str(uuid.uuid4()),
            "cartao": {
                "card_token": "tok_concorrente_aprovado_5555",
                "payment_method_id": "visa",
                "nome_titular": "MARIANA FERREIRA",
                "cpf_titular": "52998224725",
            },
        },
    ]

    def enviar(payload):
        barreira.wait(timeout=10)
        return client.post("/api/pagamentos", headers=ctx["headers_cli1"], json=payload)

    with ThreadPoolExecutor(max_workers=2) as executor:
        respostas = list(executor.map(enviar, payloads))

    codigos = sorted(resposta.status_code for resposta in respostas)
    assert codigos == [201, 409], [r.text for r in respostas]

    sessao_verificacao = SessionLocal()
    try:
        pagamentos = sessao_verificacao.query(models.Pagamento).all()
        assert len(pagamentos) == 1
        assert sum(1 for p in pagamentos if p.status == "aprovado") <= 1

        # Toda cobrança criada no simulador do MP precisa ter registro local (sem órfãs).
        txids_locais = {p.gateway_txid for p in pagamentos}
        assert set(payment_gateway._MOCK_PAYMENTS.keys()) == txids_locais
    finally:
        sessao_verificacao.close()


def test_falha_cancelamento_pix_anterior_nao_cria_nova_cobranca(
    client, db_session, monkeypatch
):
    """Se o MP não confirmar o cancelamento do PIX vencido, nenhuma nova cobrança é criada."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=120.0)

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
    txid_anterior = r1.json()["gateway_txid"]

    pagamento = db_session.query(models.Pagamento).filter_by(gateway_txid=txid_anterior).first()
    pagamento.pix_expira_em = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    db_session.commit()

    monkeypatch.setattr(
        payment_gateway.MercadoPagoProvider,
        "cancelar_pagamento",
        lambda self, gateway_txid: None,
    )

    r2 = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r2.status_code == 502
    assert db_session.query(models.Pagamento).count() == 1
    assert set(payment_gateway._MOCK_PAYMENTS.keys()) == {txid_anterior}


def test_webhook_duplicado_e_fora_de_ordem(client, db_session):
    """Webhook duplicado não duplica notificações; transição fora de ordem vira evento e 200."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=90.0)
    r = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    txid = r.json()["gateway_txid"]
    pagamento_id = r.json()["id"]
    payment_gateway.simular_status_mp(txid, novo_status="approved", status_detail="accredited")
    sig, _ = payment_gateway.gerar_assinatura_webhook(data_id=txid, x_request_id="req-dup")

    primeira = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig, "x-request-id": "req-dup"},
        json={"data": {"id": txid}},
    )
    assert primeira.status_code == 200
    notificacoes_apos_primeira = db_session.query(models.Notificacao).count()

    duplicada = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig, "x-request-id": "req-dup"},
        json={"data": {"id": txid}},
    )
    assert duplicada.status_code == 200
    assert duplicada.json()["status"] == "duplicate"
    assert db_session.query(models.Notificacao).count() == notificacoes_apos_primeira

    # Fora de ordem: aprovado não pode regredir para recusado.
    payment_gateway.simular_status_mp(txid, novo_status="rejected", status_detail="cc_rejected_other_reason")
    sig2, _ = payment_gateway.gerar_assinatura_webhook(data_id=txid, x_request_id="req-ooo")
    fora_de_ordem = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig2, "x-request-id": "req-ooo"},
        json={"data": {"id": txid}},
    )
    assert fora_de_ordem.status_code == 200
    assert fora_de_ordem.json()["status"] == "ignored"

    db_session.expire_all()
    pagamento = db_session.get(models.Pagamento, pagamento_id)
    assert pagamento.status == "aprovado"
    evento = (
        db_session.query(models.PagamentoEvento)
        .filter_by(pagamento_id=pagamento_id, tipo="transicao_invalida")
        .first()
    )
    assert evento is not None


def test_webhook_violacao_indice_parcial_registra_estorno(client, db_session):
    """Duas aprovações para o mesmo orçamento: rollback, estorno e 200 para o MP."""
    ctx = _seed_cenario_pagamento(db_session, valor_estimado=110.0)

    primeira = client.post(
        "/api/pagamentos",
        headers=ctx["headers_cli1"],
        json={
            "orcamento_id": ctx["orcamento"].id,
            "metodo": "pix",
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    txid1 = primeira.json()["gateway_txid"]
    payment_gateway.simular_status_mp(txid1, novo_status="approved")
    sig1, _ = payment_gateway.gerar_assinatura_webhook(data_id=txid1, x_request_id="req-index-1")
    assert client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig1, "x-request-id": "req-index-1"},
        json={"data": {"id": txid1}},
    ).status_code == 200

    # Segunda cobrança real no MP, inserida localmente como pendente.
    provider = payment_gateway.MercadoPagoProvider()
    external_ref = f"rs-orc-{ctx['orcamento'].id}-pag-{uuid.uuid4().hex[:8]}"
    mp_resp = provider.criar_pagamento_pix(
        valor=110.0,
        descricao="RentalSpouse - Orcamento extra",
        external_reference=external_ref,
        idempotency_key=str(uuid.uuid4()),
        payer_email=ctx["cli1"].email,
        payer_nome=ctx["cli1"].nome,
        payer_cpf=ctx["cli1"].cpf,
    )
    txid2 = str(mp_resp["id"])
    pagamento2 = models.Pagamento(
        orcamento_id=ctx["orcamento"].id,
        cliente_id=ctx["cli1"].id,
        professional_id=ctx["prof"].id,
        valor=110.0,
        metodo="pix",
        status="pendente",
        parcelas=1,
        gateway_provider="sandbox_mock",
        gateway_txid=txid2,
        external_reference=external_ref,
        idempotency_key=str(uuid.uuid4()),
        pix_expira_em=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=30),
    )
    db_session.add(pagamento2)
    db_session.commit()
    pagamento2_id = pagamento2.id

    payment_gateway.simular_status_mp(txid2, novo_status="approved", transaction_amount=110.0)
    sig2, _ = payment_gateway.gerar_assinatura_webhook(data_id=txid2, x_request_id="req-index-2")
    resposta = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": sig2, "x-request-id": "req-index-2"},
        json={"data": {"id": txid2}},
    )
    assert resposta.status_code == 200
    assert resposta.json()["status"] == "ignored"

    db_session.expire_all()
    assert db_session.get(models.Pagamento, pagamento2_id).status == "pendente"
    assert db_session.query(models.Pagamento).filter_by(
        orcamento_id=ctx["orcamento"].id, status="aprovado"
    ).count() == 1
    evento = (
        db_session.query(models.PagamentoEvento)
        .filter_by(pagamento_id=pagamento2_id)
        .filter(models.PagamentoEvento.tipo.in_(("estorno_executado", "estorno_pendente")))
        .first()
    )
    assert evento is not None


def test_configuracao_pagamentos_fail_closed(client, monkeypatch):
    """Provider inválido e simulador em produção falham; sem segredo, webhook é rejeitado."""
    monkeypatch.delenv("PAYMENT_PROVIDER", raising=False)
    assert payment_gateway.obter_provider_mode() == "mercadopago"

    monkeypatch.setenv("PAYMENT_PROVIDER", "provedor_invalido")
    with pytest.raises(RuntimeError):
        payment_gateway.obter_provider_mode()

    monkeypatch.setenv("PAYMENT_PROVIDER", "sandbox_mock")
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError):
        payment_gateway.obter_provider_mode()

    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("MP_WEBHOOK_SECRET", raising=False)
    assinatura = f"ts={int(time.time())},v1=qualquer"
    assert payment_gateway.validar_assinatura_webhook(
        x_signature=assinatura,
        x_request_id="req-sem-segredo",
        data_id="123",
    ) is False

    resposta = client.post(
        "/api/pagamentos/webhook",
        headers={"x-signature": assinatura, "x-request-id": "req-sem-segredo"},
        json={"data": {"id": "123"}},
    )
    assert resposta.status_code == 401


def _request_com_ip(ip: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/pagamentos",
            "headers": [],
            "query_string": b"",
            "client": (ip, 12345),
        }
    )


def test_rate_limit_pagamento_separa_cliente_e_ip():
    """Os contadores por cliente e por IP são independentes."""
    reset_rate_limits()
    ip_compartilhado = "203.0.113.10"

    for _ in range(5):
        check_payment_rate_limit(_request_com_ip(ip_compartilhado), cliente_id=1)
    with pytest.raises(HTTPException) as erro_cliente:
        check_payment_rate_limit(_request_com_ip(ip_compartilhado), cliente_id=1)
    assert erro_cliente.value.status_code == 429

    # Outro cliente no mesmo IP ainda pode tentar (contador por cliente separado).
    for _ in range(5):
        check_payment_rate_limit(_request_com_ip(ip_compartilhado), cliente_id=2)

    reset_rate_limits()
    for cliente_id in range(1, 21):
        check_payment_rate_limit(_request_com_ip(ip_compartilhado), cliente_id=cliente_id)
    with pytest.raises(HTTPException) as erro_ip:
        check_payment_rate_limit(_request_com_ip(ip_compartilhado), cliente_id=21)
    assert erro_ip.value.status_code == 429
