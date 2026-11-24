"""
Testes automatizados das Notificações e WebSockets em Tempo Real (Issue #34).

Valida persistência de notificações, filtro de leitura, marcação em lote,
autenticação por token no WebSocket e envio de eventos em tempo real.
"""

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

import models
from routes.notificacoes import registrar_e_enviar_notificacao
from security import create_access_token, hash_senha
from websocket_manager import ConnectionManager, ws_manager


@pytest.fixture
def usuario_notificacao(db_session: Session) -> models.User:
    user = models.User(
        name="Lucas Técnico",
        email="lucas.tecnico@exemplo.com",
        hashed_password=hash_senha("SenhaLucas@123"),
        role=models.UserRole.PROFESSIONAL.value,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


class TestNotificacoesRest:
    """Valida endpoints REST de consulta e atualização de notificações."""

    def test_listar_notificacoes_e_filtrar_nao_lidas(
        self, client: TestClient, usuario_notificacao: models.User, db_session: Session
    ):
        token = create_access_token({"sub": usuario_notificacao.email, "role": "professional"})
        headers = {"Authorization": f"Bearer {token}"}

        # Cria 2 notificações (uma lida e uma não lida)
        n1 = registrar_e_enviar_notificacao(
            db=db_session,
            user_email=usuario_notificacao.email,
            titulo="Primeiro Orçamento",
            mensagem="Mensagem 1",
            tipo="novo_orcamento",
            referencia_id=1,
        )
        n2 = registrar_e_enviar_notificacao(
            db=db_session,
            user_email=usuario_notificacao.email,
            titulo="Segundo Orçamento",
            mensagem="Mensagem 2",
            tipo="novo_orcamento",
            referencia_id=2,
        )
        n1.lida = True
        db_session.commit()

        # Lista todas
        res_todas = client.get("/api/notificacoes", headers=headers)
        assert res_todas.status_code == 200
        assert len(res_todas.json()) == 2

        # Filtra apenas não lidas
        res_nao_lidas = client.get("/api/notificacoes?nao_lidas=true", headers=headers)
        assert res_nao_lidas.status_code == 200
        corpo = res_nao_lidas.json()
        assert len(corpo) == 1
        assert corpo[0]["id"] == n2.id
        assert corpo[0]["lida"] is False

    def test_marcar_notificacao_como_lida(
        self, client: TestClient, usuario_notificacao: models.User, db_session: Session
    ):
        token = create_access_token({"sub": usuario_notificacao.email, "role": "professional"})
        headers = {"Authorization": f"Bearer {token}"}

        n = registrar_e_enviar_notificacao(
            db=db_session,
            user_email=usuario_notificacao.email,
            titulo="Alerta Teste",
            mensagem="Mensagem Teste",
            tipo="novo_orcamento",
        )
        assert n.lida is False

        res = client.patch(f"/api/notificacoes/{n.id}/lida", headers=headers)
        assert res.status_code == 200
        assert res.json()["lida"] is True

    def test_marcar_notificacao_inexistente_retorna_404(
        self, client: TestClient, usuario_notificacao: models.User
    ):
        token = create_access_token({"sub": usuario_notificacao.email, "role": "professional"})
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch("/api/notificacoes/99999/lida", headers=headers)
        assert res.status_code == 404

    def test_marcar_todas_como_lidas(
        self, client: TestClient, usuario_notificacao: models.User, db_session: Session
    ):
        token = create_access_token({"sub": usuario_notificacao.email, "role": "professional"})
        headers = {"Authorization": f"Bearer {token}"}

        for i in range(3):
            registrar_e_enviar_notificacao(
                db=db_session,
                user_email=usuario_notificacao.email,
                titulo=f"Notificação {i}",
                mensagem="Corpo",
                tipo="teste",
            )

        res = client.patch("/api/notificacoes/marcar-todas-lidas", headers=headers)
        assert res.status_code == 200
        assert res.json()["total"] >= 3


class TestWebSocketNotificacoes:
    """Valida o handshake e comunicação WebSocket em tempo real (Issue #34)."""

    def test_websocket_rejeita_sem_token(self, client: TestClient):
        with pytest.raises(Exception):
            with client.websocket_connect("/api/notificacoes/ws") as ws:
                pass

    def test_websocket_rejeita_token_invalido(self, client: TestClient):
        with pytest.raises(Exception):
            with client.websocket_connect("/api/notificacoes/ws?token=token_invalido_123") as ws:
                pass

    def test_websocket_conecta_com_sucesso_e_responde_ping(
        self, client: TestClient, usuario_notificacao: models.User
    ):
        token = create_access_token({"sub": usuario_notificacao.email, "role": "professional"})
        with client.websocket_connect(f"/api/notificacoes/ws?token={token}") as websocket:
            # 1. Recebe confirmação de boas-vindas
            mensagem_inicial = websocket.receive_json()
            assert mensagem_inicial["evento"] == "conectado"

            # 2. Envia ping e recebe pong
            websocket.send_text("ping")
            resposta = websocket.receive_text()
            assert resposta == "pong"

    def test_websocket_alias_rota(
        self, client: TestClient, usuario_notificacao: models.User
    ):
        token = create_access_token({"sub": usuario_notificacao.email, "role": "professional"})
        with client.websocket_connect(f"/api/ws/notificacoes?token={token}") as websocket:
            mensagem = websocket.receive_json()
            assert mensagem["evento"] == "conectado"

    def test_websocket_cliente_conecta_e_recebe_evento(
        self, client: TestClient, db_session: Session
    ):
        cliente_email = "cliente.ws@exemplo.com"
        token = create_access_token({"sub": cliente_email, "role": "client"})
        with client.websocket_connect(f"/api/ws/notificacoes?token={token}") as ws:
            msg_init = ws.receive_json()
            assert msg_init["evento"] == "conectado"

            # Dispara notificação de orçamento aceito para o cliente
            registrar_e_enviar_notificacao(
                db=db_session,
                user_email=cliente_email,
                titulo="Orçamento Aceito!",
                mensagem="Seu orçamento foi aceito.",
                tipo="orcamento_aceito",
                referencia_id=10,
                payload_extra={"status": "aceito", "orcamento_id": 10},
            )

            evento = ws.receive_json()
            assert evento["evento"] == "orcamento_aceito"
            assert evento["status"] == "aceito"
            assert evento["orcamento_id"] == 10



@pytest.mark.asyncio
class TestConnectionManagerUnit:
    """Testes unitários isolados para a classe ConnectionManager."""

    async def test_manager_gerencia_conexoes_e_limpa_desconectados(self):
        manager = ConnectionManager()
        from unittest.mock import AsyncMock, MagicMock

        mock_ws = MagicMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()

        email = "user@teste.com"
        await manager.connect(email, mock_ws)
        assert email in manager.active_connections
        assert len(manager.active_connections[email]) == 1

        # Envia mensagem
        enviados = await manager.send_personal_message({"msg": "olá"}, email)
        assert enviados == 1
        mock_ws.send_json.assert_called_once_with({"msg": "olá"})

        # Desconecta
        manager.disconnect(email, mock_ws)
        assert email not in manager.active_connections
