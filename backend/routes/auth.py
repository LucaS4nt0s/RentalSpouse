from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import LoginRequest, TokenResponse, UserRead
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
    """Realiza a autenticação de usuários, administradores e clientes."""
    email = payload.email  # Já normalizado pelo validator do LoginRequest
    user = db.query(models.User).filter(models.User.email == email).first()

    # Se não encontrado na tabela de users, verifica na tabela de clientes
    if user is None:
        cliente = db.query(models.Cliente).filter(models.Cliente.email == email).first()
        if cliente is not None:
            senha_valida = verificar_senha(payload.password, cliente.senha_hash)
            if not senha_valida:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Credenciais inválidas: e-mail ou senha incorretos",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            # Sincroniza com a tabela de usuários para unificar autenticação
            user = models.User(
                name=cliente.nome,
                email=cliente.email,
                hashed_password=cliente.senha_hash,
                role=models.UserRole.CLIENT.value,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

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
    return TokenResponse(access_token=token, token_type="bearer", user=user)


@router.get(
    "/me",
    response_model=UserRead,
    summary="Obter perfil autenticado",
    description="Retorna os dados do usuário atualmente autenticado.",
)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Retorna os dados cadastrais do usuário autenticado atual."""
    return current_user
