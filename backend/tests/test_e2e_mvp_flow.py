"""
Suíte de integração do fluxo completo do MVP (10 etapas) — RentalSpouse (Issue #100).

Nota de escopo: executa em processo via FastAPI `TestClient` + SQLite em memória
configurado em `tests/conftest.py` (sem mocks de regras de negócio, usando
`sandbox_mock` apenas no gateway externo de pagamentos), complementando o
Pair Check manual com Docker Compose + PostgreSQL 15:
1. Cadastro de cliente + confirmação de e-mail via token real + login;
2. Cadastro de profissional + login + upload de documentos obrigatórios + submissão;
3. Moderação administrativa: aprovação do cadastro do profissional;
4. Configuração da grade semanal de disponibilidade do profissional;
5. Busca pública pelo cliente localizando o profissional aprovado;
6. Solicitação de orçamento com foto (magic bytes PNG) -> resposta com estimativa -> aceite;
7. Consulta da agenda pública e reserva de slot pelo cliente;
8. Pagamento via PIX e confirmação de aprovação (`simular-aprovacao`);
9. Conclusão do atendimento e avaliação 5 estrelas com reflexo imediato na reputação;
10. Registro de denúncia pelo cliente e visualização/resumo no painel administrativo (#99/#23).
"""

import re
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import models
import payment_gateway
from security import hash_senha

_PNG_HEADER_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)
_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"


def _cpf_valido(base: str) -> str:
    """Calcula um CPF válido a partir de 9 dígitos base."""
    assert len(base) == 9 and base.isdigit()

    def digito(digitos: str) -> str:
        pesos = range(len(digitos) + 1, 1, -1)
        resto = (sum(int(d) * p for d, p in zip(digitos, pesos)) * 10) % 11
        return "0" if resto >= 10 else str(resto)

    primeiro = digito(base)
    return base + primeiro + digito(base + primeiro)


def _extrair_token_email(caixa_de_entrada: list) -> str:
    """Extrai o token de verificação do último e-mail capturado em memória."""
    assert len(caixa_de_entrada) >= 1, "Nenhum e-mail de verificação foi enviado."
    mensagem = caixa_de_entrada[-1]
    corpo = mensagem.get_body(preferencelist=("plain",))
    conteudo = corpo.get_content() if corpo is not None else str(mensagem)
    encontrado = re.search(r"token=([A-Za-z0-9_\-]+)", conteudo)
    assert encontrado is not None, f"Token de verificação não encontrado no e-mail: {conteudo}"
    return encontrado.group(1)


