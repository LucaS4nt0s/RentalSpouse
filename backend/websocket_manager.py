"""
Gerenciador de conexões WebSocket para notificações em tempo real (Issue #34).

Permite que profissionais e clientes conectados recebam alertas instantâneos
(ex: 'novo_orcamento', 'orcamento_respondido') sem necessidade de polling ou
dependências externas como Redis/RabbitMQ.
"""

import logging
from typing import Dict, Set

from fastapi import WebSocket

logger = logging.getLogger("rentalspouse.websocket")


class ConnectionManager:
    """Gerencia conexões ativas de WebSocket agrupadas por e-mail de usuário."""

    def __init__(self) -> None:
        # Mapeia email (normalizado em minúsculas) -> conjunto de conexões ativas
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, email: str, websocket: WebSocket) -> None:
        """Aceita o handshake WebSocket e armazena a conexão sob o e-mail do usuário."""
        await websocket.accept()
        key = email.strip().lower()
        if key not in self.active_connections:
            self.active_connections[key] = set()
        self.active_connections[key].add(websocket)
        logger.info("WebSocket conectado para '%s'. Total conexões ativas: %d", key, len(self.active_connections[key]))

    def disconnect(self, email: str, websocket: WebSocket) -> None:
        """Remove a conexão fechada do pool."""
        key = email.strip().lower()
        if key in self.active_connections:
            self.active_connections[key].discard(websocket)
            if not self.active_connections[key]:
                del self.active_connections[key]
        logger.info("WebSocket desconectado para '%s'.", key)

    async def send_personal_message(self, message: dict, email: str) -> int:
        """
        Envia mensagem JSON para todas as sessões ativas do usuário.
        Retorna o número de sockets que receberam a mensagem com sucesso.
        Descarta silenciosamente conexões mortas.
        """
        key = email.strip().lower()
        if key not in self.active_connections:
            logger.debug("Nenhuma conexão WebSocket ativa para '%s'.", key)
            return 0

        sockets = list(self.active_connections[key])
        dead_sockets: Set[WebSocket] = set()
        enviados = 0

        for ws in sockets:
            try:
                await ws.send_json(message)
                enviados += 1
            except Exception as exc:
                logger.warning("Falha ao enviar mensagem WebSocket para '%s': %s", key, exc)
                dead_sockets.add(ws)

        for dead in dead_sockets:
            self.disconnect(key, dead)

        return enviados

    async def broadcast(self, message: dict) -> int:
        """Envia mensagem para todos os usuários conectados no sistema."""
        enviados = 0
        for email, sockets in list(self.active_connections.items()):
            dead_sockets: Set[WebSocket] = set()
            for ws in list(sockets):
                try:
                    await ws.send_json(message)
                    enviados += 1
                except Exception:
                    dead_sockets.add(ws)
            for dead in dead_sockets:
                self.disconnect(email, dead)
        return enviados


# Instância global reutilizada pela aplicação
ws_manager = ConnectionManager()
