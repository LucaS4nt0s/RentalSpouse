"""
Dependência de acesso às rotas exclusivas do cliente autenticado (issue #68).

Responsabilidade única: transformar um usuário autenticado (Bearer token) na
entidade ORM `Cliente` correspondente, garantindo que:

1. o portador do token possui o papel `client` (caso contrário, 403);
2. existe um registro `Cliente` associado ao e-mail do token
   (caso contrário, 404 — cadastro de cliente ausente/inconsistente).

As rotas que dependem desta função nunca recebem o ID do cliente vindo do
payload: o autor de uma denúncia é sempre derivado do token, o que elimina
spoofing de autoria (e IDOR na leitura das próprias denúncias) por construção.

Observação de implementação: `get_current_user` pode devolver um `User` apenas
em memória (fallback documentado em `security.py`) para clientes autenticados
que existem só na tabela `clientes`. Por isso a resolução do dono dos recursos
é feita sempre por e-mail, na própria tabela `clientes`, e não pelo `id` do
`User` retornado.
"""

import models
from database import get_db
from fastapi import Depends, HTTPException, status
from security import get_current_user
from sqlalchemy.orm import Session


def get_current_cliente(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Cliente:
    """
    Dependency que valida o papel de cliente e devolve o `Cliente` dono do token.
    Levanta HTTP 403 (papel incorreto) ou HTTP 404 (e-mail sem cadastro de cliente).
    """
    if current_user.role != models.UserRole.CLIENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito: permissão de cliente necessária",
        )

    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.email == current_user.email)
        .first()
    )
    if cliente is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cadastro de cliente não encontrado para o usuário autenticado.",
        )

    return cliente
