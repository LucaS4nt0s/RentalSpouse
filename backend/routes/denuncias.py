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
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

import models
import schemas
from client_access import get_current_cliente
from database import get_db
from security import get_current_admin

router = APIRouter(prefix="/api/denuncias", tags=["Denúncias"])
admin_router = APIRouter(prefix="/api/admin/denuncias", tags=["Moderação de Denúncias"])
admins_alias_router = APIRouter(
    prefix="/api/admins/denuncias",
    tags=["Moderação de Denúncias"],
    include_in_schema=False,
)


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


# ---------------------------------------------------------------------------
# Rotas administrativas de consulta e resumo de denúncias (Issues #99 / #23)
# ---------------------------------------------------------------------------


def _denuncia_admin_read(
    denuncia: models.Denuncia,
    cliente: Optional[models.Cliente],
    professional: Optional[models.Professional],
    total_por_profissional: int,
) -> schemas.DenunciaAdminRead:
    """Serializa uma denúncia enriquecida para o painel administrativo."""
    return schemas.DenunciaAdminRead(
        id=denuncia.id,
        motivo=denuncia.motivo,
        descricao=denuncia.descricao,
        status=denuncia.status,
        created_at=denuncia.created_at,
        updated_at=denuncia.updated_at,
        cliente_id=denuncia.cliente_id,
        cliente_nome=cliente.nome if cliente else None,
        cliente_email=cliente.email if cliente else None,
        professional_id=denuncia.professional_id,
        professional_name=professional.name if professional else None,
        professional_email=professional.email if professional else None,
        professional_is_active=bool(professional.is_active) if professional else False,
        professional_total_denuncias=total_por_profissional,
        total_denuncias_profissional=total_por_profissional,
    )


def _executar_resumo_denuncias_admin(db: Session) -> schemas.DenunciaAdminResumoRead:
    """Calcula os contadores consolidados de denúncias por status."""
    linhas = (
        db.query(models.Denuncia.status, func.count(models.Denuncia.id))
        .group_by(models.Denuncia.status)
        .all()
    )
    contagem = {status_nome: int(qtd) for status_nome, qtd in linhas}

    pendentes = contagem.get(models.DenunciaStatus.PENDENTE.value, 0)
    em_analise = contagem.get(models.DenunciaStatus.EM_ANALISE.value, 0)
    resolvidas_banimento = contagem.get(models.DenunciaStatus.RESOLVIDA.value, 0)
    rejeitadas = contagem.get(models.DenunciaStatus.ARQUIVADA.value, 0) + contagem.get(
        "rejeitada", 0
    )
    total = sum(contagem.values())

    return schemas.DenunciaAdminResumoRead(
        total=total,
        pendentes=pendentes,
        em_analise=em_analise,
        resolvidas_banimento=resolvidas_banimento,
        rejeitadas=rejeitadas,
        arquivadas=rejeitadas,
    )


