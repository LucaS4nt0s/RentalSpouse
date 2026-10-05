import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
import models

logger = logging.getLogger(__name__)

# Recomendação OWASP para PBKDF2-HMAC-SHA256 (>= 600.000 iterações)
ITERACOES_PBKDF2 = 600_000

# Configurações de ambiente e JWT
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
_jwt_secret_env = os.getenv("JWT_SECRET")

if _jwt_secret_env:
    JWT_SECRET = _jwt_secret_env
elif ENVIRONMENT == "production":
    raise RuntimeError("FATAL: A variável de ambiente JWT_SECRET é obrigatória em ambiente de produção!")
else:
    JWT_SECRET = "rentalspouse_dev_secret_key_change_in_production_123456789"
    logger.warning(
        "AVISO DE SEGURANÇA: JWT_SECRET não configurado. Utilizando segredo padrão de desenvolvimento. "
        "Defina JWT_SECRET no ambiente para produção!"
    )

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 horas

# Bearer token extractor (auto_error=False para fornecer mensagens amigáveis em português)
http_bearer = HTTPBearer(auto_error=False)


def hash_senha(senha: str) -> str:
    """
    Gera um hash seguro da senha utilizando PBKDF2-HMAC-SHA256 com salt aleatório.
    Formato do retorno: <salt_hex>$<hash_hex>
    """
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        senha.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=ITERACOES_PBKDF2,
    )
    return f"{salt}${key.hex()}"


def verificar_senha(senha: str, senha_hash: str) -> bool:
    """
    Verifica se a senha em texto plano corresponde ao hash armazenado.
    """
    try:
        salt, key_hex = senha_hash.split("$", 1)
        key = hashlib.pbkdf2_hmac(
            "sha256",
            senha.encode("utf-8"),
            salt.encode("utf-8"),
            iterations=ITERACOES_PBKDF2,
        )
        return secrets.compare_digest(key.hex(), key_hex)
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# Tokens de verificação de e-mail
# ---------------------------------------------------------------------------


def gerar_token_verificacao() -> str:
    """
    Gera um token opaco e de alta entropia para confirmação de e-mail.

    Utiliza 32 bytes (256 bits) de aleatoriedade criptográfica do módulo
    `secrets`, codificados em URL-safe base64 — seguro para trafegar em links
    de e-mail.
    """
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """
    Calcula o hash determinístico (SHA-256) de um token de verificação.

    O token NUNCA é persistido em claro: guardamos apenas o hash, de forma que
    um eventual vazamento do banco não permita a terceiros confirmar o e-mail
    de outros usuários. SHA-256 puro (sem salt) é adequado neste caso porque o
    token já possui 256 bits de entropia aleatória, diferentemente de uma senha
    escolhida por um humano. O determinismo também permite buscar o registro
    diretamente por índice no banco.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_confere(hash_armazenado: str, token_recebido: str) -> bool:
    """
    Compara, em tempo constante, o token recebido com o hash armazenado.
    """
    if not hash_armazenado or not token_recebido:
        return False
    return secrets.compare_digest(hash_armazenado, hash_token(token_recebido))


# ---------------------------------------------------------------------------
# Autenticação JWT e Usuários
# ---------------------------------------------------------------------------


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Gera um token JWT com expiração configurável."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decodifica e valida o token JWT."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def get_current_user(
    auth: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    """
    Dependency que extrai e valida o token Bearer da requisição.
    Retorna a entidade User autenticada.
    Esta dependência é estritamente de leitura (pura) para garantir idempotência
    e evitar race conditions de integridade (HTTP 500) em requisições paralelas.
    """
    if auth is None or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação não fornecido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(auth.credentials)
        email: str | None = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido: identificador de usuário ausente",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(models.User).filter(models.User.email == email).first()

    # Caso seja um cliente ou profissional sem registro prévio na tabela users, realiza fallback
    # puramente em memória (sem persistência no banco e sem colisão de sequence de ID)
    if user is None:
        cliente = db.query(models.Cliente).filter(models.Cliente.email == email).first()
        if cliente is not None and cliente.email_verificado:
            user = models.User(
                name=cliente.nome,
                email=cliente.email,
                hashed_password=cliente.senha_hash,
                role=models.UserRole.CLIENT.value,
                is_active=True,
                email_verificado=cliente.email_verificado,
                created_at=cliente.criado_em,
            )
        else:
            profissional = (
                db.query(models.Professional)
                .filter(models.Professional.email == email)
                .first()
            )
            if profissional is not None and profissional.is_active:
                user = models.User(
                    name=profissional.name,
                    email=profissional.email,
                    hashed_password=profissional.senha_hash or "",
                    role=models.UserRole.PROFESSIONAL.value,
                    is_active=profissional.is_active,
                    email_verificado=True,
                    created_at=profissional.created_at,
                )

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário inativo ou não encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_optional_current_user(
    auth: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> models.User | None:
    """
    Dependency que extrai e valida o token Bearer caso presente na requisição.
    Retorna a entidade User autenticada, ou None se a requisição não possuir credenciais.
    """
    if auth is None or not auth.credentials:
        return None

    try:
        payload = decode_access_token(auth.credentials)
        email: str | None = payload.get("sub")
        if email is None:
            return None
    except jwt.PyJWTError:
        return None

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None or not user.is_active:
        return None

    return user


def get_current_admin(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """
    Camada de segurança: garante que o usuário autenticado possui o papel de Administrador.
    Caso contrário, retorna HTTP 403 Forbidden.
    """
    if current_user.role != models.UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito: permissão de administrador necessária",
        )
    return current_user


def seed_initial_admin(db: Session) -> models.User | None:
    """
    Cria o primeiro administrador caso ainda não exista nenhum no banco de dados.
    Controlado pela variável SEED_INITIAL_ADMIN (padrão True em desenvolvimento, False em produção).
    """
    seed_enabled_default = "true" if ENVIRONMENT != "production" else "false"
    seed_enabled = os.getenv("SEED_INITIAL_ADMIN", seed_enabled_default).lower() in ("true", "1", "yes")

    if not seed_enabled:
        logger.info("Semeadura de administrador inicial desativada (SEED_INITIAL_ADMIN=false ou ambiente de produção).")
        return None

    admin_email = os.getenv("INITIAL_ADMIN_EMAIL", "admin@rentalspouse.com").strip().lower()
    existing_admin = db.query(models.User).filter(models.User.email == admin_email).first()
    if existing_admin is not None:
        return existing_admin

    admin_name = os.getenv("INITIAL_ADMIN_NAME", "Administrador Inicial").strip()
    admin_password = os.getenv("INITIAL_ADMIN_PASSWORD", "Admin@123456")

    initial_admin = models.User(
        name=admin_name,
        email=admin_email,
        hashed_password=hash_senha(admin_password),
        role=models.UserRole.ADMIN.value,
        is_active=True,
    )
    db.add(initial_admin)
    db.commit()
    db.refresh(initial_admin)
    logger.info("Administrador inicial semeado com sucesso: %s", admin_email)
    return initial_admin
