"""
Rotas de avaliações e comentários de profissionais (issues #19 e #21).

Escopo desta entrega (Parte 1 — Backend):

- `POST /api/avaliacoes` -> cliente autenticado registra avaliação de 1 a 5
  estrelas (com comentário opcional) para um profissional ativo e aprovado,
  podendo vincular opcionalmente a um `agendamento_id` ou `orcamento_id`;
- `GET  /api/avaliacoes/me` -> lista as avaliações realizadas pelo próprio
  cliente autenticado;
- `GET  /api/professionals/{professional_id}/avaliacoes` -> endpoint público
  que retorna o resumo estatístico de reputação do profissional (média de
  estrelas, total de avaliações e distribuição de 1 a 5 estrelas) junto à
  lista paginada de avaliações e comentários (com nome do cliente abreviado
  por privacidade/LGPD e filtro opcional por estrela).
"""

import logging
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from client_access import get_current_cliente
from database import get_db
import models
from routes.notificacoes import registrar_e_enviar_notificacao
import schemas

logger = logging.getLogger("rentalspouse.avaliacoes")

router = APIRouter(prefix="/api", tags=["Avaliações"])


def _abreviar_nome_cliente(nome_completo: Optional[str]) -> str:
    """
    Formata o nome do cliente para exibição pública no perfil do profissional
    respeitando a minimização de dados (LGPD): 'João Silva' -> 'João S.'.
    """
    if not nome_completo or not nome_completo.strip():
        return "Cliente Verificado"
    partes = [p for p in nome_completo.strip().split() if p]
    if len(partes) == 1:
        return partes[0]
    inicial_sobrenome = partes[-1][0].upper()
    return f"{partes[0]} {inicial_sobrenome}."


def _avaliacao_read(
    avaliacao: models.Avaliacao,
    professional_name: Optional[str] = None,
    cliente_nome: Optional[str] = None,
) -> schemas.AvaliacaoRead:
    """Serializa uma avaliação completa para a visão do cliente autor."""
    return schemas.AvaliacaoRead(
        id=avaliacao.id,
        cliente_id=avaliacao.cliente_id,
        cliente_nome=_abreviar_nome_cliente(cliente_nome),
        professional_id=avaliacao.professional_id,
        professional_name=professional_name,
        agendamento_id=avaliacao.agendamento_id,
        orcamento_id=avaliacao.orcamento_id,
        nota=avaliacao.nota,
        comentario=avaliacao.comentario,
        created_at=avaliacao.created_at,
        updated_at=avaliacao.updated_at,
    )


def _avaliacao_public_read(
    avaliacao: models.Avaliacao,
    cliente_nome: Optional[str] = None,
) -> schemas.AvaliacaoPublicRead:
    """Serializa uma avaliação para exibição pública no perfil do profissional."""
    return schemas.AvaliacaoPublicRead(
        id=avaliacao.id,
        professional_id=avaliacao.professional_id,
        cliente_nome=_abreviar_nome_cliente(cliente_nome),
        nota=avaliacao.nota,
        comentario=avaliacao.comentario,
        created_at=avaliacao.created_at,
    )


def _validar_agendamento_avaliavel(
    db: Session,
    agendamento_id: int,
    cliente: models.Cliente,
    professional: models.Professional,
) -> models.Agendamento:
    """
    Garante que o agendamento informado existe, pertence ao cliente e ao
    profissional avaliados, não foi cancelado e ainda não recebeu avaliação.
    """
    agendamento = (
        db.query(models.Agendamento)
        .filter(models.Agendamento.id == agendamento_id)
        .first()
    )
    if agendamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agendamento não encontrado.",
        )

    if (
        agendamento.cliente_id != cliente.id
        or agendamento.professional_id != professional.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este agendamento não pertence a você ou ao profissional informado.",
        )

    if agendamento.status == models.AgendamentoStatus.CANCELADO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível avaliar um agendamento cancelado.",
        )

    ja_avaliado = (
        db.query(models.Avaliacao)
        .filter(models.Avaliacao.agendamento_id == agendamento.id)
        .first()
    )
    if ja_avaliado is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este agendamento já foi avaliado anteriormente.",
        )

    return agendamento


