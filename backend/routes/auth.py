from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import AdminRead, LoginRequest, TokenResponse
from security import (
    create_access_token,
    get_current_user,
    verificar_senha,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])


# Hash fictício pré-calculado com PBKDF2 (600.000 iterações) para atenuar timing attacks
_DUMMY_HASH = (
    "00000000000000000000000000000000$"
    "0000000000000000000000000000000000000000000000000000000000000000"
)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login de usuário",
    description="Autentica um usuário via e-mail e senha, retornando um token de acesso JWT.",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Realiza a autenticação de usuários e administradores."""
    email_normalizado = payload.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email_normalizado).first()

    senha_valida = (
        verificar_senha(payload.password, user.hashed_password)
        if user
        else verificar_senha(payload.password, _DUMMY_HASH)
    )

    if user is None or not senha_valida:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas: e-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Conta desativada",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": user.email, "role": user.role})
    return TokenResponse(access_token=token, token_type="bearer")


@router.get(
    "/me",
    response_model=AdminRead,
    summary="Obter perfil autenticado",
    description="Retorna os dados do usuário atualmente autenticado.",
)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Retorna os dados cadastrais do usuário autenticado atual."""
    return current_user
