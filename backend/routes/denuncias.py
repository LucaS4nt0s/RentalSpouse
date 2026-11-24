"""
Rotas de denúncia contra profissionais (issue #68).

O cliente autenticado registra uma denúncia contra um profissional do diretório.
O autor é sempre derivado do token (`get_current_cliente` em
`backend/client_access.py`) — o payload não aceita `cliente_id`, o que elimina
spoofing de autoria por construção — e o alvo é validado na tabela
`professionals`.

Escopo desta entrega:

- visão do cliente: `POST /api/denuncias` (registra) e `GET /api/denuncias/me`
  (lista as próprias denúncias);
- visão do administrador (issues #23 / #99): `GET /api/admin/denuncias`
  (listagem com filtros), `GET /api/admin/denuncias/resumo` (contadores) e
  `PATCH /api/admin/denuncias/{id}/moderar` (arquivar, banir/suspender ou
  reativar o profissional, com parecer e auditoria).

O cliente nunca transiciona status; toda decisão administrativa passa pelo
endpoint de moderação, que exige papel `admin`.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

import models
import schemas
from client_access import get_current_cliente
from database import get_db
from routes.notificacoes import registrar_e_enviar_notificacao
from security import get_current_admin

logger = logging.getLogger("rentalspouse.denuncias")

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
    moderador_nome: Optional[str] = None,
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
        moderacao_acao=denuncia.moderacao_acao,
        moderacao_parecer=denuncia.moderacao_parecer,
        moderado_em=denuncia.moderado_em,
        moderado_por_id=denuncia.moderado_por_id,
        moderado_por_nome=moderador_nome,
    )


def _obter_denuncia_admin(
    db: Session,
    denuncia_id: int,
    moderador_nome: Optional[str] = None,
) -> Optional[schemas.DenunciaAdminRead]:
    """Carrega uma denúncia já enriquecida para a resposta da decisão de moderação."""
    linha = (
        db.query(models.Denuncia, models.Cliente, models.Professional)
        .outerjoin(models.Cliente, models.Cliente.id == models.Denuncia.cliente_id)
        .outerjoin(
            models.Professional, models.Professional.id == models.Denuncia.professional_id
        )
        .filter(models.Denuncia.id == denuncia_id)
        .first()
    )
    if linha is None:
        return None

    denuncia, cliente, professional = linha
    total = (
        db.query(func.count(models.Denuncia.id))
        .filter(models.Denuncia.professional_id == denuncia.professional_id)
        .scalar()
        or 0
    )

    if moderador_nome is None and denuncia.moderado_por_id:
        moderador = (
            db.query(models.User)
            .filter(models.User.id == denuncia.moderado_por_id)
            .first()
        )
        moderador_nome = moderador.name if moderador else None

    return _denuncia_admin_read(
        denuncia, cliente, professional, int(total), moderador_nome
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
        termo = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.Professional.name.ilike(termo),
                models.Professional.email.ilike(termo),
                models.Cliente.nome.ilike(termo),
                models.Cliente.email.ilike(termo),
                models.Denuncia.descricao.ilike(termo),
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

    moderador_ids = {
        denuncia.moderado_por_id
        for denuncia, _, _ in linhas
        if denuncia.moderado_por_id is not None
    }
    nomes_moderadores: dict[int, str] = {}
    if moderador_ids:
        moderadores = (
            db.query(models.User.id, models.User.name)
            .filter(models.User.id.in_(moderador_ids))
            .all()
        )
        nomes_moderadores = {int(uid): nome for uid, nome in moderadores}

    return [
        _denuncia_admin_read(
            denuncia,
            cliente,
            professional,
            totais_por_prof.get(denuncia.professional_id, 0),
            nomes_moderadores.get(denuncia.moderado_por_id),
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


# ---------------------------------------------------------------------------
# Decisão de moderação: arquivar, banir/suspender e reativar (issue #99, Fatia 2)
# ---------------------------------------------------------------------------


def _garantir_denuncia_em_aberto(denuncia: models.Denuncia) -> None:
    """Recusa (409) uma nova decisão sobre denúncia que já possui decisão registrada."""
    if denuncia.status not in models.DENUNCIA_STATUS_EM_ABERTO:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Esta denúncia já possui uma decisão registrada "
                f"(situação atual: {denuncia.status}). Reative o profissional "
                "para reabrir a análise antes de aplicar outra decisão."
            ),
        )


def _sincronizar_conta_do_profissional(
    db: Session, professional: models.Professional, ativa: bool
) -> None:
    """
    Alinha `users.is_active` ao estado do profissional.

    O login consulta primeiro a tabela `users`; manter as duas linhas coerentes
    garante que o bloqueio (e a reversão) valha tanto para quem já tem conta
    sincronizada quanto para quem autentica direto pela tabela `professionals`.
    """
    conta = (
        db.query(models.User)
        .filter(models.User.email == professional.email)
        .first()
    )
    if conta is not None:
        conta.is_active = ativa


def _notificar_moderacao(
    db: Session,
    denuncia: models.Denuncia,
    destinatario: Optional[str],
    titulo: str,
    mensagem: str,
    tipo: str,
) -> None:
    """Notifica o interessado após a decisão, sem deixar falha de notificação quebrar a resposta."""
    if not destinatario:
        return
    try:
        registrar_e_enviar_notificacao(
            db=db,
            user_email=destinatario,
            titulo=titulo,
            mensagem=mensagem,
            tipo=tipo,
            referencia_id=denuncia.id,
        )
    except Exception:  # pragma: no cover - resiliência de notificação
        db.rollback()
        logger.exception(
            "Falha ao notificar a decisão da denúncia %s para %s",
            denuncia.id,
            destinatario,
        )


@admin_router.patch(
    "/{denuncia_id}/moderar",
    response_model=schemas.DenunciaAdminRead,
    summary="Aplicar decisão de moderação a uma denúncia",
    description=(
        "Decide uma denúncia em aberto. `banimento` marca `resolvida`, desativa "
        "`professionals.is_active` e `users.is_active` (removendo o profissional "
        "da busca pública e bloqueando o login). `arquivamento` marca "
        "`arquivada` e mantém o profissional ativo. `reativacao` reverte um "
        "banimento anterior, reabilitando a conta e devolvendo a denúncia para "
        "análise."
    ),
    responses={
        403: {"description": "Usuário autenticado não é administrador."},
        404: {"description": "Denúncia (ou profissional denunciado) não encontrada."},
        409: {"description": "Denúncia já decidida ou sem banimento a reverter."},
    },
)
@admins_alias_router.patch(
    "/{denuncia_id}/moderar",
    response_model=schemas.DenunciaAdminRead,
    include_in_schema=False,
)
@router.patch(
    "/admin/{denuncia_id}/moderar",
    response_model=schemas.DenunciaAdminRead,
    include_in_schema=False,
)
def moderar_denuncia(
    denuncia_id: int,
    payload: schemas.DenunciaModerarPayload,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """
    Aplica a decisão administrativa e registra parecer, autor e data.

    O cliente autor é notificado em toda decisão (procedente ou arquivada); na
    reversão, o profissional é avisado de que a conta voltou a ficar ativa.
    """
    denuncia = (
        db.query(models.Denuncia)
        .filter(models.Denuncia.id == denuncia_id)
        .first()
    )
    if denuncia is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Denúncia não encontrada.",
        )

    professional = (
        db.query(models.Professional)
        .filter(models.Professional.id == denuncia.professional_id)
        .first()
    )
    if professional is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional denunciado não encontrado.",
        )

    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == denuncia.cliente_id)
        .first()
    )

    acao = payload.acao
    agora = datetime.now(timezone.utc)

    if acao == models.DenunciaModeracaoAcao.BANIMENTO.value:
        _garantir_denuncia_em_aberto(denuncia)
        professional.is_active = False
        _sincronizar_conta_do_profissional(db, professional, ativa=False)
        denuncia.status = models.DenunciaStatus.RESOLVIDA.value
        titulo_notificacao = "Denúncia considerada procedente"
        mensagem_notificacao = (
            f"Analisamos a sua denúncia #{denuncia.id} e consideramos o relato "
            "procedente. O profissional denunciado foi suspenso da plataforma."
        )
    elif acao == models.DenunciaModeracaoAcao.ARQUIVAMENTO.value:
        _garantir_denuncia_em_aberto(denuncia)
        denuncia.status = models.DenunciaStatus.ARQUIVADA.value
        titulo_notificacao = "Denúncia arquivada"
        mensagem_notificacao = (
            f"Analisamos a sua denúncia #{denuncia.id} e, após revisão da equipe "
            "de moderação, ela foi arquivada. Obrigado por contribuir com a "
            "segurança da plataforma."
        )
    else:  # reativação
        if (
            denuncia.status != models.DenunciaStatus.RESOLVIDA.value
            or denuncia.moderacao_acao != models.DenunciaModeracaoAcao.BANIMENTO.value
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Só é possível reativar o profissional de uma denúncia "
                    "resolvida por banimento ainda não revertido."
                ),
            )
        professional.is_active = True
        _sincronizar_conta_do_profissional(db, professional, ativa=True)
        # A decisão foi revertida: a denúncia volta para a fila de análise.
        denuncia.status = models.DenunciaStatus.EM_ANALISE.value

    denuncia.moderacao_acao = acao
    denuncia.moderacao_parecer = payload.parecer
    denuncia.moderado_em = agora
    denuncia.moderado_por_id = current_admin.id

    db.commit()
    db.refresh(denuncia)

    if acao == models.DenunciaModeracaoAcao.REATIVACAO.value:
        _notificar_moderacao(
            db,
            denuncia,
            professional.email,
            "Conta reativada na RentalSpouse",
            (
                "A suspensão da sua conta foi revertida pela equipe de "
                f"moderação após revisão da denúncia #{denuncia.id}. Seu perfil "
                "voltou a ficar visível na busca de profissionais."
            ),
            "conta_reativada",
        )
    else:
        _notificar_moderacao(
            db,
            denuncia,
            cliente.email if cliente else None,
            titulo_notificacao,
            mensagem_notificacao,
            "denuncia_moderada",
        )

    resposta = _obter_denuncia_admin(db, denuncia.id, current_admin.name)
    assert resposta is not None  # a denúncia acabou de ser persistida
    return resposta
