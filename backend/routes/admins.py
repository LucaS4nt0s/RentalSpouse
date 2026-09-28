from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import AdminCreate, AdminRead
from security import get_current_admin, hash_senha

router = APIRouter(prefix="/api/admins", tags=["Administradores"])


@router.post(
    "",
    response_model=AdminRead,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar novo administrador",
    description="Permite que um administrador autenticado cadastre um novo administrador no sistema.",
)
def create_admin(
    payload: AdminCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """
    Cadastra um novo administrador.

    Camada de segurança:
    - Exige token Bearer válido de um usuário que seja Administrador (`role='admin'`).
    - Caso contrário, a requisição é rejeitada com 401 ou 403.
    """
    email_normalizado = payload.email.strip().lower()
    existing_user = db.query(models.User).filter(models.User.email == email_normalizado).first()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um usuário cadastrado com este e-mail",
        )

    new_admin = models.User(
        name=payload.name.strip(),
        email=email_normalizado,
        hashed_password=hash_senha(payload.password),
        role=models.UserRole.ADMIN.value,
        is_active=True,
    )
    db.add(new_admin)
    try:
        db.commit()
        db.refresh(new_admin)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um usuário cadastrado com este e-mail",
        )

    return new_admin


@router.get(
    "",
    response_model=list[AdminRead],
    summary="Listar administradores",
    description="Retorna a lista de todos os administradores cadastrados na plataforma.",
)
def list_admins(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Retorna todos os administradores do sistema. Requer autenticação de administrador."""
    admins = db.query(models.User).filter(models.User.role == models.UserRole.ADMIN.value).all()
    return admins
