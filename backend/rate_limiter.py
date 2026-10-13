"""
Rate Limiter em memória por Sliding Window para proteção de rotas públicas (OWASP API4:2023).

Implementa limitação de taxa baseada em IP / identificador de usuário para prevenir DoS,
raspagem não autorizada (scraping) e abuso de chamadas concorrentes.

Decisão arquitetural: Utiliza exclusivamente a biblioteca padrão (collections, time, threading)
garantindo portabilidade sem adicionar dependências externas ao requirements.txt.
"""

from collections import defaultdict, deque
import threading
import time
from typing import Dict, Optional

from fastapi import HTTPException, Request, status


class SlidingWindowRateLimiter:
    """Controlador de taxa baseado em janela deslizante com sincronização thread-safe."""

    def __init__(self):
        self._lock = threading.Lock()
        # Armazena timestamps (float) por chave: deque com popleft()
        self._records: Dict[str, deque] = defaultdict(deque)

    def check(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        error_detail: Optional[str] = None,
    ) -> None:
        """
        Verifica se a chave excedeu o limite dentro da janela de tempo.
        Se excedeu, levanta HTTPException com status 429 e cabeçalho Retry-After.
        """
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            queue = self._records[key]

            # Remove registros fora da janela deslizante
            while queue and queue[0] < cutoff:
                queue.popleft()

            if len(queue) >= limit:
                oldest = queue[0]
                retry_after = max(1, int(window_seconds - (now - oldest)))
                detail = (
                    error_detail
                    or f"Muitas requisições originadas deste endereço IP. Tente novamente em {retry_after} segundos."
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=detail,
                    headers={"Retry-After": str(retry_after)},
                )

            queue.append(now)

    def reset(self) -> None:
        """Limpa o histórico de requisições. Útil principalmente para isolamento em testes."""
        with self._lock:
            self._records.clear()


# Instância global do Rate Limiter
_limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extrai o endereço IP do cliente considerando proxies reversos e cabeçalhos X-Forwarded-For."""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def check_search_rate_limit(request: Request) -> None:
    """
    Aplica rate limiting de busca pública: 60 requisições por minuto por IP.
    """
    client_ip = get_client_ip(request)
    _limiter.check(
        key=f"search:{client_ip}",
        limit=60,
        window_seconds=60,
        error_detail="Muitas requisições de busca originadas deste endereço IP. Tente novamente em 60 segundos.",
    )


def check_contact_rate_limit(request: Request, client_identifier: Optional[str] = None) -> None:
    """
    Aplica rate limiting de contato / orçamento: 5 requisições por hora por IP / usuário.
    """
    identifier = client_identifier or get_client_ip(request)
    _limiter.check(
        key=f"contact:{identifier}",
        limit=5,
        window_seconds=3600,
        error_detail="Muitas solicitações de contato enviadas recentemente. Tente novamente mais tarde.",
    )


def reset_rate_limits() -> None:
    """Redefine o histórico de rate limits (usado em testes automatizados)."""
    _limiter.reset()
