"""
Agenda de disponibilidade e agendamento de slots do profissional (issue #78).

Entrega a ponta do contrato consumida pela issue #79 (web):

- `GET  /api/professionals/{professional_id}/agenda` -> agenda pública da janela
  pedida, já fatiada em slots livres (grade semanal menos reservas, bloqueios e
  horários passados);
- `POST /api/agendamentos`      -> cliente autenticado reserva um slot;
- `GET  /api/agendamentos/meus` -> agendamentos do próprio cliente;
- `PUT  /api/agendamentos/disponibilidade` / `GET .../disponibilidade` ->
  grade semanal do profissional autenticado (necessária para que a agenda
  exista de fato para a interface da Parte 2).

Decisões de implementação:

- Datas e horas seguem o padrão **naive-UTC** do projeto (`verificacao.utcnow`):
  `TIMESTAMP WITHOUT TIME ZONE` no PostgreSQL e DATETIME no SQLite dos testes.
  Um `datetime` com fuso enviado pelo cliente é convertido para UTC antes de
  qualquer comparação.
- `dia_semana` usa a convenção de `datetime.weekday()` (0 = segunda ... 6 = domingo).
- O slot reservado é sempre um slot inteiro da grade: o cliente não escolhe a
  duração, então `data_hora_fim` é derivado de `duracao_slot_min` no servidor.
- Double-booking é barrado em duas camadas: consulta de sobreposição antes do
  `INSERT` (mensagem amigável) e índice único parcial no banco (corrida real).
- Cancelamento (`DELETE`) fica fora do escopo: pertence à issue #24, que só
  precisa mudar `status` para liberar o slot — o índice único é parcial.

Os bloqueios pontuais do profissional pertencem à issue #16. Esta entrega deixa
um único ponto de extensão (`_intervalos_bloqueados`), já respeitado pela
geração de slots e pela reserva.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import logging
from typing import List, Optional, Sequence, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from client_access import get_current_cliente
from database import get_db
import models
from professional_access import get_current_professional
import schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Agenda"])

URL_AGENDA_PROFISSIONAL = "/professionals/{professional_id}/agenda"
URL_AGENDAMENTOS = "/agendamentos"
URL_MEUS_AGENDAMENTOS = "/agendamentos/meus"
URL_DISPONIBILIDADE = "/agendamentos/disponibilidade"

# Máximo de janelas aceitas em uma única definição de grade semanal.
MAX_JANELAS_POR_GRADE = 50

Intervalo = Tuple[datetime, datetime]

MENSAGEM_SLOT_INDISPONIVEL = (
    "Este horário acabou de ser reservado por outro cliente. "
    "Atualize a agenda e escolha outro slot."
)


# ---------------------------------------------------------------------------
# Helpers de data/hora e consulta
# ---------------------------------------------------------------------------


def _utcnow() -> datetime:
    """Instante atual em UTC **sem tzinfo** (mesma convenção de `verificacao.utcnow`)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _obter_profissional_agendavel(db: Session, professional_id: int) -> models.Professional:
    """
    Devolve o profissional apto a receber agendamentos.

    Indisponível (inexistente, inativo ou sem aprovação cadastral) responde 404,
    o mesmo status usado para profissional inexistente — não vazamos o estado
    cadastral de terceiros para o cliente.
    """
    profissional = (
        db.query(models.Professional)
        .filter(models.Professional.id == professional_id)
        .first()
    )
    if (
        profissional is None
        or not profissional.is_active
        or profissional.approval_status != models.ProfessionalApprovalStatus.APPROVED.value
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional não encontrado ou sem agenda disponível para agendamento.",
        )
    return profissional


def _grade_semanal(db: Session, professional_id: int) -> List[models.DisponibilidadeProfissional]:
    """Grade semanal completa de um profissional, ordenada por dia e hora inicial."""
    return (
        db.query(models.DisponibilidadeProfissional)
        .filter(models.DisponibilidadeProfissional.professional_id == professional_id)
        .order_by(
            models.DisponibilidadeProfissional.dia_semana,
            models.DisponibilidadeProfissional.hora_inicio,
        )
        .all()
    )


