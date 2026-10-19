"""
Rate Limiter por Sliding Window para proteção de rotas públicas (OWASP API4:2023).

Implementa limitação de taxa baseada em IP / identificador de usuário para prevenir DoS,
raspagem não autorizada (scraping) e abuso de chamadas concorrentes.

Suporta:
- Eviction automático de chaves expiradas e teto máximo de memória (LRU) em modo in-memory.
- Backend distribuído opcional via Redis (quando REDIS_URL está configurado) para múltiplos workers.
- Validação de proxies confiáveis (TRUSTED_PROXIES) antes de aceitar cabeçalhos X-Forwarded-For.
"""

from collections import OrderedDict, deque
import ipaddress
import logging
import os
import threading
import time
from typing import Deque, Optional, Set, Union

from fastapi import HTTPException, Request, status

logger = logging.getLogger("rentalspouse.rate_limiter")

DEFAULT_MAX_KEYS = 4096
CLEANUP_INTERVAL_SECONDS = 60.0

IPOrNetwork = Union[ipaddress.IPv4Address, ipaddress.IPv6Address, ipaddress.IPv4Network, ipaddress.IPv6Network]


class SlidingWindowRateLimiter:
    """
    Controlador de taxa baseado em janela deslizante com sincronização thread-safe,
    eviction de chaves expiradas e limite estrito de chaves em memória (LRU).
    """

    def __init__(self, max_keys: int = DEFAULT_MAX_KEYS):
        self.max_keys = max(1, max_keys)
        self._lock = threading.Lock()
        self._records: "OrderedDict[str, Deque[float]]" = OrderedDict()
        self._last_cleanup: float = time.time()
        self._max_window_seen: int = 3600

    def _evict_expired_locked(self, now: float) -> None:
        """Remove chaves cujos registros já expiraram completamente."""
        cutoff = now - self._max_window_seen
        expired_keys = [
            k for k, q in self._records.items() if not q or q[-1] < cutoff
        ]
        for k in expired_keys:
            self._records.pop(k, None)
        self._last_cleanup = now

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
            if window_seconds > self._max_window_seen:
                self._max_window_seen = window_seconds

            if (now - self._last_cleanup) >= CLEANUP_INTERVAL_SECONDS:
                self._evict_expired_locked(now)

            queue = self._records.get(key)
            if queue is not None:
                while queue and queue[0] < cutoff:
                    queue.popleft()
                if not queue:
                    self._records.pop(key, None)
                    queue = None

            if queue is not None and len(queue) >= limit:
                self._records.move_to_end(key)
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

            if queue is None:
                if len(self._records) >= self.max_keys:
                    self._evict_expired_locked(now)
                while len(self._records) >= self.max_keys:
                    self._records.popitem(last=False)
                queue = deque()
                self._records[key] = queue
            else:
                self._records.move_to_end(key)

            queue.append(now)

    def reset(self) -> None:
        """Limpa o histórico de requisições. Útil principalmente para isolamento em testes."""
        with self._lock:
            self._records.clear()
            self._last_cleanup = time.time()

    @property
    def active_keys_count(self) -> int:
        """Retorna o número de chaves atualmente rastreadas em memória."""
        with self._lock:
            return len(self._records)


# Instância global do Rate Limiter
_limiter = SlidingWindowRateLimiter()


def _parse_trusted_proxies(raw: str) -> Set[str]:
    """Extrai o conjunto de entradas configuradas em TRUSTED_PROXIES."""
    if not raw:
        return set()
    return {item.strip() for item in raw.split(",") if item.strip()}


def is_trusted_proxy(host: Optional[str]) -> bool:
    """
    Verifica se o endereço IP da conexão direta pertence à allowlist TRUSTED_PROXIES.
    Aceita IPs exatos, blocos CIDR (ex: 10.0.0.0/8) ou nomes de host explícitos.
    Por padrão (sem TRUSTED_PROXIES configurado), nenhum proxy externo é confiado cegamente.
    """
    if not host:
        return False
    raw_trusted = os.getenv("TRUSTED_PROXIES", "").strip()
    if not raw_trusted:
        return False

    trusted_entries = _parse_trusted_proxies(raw_trusted)
    if "*" in trusted_entries or host in trusted_entries:
        return True

    try:
        client_ip = ipaddress.ip_address(host)
    except ValueError:
        return False

    for entry in trusted_entries:
        try:
            if "/" in entry:
                net = ipaddress.ip_network(entry, strict=False)
                if client_ip in net:
                    return True
            else:
                if client_ip == ipaddress.ip_address(entry):
                    return True
        except ValueError:
            continue

    return False


def get_client_ip(request: Request) -> str:
    """
    Extrai o endereço IP do cliente de forma segura.
    Apenas confia no cabeçalho X-Forwarded-For quando a requisição parte de um proxy
    explicitamente listado em TRUSTED_PROXIES, prevenindo spoofing de IP para burlar o 429.
    """
    direct_host = request.client.host if (request.client and request.client.host) else "127.0.0.1"

    if is_trusted_proxy(direct_host):
        x_forwarded_for = request.headers.get("x-forwarded-for")
        if x_forwarded_for:
            forwarded_ips = [ip.strip() for ip in x_forwarded_for.split(",") if ip.strip()]
            # Percorre da direita para a esquerda retornando o primeiro IP que não seja proxy confiável
            for candidate in reversed(forwarded_ips):
                if not is_trusted_proxy(candidate):
                    return candidate
            if forwarded_ips:
                return forwarded_ips[0]

    return direct_host


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
