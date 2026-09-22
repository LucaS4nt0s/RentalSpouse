import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
import models

# Configurações de JWT a partir de variáveis de ambiente com fallback seguro para dev
JWT_SECRET = os.getenv("JWT_SECRET", "rentalspouse_dev_secret_key_change_in_production_123456789")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 horas

# Bearer token extractor (auto_error=False para fornecer mensagens amigáveis em português)
http_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Gera o hash seguro da senha em texto plano usando bcrypt com salt aleatório."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha em texto plano confere com o hash armazenado."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


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

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário inativo ou não encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )

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
    Utiliza variáveis de ambiente ou valores padrão de desenvolvimento.
    """
    existing_admin = db.query(models.User).filter(models.User.role == models.UserRole.ADMIN.value).first()
    if existing_admin is not None:
        return existing_admin

    admin_name = os.getenv("INITIAL_ADMIN_NAME", "Administrador Inicial")
    admin_email = os.getenv("INITIAL_ADMIN_EMAIL", "admin@rentalspouse.com")
    admin_password = os.getenv("INITIAL_ADMIN_PASSWORD", "Admin@123456")

    initial_admin = models.User(
        name=admin_name,
        email=admin_email,
        hashed_password=hash_password(admin_password),
        role=models.UserRole.ADMIN.value,
        is_active=True,
    )
    db.add(initial_admin)
    db.commit()
    db.refresh(initial_admin)
    return initial_admin
