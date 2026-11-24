"""
Dependência de acesso à área restrita do profissional autenticado (issue #55).

Responsabilidade única: transformar um usuário autenticado (Bearer token) na
entidade ORM `Professional` correspondente, garantindo que:

1. o portador do token possui o papel `professional` (caso contrário, 403);
2. existe um registro `Professional` associado ao e-mail do token
   (caso contrário, 404 — o perfil pode ainda não ter sido concluído);
3. o registro está ativo (caso contrário, 403).

As rotas que dependem desta função nunca recebem um ID de profissional vindo
do cliente: o dono dos recursos é sempre derivado do token, o que elimina
IDOR (acesso a dados de terceiros) por construção.
"""

import models
from database import get_db
from fastapi import Depends, HTTPException, status
from security import get_current_user
from sqlalchemy.orm import Session


def get_current_professional(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Professional:
    """
    Dependency que valida o papel de profissional e devolve o `Professional`
    dono do token. Levanta HTTP 403 (papel incorreto ou perfil inativo) ou
    HTTP 404 (e-mail sem perfil de profissional).
    """
    if current_user.role != models.UserRole.PROFESSIONAL.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito: permissão de profissional necessária",
        )

    professional = (
        db.query(models.Professional)
        .filter(models.Professional.email == current_user.email)
        .first()
    )
    if professional is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de profissional não encontrado para o usuário autenticado.",
        )

    if not professional.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Perfil de profissional inativo.",
        )

    return professional
