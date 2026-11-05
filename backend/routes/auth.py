from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
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
    """
    Realiza a autenticação de usuários, administradores, clientes e profissionais.

    Nota de Segurança (Trade-off de Enumeração):
    A validação da senha SEMPRE precede a verificação de flags adicionais (ex.: email_verificado).
    Se o e-mail existir mas a senha estiver incorreta, o endpoint responde estritamente com
    HTTP 401 Unauthorized, impedindo que invasores descubram se um e-mail possui pendência
    de confirmação sem conhecer as credenciais válidas da conta.
    """
    email = payload.email  # Já normalizado pelo validator do LoginRequest
    user = db.query(models.User).filter(models.User.email == email).first()
    senha_valida = False

    # Se não encontrado na tabela de users, verifica na tabela de clientes ou profissionais
    if user is None:
        cliente = db.query(models.Cliente).filter(models.Cliente.email == email).first()
        if cliente is not None:
            # 1. Valida a senha contra o hash do cliente
            if not verificar_senha(payload.password, cliente.senha_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Credenciais inválidas: e-mail ou senha incorretos",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # 2. Bloqueia o login caso o e-mail não tenha sido confirmado via link
            if not cliente.email_verificado:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="E-mail pendente de confirmação. Por favor, verifique sua caixa de entrada.",
                )

            # 3. Sincroniza com a tabela de usuários para unificar autenticação
            user = models.User(
                name=cliente.nome,
                email=cliente.email,
                hashed_password=cliente.senha_hash,
                role=models.UserRole.CLIENT.value,
                is_active=True,
                email_verificado=cliente.email_verificado,
                created_at=cliente.criado_em,
            )
            try:
                db.add(user)
                db.commit()
                db.refresh(user)
            except IntegrityError:
                db.rollback()
                user = db.query(models.User).filter(models.User.email == email).first()

            # Evita custo duplo de PBKDF2 (600.000 iterações já executadas na validação acima)
            senha_valida = True
        else:
            # Verifica se é um profissional cadastrado
            profissional = (
                db.query(models.Professional)
                .filter(models.Professional.email == email)
                .first()
            )
            if profissional is not None and profissional.senha_hash:
                if not verificar_senha(payload.password, profissional.senha_hash):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Credenciais inválidas: e-mail ou senha incorretos",
                        headers={"WWW-Authenticate": "Bearer"},
                    )

                if not profissional.is_active:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Conta desativada",
                        headers={"WWW-Authenticate": "Bearer"},
                    )

                # Sincroniza profissional com a tabela users
                user = models.User(
                    name=profissional.name,
                    email=profissional.email,
                    hashed_password=profissional.senha_hash,
                    role=models.UserRole.PROFESSIONAL.value,
                    is_active=profissional.is_active,
                    email_verificado=True,
                    created_at=profissional.created_at,
                )
                try:
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                except IntegrityError:
                    db.rollback()
                    user = db.query(models.User).filter(models.User.email == email).first()

                senha_valida = True
            else:
                verificar_senha(payload.password, _DUMMY_HASH)
                senha_valida = False
    else:
        # Usuário já existe na tabela users: valida credenciais
        if not verificar_senha(payload.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas: e-mail ou senha incorretos",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Se for cliente, bloqueia caso o e-mail não tenha sido confirmado
        if user.role == models.UserRole.CLIENT.value:
            cliente = db.query(models.Cliente).filter(models.Cliente.email == email).first()
            if cliente is not None and not cliente.email_verificado:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="E-mail pendente de confirmação. Por favor, verifique sua caixa de entrada.",
                )

        # Se for profissional, valida status na tabela de profissionais
        if user.role == models.UserRole.PROFESSIONAL.value:
            profissional = (
                db.query(models.Professional)
                .filter(models.Professional.email == email)
                .first()
            )
            if profissional is not None and not profissional.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Conta desativada",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        senha_valida = True

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
def get_me(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna os dados cadastrais do usuário autenticado atual, com reflexão fiel de status."""
    if current_user.role == models.UserRole.CLIENT.value:
        cliente = db.query(models.Cliente).filter(models.Cliente.email == current_user.email).first()
        if cliente is not None:
            current_user.email_verificado = cliente.email_verificado
    return current_user