class TestFluxoCompletoMVPE2E:
    """Valida a integração sequencial completa entre todos os módulos do MVP."""

    @pytest.fixture(autouse=True)
    def _limpar_estado_mock_pagamentos(self):
        """Garante isolamento do estado em memória do gateway mock mesmo em falhas."""
        payment_gateway.limpar_mock_pagamentos()
        yield
        payment_gateway.limpar_mock_pagamentos()

    def test_jornada_completa_mvp_10_etapas(
        self,
        client: TestClient,
        db_session: Session,
        caixa_de_entrada: list,
        monkeypatch,
        tmp_path,
    ):
        # Isola uploads e força gateway determinístico sandbox_mock
        docs_dir = tmp_path / "documents"
        orcs_dir = tmp_path / "orcamentos"
        docs_dir.mkdir(parents=True, exist_ok=True)
        orcs_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setenv("DOCUMENTS_UPLOAD_DIR", str(docs_dir))
        monkeypatch.setenv("ORCAMENTOS_UPLOAD_DIR", str(orcs_dir))
        monkeypatch.setenv("PAYMENT_PROVIDER", "sandbox_mock")

        # ------------------------------------------------------------------
        # ETAPA 1: Cadastro de Cliente, Confirmação de E-mail e Login
        # ------------------------------------------------------------------
        email_cliente = "cliente.e2e@rentalspouse.com"
        senha_cliente = "ClienteE2E@2026"
        resp_cli = client.post(
            "/api/clientes",
            json={
                "nome": "Fernanda Cliente E2E",
                "email": email_cliente,
                "cpf": _cpf_valido("987654321"),
                "data_nascimento": "1992-07-10",
                "senha": senha_cliente,
                "confirmar_senha": senha_cliente,
                "endereco": {
                    "cep": "01001000",
                    "logradouro": "Praça da Sé",
                    "numero": "150",
                    "complemento": "Casa 2",
                    "bairro": "Sé",
                    "cidade": "São Paulo",
                    "estado": "SP",
                },
            },
        )
        assert resp_cli.status_code == 201, resp_cli.text
        assert resp_cli.json()["email_verificado"] is False

        token_verificacao = _extrair_token_email(caixa_de_entrada)
        resp_confirma = client.post(
            "/api/verificacao/confirmar",
            json={"token": token_verificacao},
        )
        assert resp_confirma.status_code == 200, resp_confirma.text
        assert resp_confirma.json()["email_verificado"] is True

        resp_login_cli = client.post(
            "/api/auth/login",
            json={"email": email_cliente, "password": senha_cliente},
        )
        assert resp_login_cli.status_code == 200, resp_login_cli.text
        headers_cliente = {
            "Authorization": f"Bearer {resp_login_cli.json()['access_token']}"
        }

        # ------------------------------------------------------------------
        # ETAPA 2: Cadastro de Profissional, Envio de Documentos e Submissão
        # ------------------------------------------------------------------
        email_prof = "prof.e2e@rentalspouse.com"
        senha_prof = "ProfE2E@2026"
        resp_prof = client.post(
            "/api/professionals",
            json={
                "name": "Roberto Eletricista E2E",
                "email": email_prof,
                "password": senha_prof,
                "phone": "(11) 98888-7777",
                "bio": "Eletricista residencial com 12 anos de experiência em manutenção predial.",
                "service_radius_km": 20.0,
                "specialties": ["Elétrica", "Automação"],
                "city": "São Paulo",
                "state": "SP",
            },
        )
        assert resp_prof.status_code == 201, resp_prof.text
        prof_id = resp_prof.json()["id"]

        resp_login_prof = client.post(
            "/api/auth/login",
            json={"email": email_prof, "password": senha_prof},
        )
        assert resp_login_prof.status_code == 200, resp_login_prof.text
        headers_prof = {
            "Authorization": f"Bearer {resp_login_prof.json()['access_token']}"
        }

        up_photo_id = client.post(
            "/api/professionals/me/documents",
            headers=headers_prof,
            data={"document_type": "photo_id"},
            files={"file": ("cnh.pdf", _PDF_BYTES, "application/pdf")},
        )
        assert up_photo_id.status_code == 201, up_photo_id.text

        up_res = client.post(
            "/api/professionals/me/documents",
            headers=headers_prof,
            data={"document_type": "proof_of_residence"},
            files={"file": ("comprovante.png", _PNG_HEADER_BYTES, "image/png")},
        )
        assert up_res.status_code == 201, up_res.text

        resp_submit = client.post(
            "/api/professionals/me/documents/submit",
            headers=headers_prof,
        )
        assert resp_submit.status_code == 200, resp_submit.text
        assert resp_submit.json()["can_submit"] is False

        # ------------------------------------------------------------------
        # ETAPA 3: Aprovação dos Documentos pelo Administrador
        # ------------------------------------------------------------------
        email_admin = "admin.e2e@rentalspouse.com"
        senha_admin = "AdminE2E@2026"
        admin = models.User(
            name="Admin E2E",
            email=email_admin,
            hashed_password=hash_senha(senha_admin),
            role=models.UserRole.ADMIN.value,
            is_active=True,
            email_verificado=True,
        )
        db_session.add(admin)
        db_session.commit()

        resp_login_admin = client.post(
            "/api/auth/login",
            json={"email": email_admin, "password": senha_admin},
        )
        assert resp_login_admin.status_code == 200, resp_login_admin.text
        headers_admin = {
            "Authorization": f"Bearer {resp_login_admin.json()['access_token']}"
        }

        resp_approve = client.post(
            f"/api/admins/professionals/{prof_id}/approve",
            headers=headers_admin,
        )
        assert resp_approve.status_code == 200, resp_approve.text
        assert resp_approve.json()["approval_status"] == "approved"

        # ------------------------------------------------------------------
        # ETAPA 4: Configuração da Agenda Semanal pelo Profissional
        # ------------------------------------------------------------------
        grade = [
            {
                "dia_semana": dia,
                "hora_inicio": "09:00:00",
                "hora_fim": "18:00:00",
                "duracao_slot_min": 60,
            }
            for dia in range(7)
        ]
        resp_disp = client.put(
            "/api/agendamentos/disponibilidade",
            headers=headers_prof,
            json=grade,
        )
        assert resp_disp.status_code == 200, resp_disp.text
        assert len(resp_disp.json()) == 7

        # ------------------------------------------------------------------
        # ETAPA 5: Busca Pública do Profissional pelo Cliente
        # ------------------------------------------------------------------
        resp_busca = client.get(
            "/api/professionals",
            params={"specialty": "Elétrica", "city": "São Paulo"},
        )
        assert resp_busca.status_code == 200, resp_busca.text
        itens_busca = resp_busca.json()
        assert isinstance(itens_busca, list)
        assert any(item["id"] == prof_id for item in itens_busca)

        # ------------------------------------------------------------------
        # ETAPA 6: Solicitação de Orçamento com Foto -> Resposta -> Aceite
        # ------------------------------------------------------------------
        resp_orc = client.post(
            "/api/orcamentos",
            headers=headers_cliente,
            data={
                "professional_id": str(prof_id),
                "descricao": "Preciso trocar o disjuntor geral e revisar duas tomadas na sala.",
            },
            files=[("fotos", ("quadro.png", _PNG_HEADER_BYTES, "image/png"))],
        )
        assert resp_orc.status_code == 201, resp_orc.text
        orcamento_id = resp_orc.json()["id"]
        assert len(resp_orc.json()["fotos"]) == 1

        resp_responder = client.patch(
            f"/api/orcamentos/{orcamento_id}/responder",
            headers=headers_prof,
            json={
                "valor_estimado": 280.0,
                "resposta_profissional": "Inclui troca do disjuntor 40A e revisão dos pontos.",
            },
        )
        assert resp_responder.status_code == 200, resp_responder.text
        assert resp_responder.json()["status"] == "respondido"

        resp_aceitar = client.patch(
            f"/api/orcamentos/{orcamento_id}/aceitar",
            headers=headers_prof,
            json={
                "valor_estimado": 280.0,
                "mensagem": "Confirmado! Posso atender no horário selecionado.",
            },
        )
        assert resp_aceitar.status_code == 200, resp_aceitar.text
        assert resp_aceitar.json()["status"] == "aceito"

        # ------------------------------------------------------------------
        # ETAPA 7: Consulta de Agenda e Reserva de Slot pelo Cliente
        # ------------------------------------------------------------------
        resp_agenda = client.get(f"/api/professionals/{prof_id}/agenda")
        assert resp_agenda.status_code == 200, resp_agenda.text
        dias = resp_agenda.json()
        primeiro_slot = next(
            (slot for dia in dias for slot in dia["slots"] if slot.get("disponivel")),
            None,
        )
        assert primeiro_slot is not None, "Nenhum slot disponível encontrado na agenda."

        resp_agendamento = client.post(
            "/api/agendamentos",
            headers=headers_cliente,
            json={
                "professional_id": prof_id,
                "data_hora_inicio": primeiro_slot["data_hora_inicio"],
                "orcamento_id": orcamento_id,
            },
        )
        assert resp_agendamento.status_code == 201, resp_agendamento.text
        agendamento_id = resp_agendamento.json()["id"]

        resp_meus_ag = client.get("/api/agendamentos/meus", headers=headers_cliente)
        assert resp_meus_ag.status_code == 200
        assert any(ag["id"] == agendamento_id for ag in resp_meus_ag.json())

        # ------------------------------------------------------------------
        # ETAPA 8: Pagamento via PIX e Simulação de Aprovação (sandbox_mock)
        # ------------------------------------------------------------------
        resp_pag = client.post(
            "/api/pagamentos",
            headers=headers_cliente,
            json={
                "orcamento_id": orcamento_id,
                "agendamento_id": agendamento_id,
                "metodo": "pix",
                "parcelas": 1,
                "idempotency_key": f"e2e-{uuid.uuid4().hex}",
            },
        )
        assert resp_pag.status_code == 201, resp_pag.text
        pagamento_id = resp_pag.json()["id"]
        assert resp_pag.json()["valor"] == 280.0

        resp_simular = client.post(
            f"/api/pagamentos/{pagamento_id}/simular-aprovacao",
            headers=headers_cliente,
        )
        assert resp_simular.status_code == 200, resp_simular.text
        assert resp_simular.json()["status"] == "aprovado"

        # ------------------------------------------------------------------
        # ETAPA 9: Conclusão do Atendimento e Avaliação 5 Estrelas
        # ------------------------------------------------------------------
        resp_concluir = client.patch(
            f"/api/agendamentos/{agendamento_id}/concluir",
            headers=headers_prof,
        )
        assert resp_concluir.status_code == 200, resp_concluir.text
        assert resp_concluir.json()["status"] == "concluido"

        resp_aval = client.post(
            "/api/avaliacoes",
            headers=headers_cliente,
            json={
                "professional_id": prof_id,
                "agendamento_id": agendamento_id,
                "orcamento_id": orcamento_id,
                "nota": 5,
                "comentario": "Atendimento pontual, serviço limpo e muito bem executado.",
            },
        )
        assert resp_aval.status_code == 201, resp_aval.text

        resp_rep = client.get(f"/api/professionals/{prof_id}/avaliacoes")
        assert resp_rep.status_code == 200, resp_rep.text
        assert resp_rep.json()["media_notas"] == 5.0
        assert resp_rep.json()["total_avaliacoes"] == 1

        # ------------------------------------------------------------------
        # ETAPA 10: Registro de Denúncia e Visualização no Painel Admin (#99)
        # ------------------------------------------------------------------
        resp_den = client.post(
            "/api/denuncias",
            headers=headers_cliente,
            json={
                "professional_id": prof_id,
                "motivo": "cobranca_indevida",
                "descricao": "Registro de teste E2E: divergência identificada após emissão do recibo final.",
            },
        )
        assert resp_den.status_code == 201, resp_den.text
        denuncia_id = resp_den.json()["id"]

        resp_minhas_den = client.get("/api/denuncias/me", headers=headers_cliente)
        assert resp_minhas_den.status_code == 200, resp_minhas_den.text
        assert any(d["id"] == denuncia_id for d in resp_minhas_den.json())

        # Painel administrativo de denúncias (#99/#107) — valida incondicionalmente
        resp_admin_den = client.get("/api/admin/denuncias", headers=headers_admin)
        assert resp_admin_den.status_code == 200, resp_admin_den.text
        denuncias_admin = resp_admin_den.json()
        alvo = next((d for d in denuncias_admin if d["id"] == denuncia_id), None)
        assert alvo is not None
        assert alvo["status"] == "pendente"
        assert alvo["cliente_email"] == email_cliente
        assert alvo["professional_email"] == email_prof
        assert alvo["professional_is_active"] is True
        assert alvo["professional_total_denuncias"] == 1

        resp_resumo = client.get("/api/admin/denuncias/resumo", headers=headers_admin)
        assert resp_resumo.status_code == 200, resp_resumo.text
        assert resp_resumo.json()["pendentes"] >= 1
        assert resp_resumo.json()["total"] >= 1

    def test_painel_admin_denuncias_disponivel_no_fluxo(
        self, client: TestClient, db_session: Session
    ):
        """
        Verifica as rotas administrativas de denúncias (#99/#107).
        """
        admin_email = f"admin.painel.{uuid.uuid4().hex[:8]}@rentalspouse.com"
        admin_senha = "AdminPainel@2026"
        admin = models.User(
            name="Admin Verificador Painel",
            email=admin_email,
            hashed_password=hash_senha(admin_senha),
            role=models.UserRole.ADMIN.value,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()

        resp_login = client.post(
            "/api/auth/login",
            json={"email": admin_email, "password": admin_senha},
        )
        assert resp_login.status_code == 200, resp_login.text
        headers_admin = {"Authorization": f"Bearer {resp_login.json()['access_token']}"}

        resp_admin_den = client.get("/api/admin/denuncias", headers=headers_admin)
        assert resp_admin_den.status_code == 200, resp_admin_den.text
        resp_resumo = client.get("/api/admin/denuncias/resumo", headers=headers_admin)
        assert resp_resumo.status_code == 200, resp_resumo.text
        resumo = resp_resumo.json()
        assert "total" in resumo and "pendentes" in resumo
