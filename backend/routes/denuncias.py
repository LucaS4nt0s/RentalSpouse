"""
Rotas de denúncia contra profissionais (issue #68).

O cliente autenticado registra uma denúncia contra um profissional do diretório.
O autor é sempre derivado do token (`get_current_cliente` em
`backend/client_access.py`) — o payload não aceita `cliente_id`, o que elimina
spoofing de autoria por construção — e o alvo é validado na tabela
`professionals`.

Escopo desta entrega (visão do cliente):

- `POST /api/denuncias`    -> registra a denúncia (motivo catalogado + relato);
- `GET  /api/denuncias/me` -> lista as denúncias do próprio cliente.

A análise/moderação (painel do administrador, banimento) pertence à issue #23:
a denúncia nasce com `status = "pendente"` e nenhuma transição de status é
exposta por este módulo.
"""

from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

import models
import schemas
from client_access import get_current_cliente
from database import get_db

router = APIRouter(prefix="/api/denuncias", tags=["Denúncias"])


def _denuncia_read(
    denuncia: models.Denuncia,
    professional_name: Optional[str] = None,
) -> schemas.DenunciaRead:
    """Serializa uma denúncia para a visão do cliente autor."""
    return schemas.DenunciaRead(
        id=denuncia.id,
        cliente_id=denuncia.cliente_id,
        professional_id=denuncia.professional_id,
        professional_name=professional_name,
        motivo=denuncia.motivo,
        descricao=denuncia.descricao,
        status=denuncia.status,
        created_at=denuncia.created_at,
        updated_at=denuncia.updated_at,
    )


@router.post(
    "",
    response_model=schemas.DenunciaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Denunciar um profissional",
    description=(
        "Registra uma denúncia do cliente autenticado contra um profissional. "
        "Retorna 404 quando o profissional não existe, 409 quando o cadastro do "
        "profissional está inativo ou quando já existe uma denúncia em aberto do "
        "mesmo cliente para o mesmo profissional, e 422 para payload inválido."
    ),
)
def criar_denuncia(
    payload: schemas.DenunciaCreate,
    cliente: models.Cliente = Depends(get_current_cliente),
    db: Session = Depends(get_db),
):
    """
    Cria uma denúncia com autor derivado do token.

    Regras:
    - o profissional denunciado precisa existir (404) e estar ativo (409);
    - um cliente não pode manter duas denúncias em aberto para o mesmo
      profissional (409) — o objetivo é evitar spam/duplicidade acidental;
    - a denúncia nasce com `status = "pendente"`, aguardando a moderação (#23).
    """
    professional = (
        db.query(models.Professional)
        .filter(models.Professional.id == payload.professional_id)
        .first()
    )
    if professional is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional não encontrado.",
        )

    if not professional.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível denunciar um profissional com o cadastro inativo.",
        )

    denuncia_em_aberto = (
        db.query(models.Denuncia)
        .filter(
            models.Denuncia.cliente_id == cliente.id,
            models.Denuncia.professional_id == professional.id,
            models.Denuncia.status.in_(models.DENUNCIA_STATUS_EM_ABERTO),
        )
        .first()
    )
    if denuncia_em_aberto is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Você já possui uma denúncia em aberto para este profissional. "
                "Aguarde a análise da equipe de moderação."
            ),
        )

    denuncia = models.Denuncia(
        cliente_id=cliente.id,
        professional_id=professional.id,
        motivo=payload.motivo,
        descricao=payload.descricao,
        status=models.DenunciaStatus.PENDENTE.value,
    )
    db.add(denuncia)
    db.commit()
    db.refresh(denuncia)

    return _denuncia_read(denuncia, professional.name)


@router.get(
    "/me",
    response_model=List[schemas.DenunciaRead],
    summary="Listar minhas denúncias",
    description=(
        "Retorna as denúncias registradas pelo próprio cliente autenticado, das "
        "mais recentes para as mais antigas. Nenhuma denúncia de terceiros é "
        "retornada (escopo derivado do token)."
    ),
)
def listar_minhas_denuncias(
    skip: int = Query(0, ge=0, description="Quantidade de registros a ignorar."),
    limit: int = Query(50, ge=1, le=100, description="Máximo de registros retornados."),
    cliente: models.Cliente = Depends(get_current_cliente),
    db: Session = Depends(get_db),
):
    """Lista as denúncias do cliente dono do token, da mais recente para a mais antiga."""
    linhas: List[Tuple[models.Denuncia, Optional[str]]] = (
        db.query(models.Denuncia, models.Professional.name)
        .join(
            models.Professional,
            models.Professional.id == models.Denuncia.professional_id,
            isouter=True,
        )
        .filter(models.Denuncia.cliente_id == cliente.id)
        .order_by(models.Denuncia.created_at.desc(), models.Denuncia.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [_denuncia_read(denuncia, nome) for denuncia, nome in linhas]