def _intervalos_ocupados(
    db: Session,
    professional_id: int,
    inicio: datetime,
    fim: datetime,
) -> List[Intervalo]:
    """Faixas de agendamentos não cancelados que se sobrepõem a `[inicio, fim)`."""
    linhas = (
        db.query(models.Agendamento.data_hora_inicio, models.Agendamento.data_hora_fim)
        .filter(
            models.Agendamento.professional_id == professional_id,
            models.Agendamento.status.in_(models.AGENDAMENTO_STATUS_OCUPANTES),
            models.Agendamento.data_hora_inicio < fim,
            models.Agendamento.data_hora_fim > inicio,
        )
        .all()
    )
    return [(linha[0], linha[1]) for linha in linhas]


def _intervalos_bloqueados(
    db: Session,
    professional_id: int,
    inicio: datetime,
    fim: datetime,
) -> List[Intervalo]:
    """
    Bloqueios pontuais do profissional (issue #16) — único ponto de extensão.

    A tabela de bloqueios ainda não existe no schema, então a agenda segue
    exclusivamente pela grade semanal. Quando #16 for entregue, basta consultar
    a nova tabela aqui: a geração de slots e a reserva já respeitam o retorno.
    """
    return []


def _sobrepoe(inicio: datetime, fim: datetime, intervalos: Sequence[Intervalo]) -> bool:
    """Indica se `[inicio, fim)` cruza algum dos intervalos informados."""
    return any(ini < fim and f > inicio for ini, f in intervalos)


def _slot_indisponivel(
    db: Session,
    professional_id: int,
    inicio: datetime,
    fim: datetime,
) -> bool:
    """`True` quando o slot está ocupado por reserva ativa ou bloqueio (#16)."""
    ocupados = _intervalos_ocupados(db, professional_id, inicio, fim)
    if _sobrepoe(inicio, fim, ocupados):
        return True
    bloqueados = _intervalos_bloqueados(db, professional_id, inicio, fim)
    return _sobrepoe(inicio, fim, bloqueados)


def _fim_do_slot_na_grade(
    janelas: Sequence[models.DisponibilidadeProfissional],
    inicio: datetime,
) -> Optional[datetime]:
    """
    Devolve o fim do slot quando `inicio` é o começo de um slot válido da grade.

    Aceita apenas instantes alinhados (`hh:mm:00` dentro da janela, múltiplos de
    `duracao_slot_min` a partir do início da janela) e slot completo — o mesmo
    recorte que a agenda expõe ao cliente.
    """
    if inicio.second or inicio.microsecond:
        return None

    hora = inicio.time()
    for janela in janelas:
        if janela.duracao_slot_min is None or janela.duracao_slot_min <= 0:
            continue
        if not (janela.hora_inicio <= hora < janela.hora_fim):
            continue

        minutos_deslocados = (
            hora.hour * 60 + hora.minute
        ) - (janela.hora_inicio.hour * 60 + janela.hora_inicio.minute)
        if minutos_deslocados % janela.duracao_slot_min:
            return None

        fim = inicio + timedelta(minutes=janela.duracao_slot_min)
        if fim.date() != inicio.date() or fim.time() > janela.hora_fim:
            return None
        return fim

    return None


def _slots_do_dia(
    janelas: Sequence[models.DisponibilidadeProfissional],
    dia: date,
    agora: datetime,
    ocupados: Sequence[Intervalo],
    bloqueados: Sequence[Intervalo],
) -> List[schemas.AgendaSlotRead]:
    """Fatia em slots a grade do dia e devolve apenas os que estão livres e no futuro."""
    slots: List[schemas.AgendaSlotRead] = []

    for janela in janelas:
        if janela.duracao_slot_min is None or janela.duracao_slot_min <= 0:
            continue

        duracao = timedelta(minutes=janela.duracao_slot_min)
        cursor = datetime.combine(dia, janela.hora_inicio)
        fim_janela = datetime.combine(dia, janela.hora_fim)

        while cursor + duracao <= fim_janela:
            inicio = cursor
            fim = cursor = inicio + duracao

            if inicio <= agora:
                continue
            if _sobrepoe(inicio, fim, ocupados) or _sobrepoe(inicio, fim, bloqueados):
                continue

            slots.append(
                schemas.AgendaSlotRead(
                    data_hora_inicio=inicio,
                    data_hora_fim=fim,
                    disponivel=True,
                )
            )

    slots.sort(key=lambda slot: slot.data_hora_inicio)
    return slots