def _validar_orcamento_avaliavel(
    db: Session,
    orcamento_id: int,
    cliente: models.Cliente,
    professional: models.Professional,
) -> models.Orcamento:
    """
    Garante que o orçamento informado existe, pertence ao cliente e ao
    profissional avaliados, foi aceito/respondido e ainda não recebeu avaliação.
    """
    orcamento = (
        db.query(models.Orcamento)
        .filter(models.Orcamento.id == orcamento_id)
        .first()
    )
    if orcamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitação de orçamento não encontrada.",
        )

    mesmo_cliente = orcamento.cliente_id == cliente.id or (
        orcamento.cliente_id is None
        and (orcamento.cliente_email or "").strip().lower() == cliente.email.strip().lower()
    )
    if not mesmo_cliente or orcamento.professional_id != professional.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta solicitação de orçamento não pertence a você ou ao profissional informado.",
        )

    if orcamento.status in (
        models.OrcamentoStatus.RECUSADO.value,
        models.OrcamentoStatus.CANCELADO.value,
        models.OrcamentoStatus.PENDENTE.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só é possível avaliar orçamentos aceitos ou respondidos pelo profissional.",
        )

    ja_avaliado = (
        db.query(models.Avaliacao)
        .filter(models.Avaliacao.orcamento_id == orcamento.id)
        .first()
    )
    if ja_avaliado is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este orçamento já foi avaliado anteriormente.",
        )

    return orcamento