def _escape_like(val: str) -> str:
    """Escapa caracteres especiais do SQL LIKE/ILIKE (\\, %, _) para busca literal."""
    return val.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _executar_listagem_denuncias_admin(
    db: Session,
    status_filter: Optional[str],
    motivo: Optional[str],
    q: Optional[str],
    skip: int,
    limit: int,
) -> List[schemas.DenunciaAdminRead]:
    """Lista denúncias para moderação com filtros, ordenação prioritária e contagem em lote."""
    query = (
        db.query(models.Denuncia, models.Cliente, models.Professional)
        .outerjoin(models.Cliente, models.Cliente.id == models.Denuncia.cliente_id)
        .outerjoin(
            models.Professional, models.Professional.id == models.Denuncia.professional_id
        )
    )

    if status_filter:
        status_limpo = status_filter.strip().lower()
        if status_limpo and status_limpo not in ("all", "todas"):
            if status_limpo in ("arquivada", "rejeitada", "arquivadas", "rejeitadas"):
                query = query.filter(
                    models.Denuncia.status.in_(
                        [models.DenunciaStatus.ARQUIVADA.value, "rejeitada"]
                    )
                )
            elif status_limpo in ("pendente", "pendentes"):
                query = query.filter(
                    models.Denuncia.status == models.DenunciaStatus.PENDENTE.value
                )
            elif status_limpo in ("resolvida", "resolvidas"):
                query = query.filter(
                    models.Denuncia.status == models.DenunciaStatus.RESOLVIDA.value
                )
            else:
                query = query.filter(models.Denuncia.status == status_limpo)

    if motivo:
        motivo_limpo = motivo.strip().lower()
        if motivo_limpo and motivo_limpo not in ("all", "todos", "todas"):
            query = query.filter(models.Denuncia.motivo == motivo_limpo)

    if q and q.strip():
        termo = f"%{_escape_like(q.strip())}%"
        query = query.filter(
            or_(
                models.Professional.name.ilike(termo, escape="\\"),
                models.Professional.email.ilike(termo, escape="\\"),
                models.Cliente.nome.ilike(termo, escape="\\"),
                models.Cliente.email.ilike(termo, escape="\\"),
                models.Denuncia.descricao.ilike(termo, escape="\\"),
            )
        )

    prioridade_status = case(
        (models.Denuncia.status == models.DenunciaStatus.PENDENTE.value, 0),
        (models.Denuncia.status == models.DenunciaStatus.EM_ANALISE.value, 1),
        else_=2,
    )

    linhas = (
        query.order_by(
            prioridade_status.asc(),
            models.Denuncia.created_at.desc(),
            models.Denuncia.id.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    prof_ids = list({denuncia.professional_id for denuncia, _, _ in linhas})
    totais_por_prof: dict[int, int] = {}
    if prof_ids:
        contagens = (
            db.query(models.Denuncia.professional_id, func.count(models.Denuncia.id))
            .filter(models.Denuncia.professional_id.in_(prof_ids))
            .group_by(models.Denuncia.professional_id)
            .all()
        )
        totais_por_prof = {int(pid): int(qtd) for pid, qtd in contagens}

    return [
        _denuncia_admin_read(
            denuncia,
            cliente,
            professional,
            totais_por_prof.get(denuncia.professional_id, 0),
        )
        for denuncia, cliente, professional in linhas
    ]


@admin_router.get(
    "/resumo",
    response_model=schemas.DenunciaAdminResumoRead,
    summary="Resumo de denúncias para o painel administrativo",
)
@admins_alias_router.get(
    "/resumo",
    response_model=schemas.DenunciaAdminResumoRead,
    include_in_schema=False,
)
@router.get(
    "/admin/resumo",
    response_model=schemas.DenunciaAdminResumoRead,
    include_in_schema=False,
)
def obter_resumo_denuncias_admin(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Retorna contadores consolidados de denúncias por status para os cards do admin."""
    return _executar_resumo_denuncias_admin(db)


@admin_router.get(
    "",
    response_model=List[schemas.DenunciaAdminRead],
    summary="Listar denúncias no painel administrativo",
)
@admins_alias_router.get(
    "",
    response_model=List[schemas.DenunciaAdminRead],
    include_in_schema=False,
)
@router.get(
    "/admin",
    response_model=List[schemas.DenunciaAdminRead],
    include_in_schema=False,
)
def listar_denuncias_admin(
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filtro de status (pendente, em_analise, resolvida, arquivada, rejeitada, all)",
    ),
    motivo: Optional[str] = Query(None, description="Filtro de motivo catalogado"),
    q: Optional[str] = Query(
        None, description="Busca por nome ou e-mail do profissional/cliente ou descrição"
    ),
    skip: int = Query(0, ge=0, description="Registros a pular."),
    limit: int = Query(50, ge=1, le=100, description="Máximo de registros retornados."),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Lista todas as denúncias da plataforma para análise do administrador."""
    return _executar_listagem_denuncias_admin(
        db=db,
        status_filter=status_filter,
        motivo=motivo,
        q=q,
        skip=skip,
        limit=limit,
    )