def _validar_sobreposicao_grade(grade: Sequence[schemas.DisponibilidadeCreate]) -> None:
    """
    Recusa janelas sobrepostas (ou repetidas) no mesmo dia da semana.

    Sobreposição duplicaria horários na agenda e tornaria a duração de cada slot
    ambígua, então é tratada como erro de payload (422).
    """
    por_dia: dict[int, List[schemas.DisponibilidadeCreate]] = defaultdict(list)
    for janela in grade:
        por_dia[janela.dia_semana].append(janela)

    for dia_semana, janelas in por_dia.items():
        ordenadas = sorted(janelas, key=lambda janela: janela.hora_inicio)
        for anterior, atual in zip(ordenadas, ordenadas[1:]):
            if atual.hora_inicio < anterior.hora_fim:
                nome_dia = schemas.DIAS_SEMANA_NOMES[dia_semana]
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"As janelas {anterior.hora_inicio.strftime('%H:%M')}–"
                        f"{anterior.hora_fim.strftime('%H:%M')} e "
                        f"{atual.hora_inicio.strftime('%H:%M')}–"
                        f"{atual.hora_fim.strftime('%H:%M')} se sobrepõem em {nome_dia}."
                    ),
                )


def _validar_orcamento_vinculado(
    db: Session,
    orcamento_id: int,
    cliente: models.Cliente,
    profissional: models.Professional,
) -> None:
    """
    Garante que o orçamento citado existe e pertence ao par (cliente, profissional).

    Impede que um cliente vincule o agendamento ao orçamento de terceiros (IDOR)
    ou de outro profissional.
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
        and (orcamento.cliente_email or "").lower() == cliente.email.lower()
    )
    if not mesmo_cliente or orcamento.professional_id != profissional.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "A solicitação de orçamento informada não pertence a este cliente "
                "e profissional."
            ),
        )


# ---------------------------------------------------------------------------
# Agenda pública do profissional
# ---------------------------------------------------------------------------


@router.get(
    URL_AGENDA_PROFISSIONAL,
    response_model=List[schemas.AgendaDiaRead],
    summary="Consultar a agenda de um profissional",
    description=(
        "Gera os slots da grade semanal do profissional na janela pedida e devolve "
        "apenas os que estão livres: reservas ativas, bloqueios (#16) e horários "
        "passados são omitidos. Todos os dias da janela aparecem na resposta — dia "
        "sem grade volta com `slots: []`. Janela maior que 60 dias ou invertida "
        "responde 422; profissional inexistente, inativo ou não aprovado responde 404."
    ),
)
def consultar_agenda(
    professional_id: int,
    data_inicio: Optional[date] = Query(
        None,
        description="Primeiro dia da janela (YYYY-MM-DD). Padrão: hoje (UTC).",
    ),
    data_fim: Optional[date] = Query(
        None,
        description=(
            "Último dia da janela, inclusive (YYYY-MM-DD). "
            f"Padrão: {schemas.AGENDA_JANELA_PADRAO_DIAS} dias a partir de `data_inicio`."
        ),
    ),
    db: Session = Depends(get_db),
):
    """Consulta pública (sem autenticação) da agenda de um profissional aprovado."""
    profissional = _obter_profissional_agendavel(db, professional_id)

    hoje = _utcnow().date()
    inicio = data_inicio or hoje
    fim = data_fim or (inicio + timedelta(days=schemas.AGENDA_JANELA_PADRAO_DIAS - 1))

    if fim < inicio:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="`data_fim` deve ser igual ou posterior a `data_inicio`.",
        )

    total_dias = (fim - inicio).days + 1
    if total_dias > schemas.AGENDA_JANELA_MAX_DIAS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "A janela de consulta da agenda não pode exceder "
                f"{schemas.AGENDA_JANELA_MAX_DIAS} dias."
            ),
        )

    grade_por_dia: dict[int, List[models.DisponibilidadeProfissional]] = defaultdict(list)
    for janela in _grade_semanal(db, profissional.id):
        grade_por_dia[janela.dia_semana].append(janela)

    inicio_janela = datetime.combine(inicio, time.min)
    fim_janela = datetime.combine(fim + timedelta(days=1), time.min)
    ocupados = _intervalos_ocupados(db, profissional.id, inicio_janela, fim_janela)
    bloqueados = _intervalos_bloqueados(db, profissional.id, inicio_janela, fim_janela)
    agora = _utcnow()

    return [
        schemas.AgendaDiaRead(
            data=dia,
            slots=_slots_do_dia(
                grade_por_dia[dia.weekday()],
                dia,
                agora,
                ocupados,
                bloqueados,
            ),
        )
        for dia in (inicio + timedelta(days=deslocamento) for deslocamento in range(total_dias))
    ]


# ---------------------------------------------------------------------------
# Reserva de slot pelo cliente
# ---------------------------------------------------------------------------


@router.post(
    URL_AGENDAMENTOS,
    response_model=schemas.AgendamentoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Reservar um slot da agenda",
    description=(
        "Reserva o slot escolhido pelo cliente autenticado. 401 sem token, 403 se o "
        "usuário não for cliente, 404 para profissional ou orçamento inexistente, "
        "422 para horário no passado ou fora da grade e 409 quando o slot já está "
        "ocupado (inclusive na corrida entre duas requisições simultâneas)."
    ),
)
def criar_agendamento(
    payload: schemas.AgendamentoCreate,
    cliente: models.Cliente = Depends(get_current_cliente),
    db: Session = Depends(get_db),
):
    """
    Cria a reserva de um slot inteiro da grade.

    O autor é sempre o cliente do token (`get_current_cliente`) — o payload não
    aceita `cliente_id`, o que elimina spoofing de autoria por construção — e o
    fim do slot vem de `duracao_slot_min`, nunca do cliente.
    """
    profissional = _obter_profissional_agendavel(db, payload.professional_id)

    inicio = schemas.normalizar_datetime_utc(payload.data_hora_inicio)
    if inicio <= _utcnow():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O agendamento precisa ser feito para um horário no futuro.",
        )

    janelas_do_dia = [
        janela
        for janela in _grade_semanal(db, profissional.id)
        if janela.dia_semana == inicio.weekday()
    ]
    fim = _fim_do_slot_na_grade(janelas_do_dia, inicio)
    if fim is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O horário informado não pertence à agenda disponível do profissional.",
        )

    if payload.orcamento_id is not None:
        _validar_orcamento_vinculado(db, payload.orcamento_id, cliente, profissional)

    if _slot_indisponivel(db, profissional.id, inicio, fim):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=MENSAGEM_SLOT_INDISPONIVEL,
        )

    agendamento = models.Agendamento(
        professional_id=profissional.id,
        cliente_id=cliente.id,
        orcamento_id=payload.orcamento_id,
        data_hora_inicio=inicio,
        data_hora_fim=fim,
        status=models.AgendamentoStatus.AGENDADO.value,
    )
    db.add(agendamento)
    try:
        db.commit()
    except IntegrityError:
        # Corrida real: outra requisição gravou o mesmo slot entre a consulta
        # acima e este INSERT. O índice único parcial é a última linha de defesa.
        db.rollback()
        logger.info(
            "Reserva concorrente barrada pelo índice único (professional_id=%s, inicio=%s).",
            profissional.id,
            inicio.isoformat(),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=MENSAGEM_SLOT_INDISPONIVEL,
        )

    db.refresh(agendamento)
    return agendamento


@router.get(
    URL_MEUS_AGENDAMENTOS,
    response_model=List[schemas.AgendamentoRead],
    summary="Listar meus agendamentos",
    description=(
        "Agendamentos do cliente autenticado, ordenados por `data_hora_inicio`. "
        "Filtro opcional por `status` (`agendado`, `cancelado`, `concluido`)."
    ),
)
def listar_meus_agendamentos(
    status_filtro: Optional[str] = Query(
        None,
        alias="status",
        description="Filtra pelo status do agendamento.",
    ),
    skip: int = Query(0, ge=0, description="Quantidade de registros a ignorar."),
    limit: int = Query(50, ge=1, le=100, description="Máximo de registros retornados."),
    cliente: models.Cliente = Depends(get_current_cliente),
    db: Session = Depends(get_db),
):
    """Lista os agendamentos do cliente dono do token, do mais próximo ao mais distante."""
    consulta = db.query(models.Agendamento).filter(
        models.Agendamento.cliente_id == cliente.id
    )

    if status_filtro is not None:
        normalizado = status_filtro.strip().lower()
        status_aceitos = [valor.value for valor in models.AgendamentoStatus]
        if normalizado not in status_aceitos:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Status '{status_filtro}' inválido. "
                    f"Valores aceitos: {', '.join(status_aceitos)}."
                ),
            )
        consulta = consulta.filter(models.Agendamento.status == normalizado)

    return (
        consulta.order_by(
            models.Agendamento.data_hora_inicio.asc(),
            models.Agendamento.id.asc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Grade semanal do profissional autenticado
# ---------------------------------------------------------------------------


@router.get(
    URL_DISPONIBILIDADE,
    response_model=List[schemas.DisponibilidadeRead],
    summary="Consultar minha grade semanal",
    description=(
        "Grade semanal do profissional autenticado, ordenada por dia da semana e "
        "hora inicial. Lista vazia = agenda ainda não aberta."
    ),
)
def consultar_minha_disponibilidade(
    profissional: models.Professional = Depends(get_current_professional),
    db: Session = Depends(get_db),
):
    """Devolve a grade do profissional dono do token (escopo derivado do token)."""
    return _grade_semanal(db, profissional.id)


@router.put(
    URL_DISPONIBILIDADE,
    response_model=List[schemas.DisponibilidadeRead],
    summary="Definir minha grade semanal",
    description=(
        "Substitui toda a grade semanal do profissional autenticado pela lista "
        "enviada (lista vazia fecha a agenda). Janelas sobrepostas no mesmo dia ou "
        "payload inválido respondem 422."
    ),
)
def definir_minha_disponibilidade(
    grade: List[schemas.DisponibilidadeCreate],
    profissional: models.Professional = Depends(get_current_professional),
    db: Session = Depends(get_db),
):
    """
    Substitui a grade semanal do profissional dono do token.

    A substituição total (em vez de PATCH incremental) mantém a grade coerente:
    o profissional envia o estado desejado e não precisa reconciliar janelas
    removidas uma a uma.
    """
    if len(grade) > MAX_JANELAS_POR_GRADE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"A grade pode conter no máximo {MAX_JANELAS_POR_GRADE} janelas.",
        )

    _validar_sobreposicao_grade(grade)

    db.query(models.DisponibilidadeProfissional).filter(
        models.DisponibilidadeProfissional.professional_id == profissional.id
    ).delete(synchronize_session=False)

    for janela in grade:
        db.add(
            models.DisponibilidadeProfissional(
                professional_id=profissional.id,
                dia_semana=janela.dia_semana,
                hora_inicio=janela.hora_inicio,
                hora_fim=janela.hora_fim,
                duracao_slot_min=janela.duracao_slot_min,
            )
        )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.warning(
            "Conflito de unicidade ao gravar a grade do profissional %s.",
            profissional.id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível gravar a grade informada. Tente novamente.",
        )

    return _grade_semanal(db, profissional.id)