@router.post(
    "/avaliacoes",
    response_model=schemas.AvaliacaoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Avaliar serviço prestado por um profissional",
    description=(
        "Registra uma avaliação de 1 a 5 estrelas (e comentário opcional) do "
        "cliente autenticado para um profissional ativo e aprovado."
    ),
)
def criar_avaliacao(
    payload: schemas.AvaliacaoCreate,
    cliente: models.Cliente = Depends(get_current_cliente),
    db: Session = Depends(get_db),
):
    """
    Cria uma avaliação com autoria derivada do token do cliente.

    Regras de negócio:
    - O profissional precisa existir (404), estar ativo e aprovado (409);
    - Se `agendamento_id` for informado, valida titularidade, status não-cancelado
      e unicidade, marcando o agendamento como `concluido`;
    - Se `orcamento_id` for informado, valida titularidade, status aceito/respondido
      e unicidade;
    - Caso nenhum vínculo seja informado, permite apenas uma avaliação avulsa por
      par `(cliente_id, professional_id)` para evitar spam de notas.
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

    if (
        not professional.is_active
        or professional.approval_status != models.ProfessionalApprovalStatus.APPROVED.value
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível avaliar um profissional com cadastro inativo ou não aprovado.",
        )

    agendamento: Optional[models.Agendamento] = None
    if payload.agendamento_id is not None:
        agendamento = _validar_agendamento_avaliavel(
            db, payload.agendamento_id, cliente, professional
        )

    if payload.orcamento_id is not None:
        _validar_orcamento_avaliavel(
            db, payload.orcamento_id, cliente, professional
        )

    if payload.agendamento_id is None and payload.orcamento_id is None:
        avaliacao_avulsa = (
            db.query(models.Avaliacao)
            .filter(
                models.Avaliacao.cliente_id == cliente.id,
                models.Avaliacao.professional_id == professional.id,
                models.Avaliacao.agendamento_id.is_(None),
                models.Avaliacao.orcamento_id.is_(None),
            )
            .first()
        )
        if avaliacao_avulsa is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Você já registrou uma avaliação para este profissional.",
            )

    avaliacao = models.Avaliacao(
        cliente_id=cliente.id,
        professional_id=professional.id,
        agendamento_id=payload.agendamento_id,
        orcamento_id=payload.orcamento_id,
        nota=payload.nota,
        comentario=payload.comentario,
    )

    if (
        agendamento is not None
        and agendamento.status == models.AgendamentoStatus.AGENDADO.value
    ):
        agendamento.status = models.AgendamentoStatus.CONCLUIDO.value

    db.add(avaliacao)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma avaliação registrada para este atendimento.",
        ) from exc

    db.refresh(avaliacao)

    # Notificação em tempo real para o profissional (best-effort)
    try:
        estrelas_txt = "★" * avaliacao.nota + "☆" * (5 - avaliacao.nota)
        registrar_e_enviar_notificacao(
            db=db,
            user_email=professional.email,
            titulo=f"Nova avaliação recebida ({avaliacao.nota}/5 {estrelas_txt})",
            mensagem=(
                f"{_abreviar_nome_cliente(cliente.nome)} avaliou seu atendimento "
                f"com {avaliacao.nota} estrela(s)."
            ),
            tipo="nova_avaliacao",
            referencia_id=avaliacao.id,
        )
    except Exception as exc:
        logger.warning(
            "Falha não-bloqueante ao notificar profissional sobre avaliação #%s: %s",
            avaliacao.id,
            exc,
        )

    return _avaliacao_read(avaliacao, professional.name, cliente.nome)


@router.get(
    "/avaliacoes/me",
    response_model=List[schemas.AvaliacaoRead],
    summary="Listar minhas avaliações",
    description="Retorna as avaliações feitas pelo cliente autenticado, da mais recente para a mais antiga.",
)
def listar_minhas_avaliacoes(
    skip: int = Query(0, ge=0, description="Quantidade de registros a ignorar."),
    limit: int = Query(50, ge=1, le=100, description="Máximo de registros retornados."),
    cliente: models.Cliente = Depends(get_current_cliente),
    db: Session = Depends(get_db),
):
    """Lista todas as avaliações registradas pelo cliente autenticado."""
    linhas: List[Tuple[models.Avaliacao, Optional[str]]] = (
        db.query(models.Avaliacao, models.Professional.name)
        .join(
            models.Professional,
            models.Professional.id == models.Avaliacao.professional_id,
            isouter=True,
        )
        .filter(models.Avaliacao.cliente_id == cliente.id)
        .order_by(models.Avaliacao.created_at.desc(), models.Avaliacao.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [_avaliacao_read(av, nome_prof, cliente.nome) for av, nome_prof in linhas]


@router.get(
    "/professionals/{professional_id}/avaliacoes",
    response_model=schemas.ProfissionalAvaliacoesResumoRead,
    summary="Consultar avaliações, nota média e comentários de um profissional",
    description=(
        "Endpoint público que retorna a nota média, total de avaliações, "
        "distribuição de 1 a 5 estrelas e a lista paginada de avaliações e "
        "comentários de outros clientes no perfil do profissional (issue #21)."
    ),
)
def listar_avaliacoes_profissional(
    professional_id: int,
    nota: Optional[int] = Query(
        None,
        ge=1,
        le=5,
        description="Filtro opcional por quantidade de estrelas (1 a 5).",
    ),
    skip: int = Query(0, ge=0, description="Quantidade de registros a ignorar na listagem."),
    limit: int = Query(20, ge=1, le=100, description="Máximo de avaliações retornadas."),
    db: Session = Depends(get_db),
):
    """
    Devolve o resumo de reputação e os comentários públicos do profissional.
    """
    professional = (
        db.query(models.Professional)
        .filter(models.Professional.id == professional_id)
        .first()
    )
    if (
        professional is None
        or not professional.is_active
        or professional.approval_status != models.ProfessionalApprovalStatus.APPROVED.value
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional não encontrado.",
        )

    # Cálculo agregado de distribuição (1 a 5 estrelas), total e média global do profissional
    contagens_por_nota: List[Tuple[int, int]] = (
        db.query(models.Avaliacao.nota, func.count(models.Avaliacao.id))
        .filter(models.Avaliacao.professional_id == professional.id)
        .group_by(models.Avaliacao.nota)
        .all()
    )

    mapa_estrelas: Dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    total_avaliacoes = 0
    soma_notas = 0
    for estrela, qtd in contagens_por_nota:
        if estrela in mapa_estrelas:
            qtd_int = int(qtd)
            mapa_estrelas[estrela] = qtd_int
            total_avaliacoes += qtd_int
            soma_notas += estrela * qtd_int

    media_notas = round(soma_notas / total_avaliacoes, 2) if total_avaliacoes > 0 else 0.0

    # Listagem paginada (com filtro opcional por estrela)
    consulta = (
        db.query(models.Avaliacao, models.Cliente.nome)
        .join(
            models.Cliente,
            models.Cliente.id == models.Avaliacao.cliente_id,
            isouter=True,
        )
        .filter(models.Avaliacao.professional_id == professional.id)
    )
    if nota is not None:
        consulta = consulta.filter(models.Avaliacao.nota == nota)

    linhas: List[Tuple[models.Avaliacao, Optional[str]]] = (
        consulta.order_by(models.Avaliacao.created_at.desc(), models.Avaliacao.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return schemas.ProfissionalAvaliacoesResumoRead(
        professional_id=professional.id,
        media_notas=media_notas,
        total_avaliacoes=total_avaliacoes,
        distribuicao=schemas.AvaliacaoDistribuicaoRead(
            estrelas_1=mapa_estrelas[1],
            estrelas_2=mapa_estrelas[2],
            estrelas_3=mapa_estrelas[3],
            estrelas_4=mapa_estrelas[4],
            estrelas_5=mapa_estrelas[5],
        ),
        items=[_avaliacao_public_read(av, nome_cli) for av, nome_cli in linhas],
    )
