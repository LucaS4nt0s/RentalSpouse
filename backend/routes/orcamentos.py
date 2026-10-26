"""
Rotas de Solicitação e Gestão de Orçamentos com Fotos (Issues #22 / #34).

Permite aos clientes solicitar orçamentos para serviços enviando descrição
detalhada e evidências visuais (fotos com validação de magic bytes), e permite
aos profissionais consultar as solicitações e responder com estimativas de valor.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import EmailStr, ValidationError
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
import models
from routes.notificacoes import (
    enviar_email_alerta_orcamento,
    registrar_e_enviar_notificacao,
)
from schemas import (
    OrcamentoAceitar,
    OrcamentoFotoRead,
    OrcamentoRead,
    OrcamentoRecusar,
    OrcamentoResponder,
    OrcamentoResumoCapacidade,
)
from security import (
    get_current_user,
    get_optional_current_user,
)
import storage

logger = logging.getLogger("rentalspouse.orcamentos")

router = APIRouter(prefix="/api/orcamentos", tags=["Orçamentos"])


def _montar_orcamento_read(orcamento: models.Orcamento) -> OrcamentoRead:
    """Serializa a entidade Orcamento injetando a URL de download para cada foto anexada."""
    fotos_read: List[OrcamentoFotoRead] = []
    for foto in orcamento.fotos:
        fotos_read.append(
            OrcamentoFotoRead(
                id=foto.id,
                orcamento_id=foto.orcamento_id,
                nome_original=foto.nome_original,
                tamanho_bytes=foto.tamanho_bytes,
                mime_type=foto.mime_type,
                enviado_em=foto.enviado_em,
                url_download=f"/api/orcamentos/{orcamento.id}/fotos/{foto.id}",
            )
        )

    prof_name = orcamento.professional.name if orcamento.professional else None

    return OrcamentoRead(
        id=orcamento.id,
        cliente_id=orcamento.cliente_id,
        cliente_nome=orcamento.cliente_nome,
        cliente_email=orcamento.cliente_email,
        cliente_telefone=orcamento.cliente_telefone,
        professional_id=orcamento.professional_id,
        professional_name=prof_name,
        descricao=orcamento.descricao,
        status=orcamento.status,
        valor_estimado=orcamento.valor_estimado,
        resposta_profissional=orcamento.resposta_profissional,
        respondido_em=orcamento.respondido_em,
        motivo_recusa=orcamento.motivo_recusa,
        justificativa_recusa=orcamento.justificativa_recusa,
        data_prevista=orcamento.data_prevista,
        decidido_em=orcamento.decidido_em,
        criado_em=orcamento.criado_em,
        atualizado_em=orcamento.atualizado_em,
        fotos=fotos_read,
    )


# ---------------------------------------------------------------------------
# Criar Orçamento (Multipart com Fotos) - Issue #22
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=OrcamentoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Solicitar orçamento com fotos",
    description="Cria uma nova solicitação de orçamento vinculada ao profissional com fotos opcionais (até 5 fotos, máx 5MB cada).",
)
async def criar_orcamento(
    background_tasks: BackgroundTasks,
    professional_id: int = Form(..., description="ID do profissional destinatário"),
    descricao: str = Form(..., description="Descrição detalhada do problema (mín. 10 caracteres)"),
    cliente_nome: Optional[str] = Form(None, description="Nome do cliente solicitante"),
    cliente_email: Optional[str] = Form(None, description="E-mail para resposta do orçamento"),
    cliente_telefone: Optional[str] = Form(None, description="Telefone de contato"),
    fotos: List[UploadFile] = File(default=[], description="Fotos anexadas do problema (máx 5)"),
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    # 1. Validação do Profissional Destinatário
    professional = db.query(models.Professional).filter(models.Professional.id == professional_id).first()
    if not professional or not professional.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional destinatário não encontrado ou inativo.",
        )

    # 2. Resolução dos Dados do Cliente Solicitante
    cliente_id = None
    if current_user:
        nome_final = (cliente_nome or "").strip() or current_user.name
        email_final = (cliente_email or "").strip().lower() or current_user.email
        # Associa com cliente se existir na tabela clientes
        cli = db.query(models.Cliente).filter(models.Cliente.email == current_user.email).first()
        if cli:
            cliente_id = cli.id
    else:
        nome_final = (cliente_nome or "").strip()
        email_final = (cliente_email or "").strip().lower()
        if not nome_final or len(nome_final) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="O campo 'cliente_nome' é obrigatório e deve conter ao menos 2 caracteres.",
            )
        if not email_final or "@" not in email_final:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="O campo 'cliente_email' é obrigatório e deve ser um e-mail válido.",
            )

    # 3. Validação da Descrição
    desc_limpa = descricao.strip()
    if len(desc_limpa) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A descrição do problema deve conter pelo menos 10 caracteres.",
        )
    if len(desc_limpa) > 2000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A descrição do problema não pode exceder 2000 caracteres.",
        )

    # 4. Validação e Leitura das Fotos
    # Filtra uploads vazios que alguns browsers ou form-data tools enviam
    fotos_validas = [f for f in fotos if f.filename and f.filename.strip()]
    if len(fotos_validas) > storage.MAX_PHOTOS_PER_ORCAMENTO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limite de no máximo {storage.MAX_PHOTOS_PER_ORCAMENTO} fotos por orçamento excedido.",
        )

    conteudos_fotos: List[tuple[str, str, bytes]] = []
    for f in fotos_validas:
        try:
            content = await f.read()
            storage.validate_orcamento_photo(f.filename, f.content_type, content)
            conteudos_fotos.append((f.filename, f.content_type or "image/jpeg", content))
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Arquivo '{f.filename}' inválido: {val_err}",
            )

    # 5. Persistência do Orçamento
    orcamento = models.Orcamento(
        cliente_id=cliente_id,
        cliente_nome=nome_final,
        cliente_email=email_final,
        cliente_telefone=(cliente_telefone or "").strip() or None,
        professional_id=professional.id,
        descricao=desc_limpa,
        status=models.OrcamentoStatus.PENDENTE.value,
    )
    db.add(orcamento)
    db.commit()
    db.refresh(orcamento)

    # 6. Salvamento Seguro das Fotos no Filesystem
    for original_name, mime_type, content in conteudos_fotos:
        rel_path, clean_name = storage.save_orcamento_photo(
            orcamento_id=orcamento.id,
            original_filename=original_name,
            content=content,
        )
        foto_db = models.OrcamentoFoto(
            orcamento_id=orcamento.id,
            nome_original=clean_name,
            caminho_arquivo=rel_path,
            tamanho_bytes=len(content),
            mime_type=mime_type,
        )
        db.add(foto_db)

    db.commit()
    db.refresh(orcamento)

    # 7. Disparo de Notificações em Tempo Real (Issue #34)
    titulo_notificacao = f"Novo orçamento solicitado por {nome_final}"
    resumo_msg = f"{desc_limpa[:90]}..." if len(desc_limpa) > 90 else desc_limpa

    registrar_e_enviar_notificacao(
        db=db,
        user_email=professional.email,
        titulo="Novo Orçamento Solicitado",
        mensagem=f"{nome_final} enviou uma solicitação de orçamento: \"{resumo_msg}\"",
        tipo="novo_orcamento",
        referencia_id=orcamento.id,
        payload_extra={
            "orcamento_id": orcamento.id,
            "cliente_nome": nome_final,
            "total_fotos": len(orcamento.fotos),
        },
    )

    # Notificação por e-mail em segundo plano
    background_tasks.add_task(
        enviar_email_alerta_orcamento,
        destinatario_email=professional.email,
        destinatario_nome=professional.name,
        titulo=titulo_notificacao,
        descricao=desc_limpa,
        orcamento_id=orcamento.id,
    )

    logger.info(
        "Orçamento #%d criado para o profissional '%s' com %d fotos.",
        orcamento.id,
        professional.email,
        len(orcamento.fotos),
    )

    return _montar_orcamento_read(orcamento)


# ---------------------------------------------------------------------------
# Listar Orçamentos do Usuário Logado
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=List[OrcamentoRead],
    summary="Listar meus orçamentos",
    description="Retorna orçamentos enviados pelo cliente ou recebidos pelo profissional autenticado.",
)
def listar_meus_orcamentos(
    status_filtro: Optional[str] = Query(None, description="Filtrar por status ('pendente', 'respondido', etc.)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(models.Orcamento)

    if current_user.role == models.UserRole.PROFESSIONAL.value:
        prof = db.query(models.Professional).filter(models.Professional.email == current_user.email).first()
        if not prof:
            return []
        query = query.filter(models.Orcamento.professional_id == prof.id)
    elif current_user.role == models.UserRole.ADMIN.value:
        pass  # Admins podem visualizar todos
    else:
        # Cliente: busca pelo e-mail ou cliente_id vinculado
        email_limpo = current_user.email.strip().lower()
        cli = db.query(models.Cliente).filter(models.Cliente.email == email_limpo).first()
        cliente_filtro = (models.Orcamento.cliente_email == email_limpo) | (
            models.Orcamento.cliente_id == current_user.id
        )
        if cli:
            cliente_filtro = cliente_filtro | (models.Orcamento.cliente_id == cli.id)
        query = query.filter(cliente_filtro)

    if status_filtro:
        query = query.filter(models.Orcamento.status == status_filtro.strip().lower())

    orcamentos = query.order_by(models.Orcamento.criado_em.desc()).all()
    return [_montar_orcamento_read(o) for o in orcamentos]


# ---------------------------------------------------------------------------
# Resumo de Capacidade do Profissional (Issue #29)
# ---------------------------------------------------------------------------


@router.get(
    "/capacidade/resumo",
    response_model=OrcamentoResumoCapacidade,
    summary="Resumo de capacidade de trabalho",
    description="Retorna o consolidado de orçamentos por status para o prestador gerenciar sua capacidade.",
)
def obter_resumo_capacidade(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if (
        current_user.role != models.UserRole.PROFESSIONAL.value
        and current_user.role != models.UserRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas prestadores de serviço ou administradores podem acessar o resumo de capacidade.",
        )

    query = db.query(models.Orcamento)
    if current_user.role == models.UserRole.PROFESSIONAL.value:
        prof = db.query(models.Professional).filter(models.Professional.email == current_user.email).first()
        if not prof:
            return OrcamentoResumoCapacidade()
        query = query.filter(models.Orcamento.professional_id == prof.id)

    linhas = (
        query.with_entities(models.Orcamento.status, func.count(models.Orcamento.id))
        .group_by(models.Orcamento.status)
        .all()
    )
    contagem = dict(linhas)
    pendentes = contagem.get(models.OrcamentoStatus.PENDENTE.value, 0)
    aceitos = contagem.get(models.OrcamentoStatus.ACEITO.value, 0)
    recusados = contagem.get(models.OrcamentoStatus.RECUSADO.value, 0)
    respondidos = contagem.get(models.OrcamentoStatus.RESPONDIDO.value, 0)
    total = sum(contagem.values())

    return OrcamentoResumoCapacidade(
        total=total,
        pendentes=pendentes,
        aceitos=aceitos,
        recusados=recusados,
        respondidos=respondidos,
    )


# ---------------------------------------------------------------------------
# Consultar Orçamento por ID
# ---------------------------------------------------------------------------


@router.get(
    "/{orcamento_id}",
    response_model=OrcamentoRead,
    summary="Obter detalhes do orçamento",
    description="Retorna os dados completos do orçamento e metadados das fotos anexadas.",
)
def obter_orcamento(
    orcamento_id: int,
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    orcamento = db.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
    if not orcamento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orçamento não encontrado.",
        )

    # Controle de acesso se usuário estiver autenticado
    if current_user and current_user.role != models.UserRole.ADMIN.value:
        prof = db.query(models.Professional).filter(models.Professional.email == current_user.email).first()
        eh_profissional_alvo = prof and prof.id == orcamento.professional_id
        email_limpo = current_user.email.strip().lower()
        cli = db.query(models.Cliente).filter(models.Cliente.email == email_limpo).first()
        eh_cliente_autor = (
            orcamento.cliente_email == email_limpo
            or orcamento.cliente_id == current_user.id
            or (cli is not None and orcamento.cliente_id == cli.id)
        )
        if not (eh_profissional_alvo or eh_cliente_autor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado aos detalhes deste orçamento.",
            )

    return _montar_orcamento_read(orcamento)


# ---------------------------------------------------------------------------
# Download / Visualização de Foto de Orçamento
# ---------------------------------------------------------------------------


@router.get(
    "/{orcamento_id}/fotos/{foto_id}",
    summary="Baixar ou visualizar foto do orçamento",
    description="Serve o arquivo binário da foto anexada ao orçamento com validação de path traversal.",
)
def obter_foto_orcamento(
    orcamento_id: int,
    foto_id: int,
    db: Session = Depends(get_db),
):
    foto = (
        db.query(models.OrcamentoFoto)
        .filter(
            models.OrcamentoFoto.id == foto_id,
            models.OrcamentoFoto.orcamento_id == orcamento_id,
        )
        .first()
    )
    if not foto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Foto de orçamento não encontrada.",
        )

    try:
        arquivo_path = storage.resolve_orcamento_photo_path(foto.caminho_arquivo)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Caminho de foto inválido.",
        )

    if not arquivo_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo físico da foto não encontrado no disco.",
        )

    return FileResponse(
        path=arquivo_path,
        media_type=foto.mime_type,
        filename=foto.nome_original,
    )


# ---------------------------------------------------------------------------
# Responder Orçamento (Profissional) - Issue #22 / #34
# ---------------------------------------------------------------------------


@router.patch(
    "/{orcamento_id}/responder",
    response_model=OrcamentoRead,
    summary="Responder orçamento com estimativa",
    description="Permite ao profissional atribuir um valor estimado e parecer técnico ao orçamento.",
)
def responder_orcamento(
    orcamento_id: int,
    payload: OrcamentoResponder,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orcamento = db.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
    if not orcamento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orçamento não encontrado.",
        )

    # Apenas o profissional destinatário ou um administrador pode responder
    prof = db.query(models.Professional).filter(models.Professional.email == current_user.email).first()
    eh_dono = prof and prof.id == orcamento.professional_id
    eh_admin = current_user.role == models.UserRole.ADMIN.value

    if not (eh_dono or eh_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o profissional destinatário deste orçamento pode respondê-lo.",
        )

    # Validação de integridade do ciclo de vida: solicitações já decididas ou canceladas são terminais
    if orcamento.status in (
        models.OrcamentoStatus.ACEITO.value,
        models.OrcamentoStatus.RECUSADO.value,
        models.OrcamentoStatus.CANCELADO.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta solicitação já foi decidida e não pode receber nova estimativa.",
        )

    orcamento.valor_estimado = payload.valor_estimado
    orcamento.resposta_profissional = payload.resposta_profissional.strip()
    orcamento.status = models.OrcamentoStatus.RESPONDIDO.value
    orcamento.respondido_em = datetime.now(timezone.utc)

    db.commit()
    db.refresh(orcamento)

    # Notifica o cliente solicitante via WebSocket e e-mail
    nome_prof = prof.name if prof else "O profissional"
    registrar_e_enviar_notificacao(
        db=db,
        user_email=orcamento.cliente_email,
        titulo=f"Orçamento Respondido por {nome_prof}",
        mensagem=f"{nome_prof} estimou o valor em R$ {payload.valor_estimado:.2f}. Acesse a plataforma para conferir.",
        tipo="orcamento_respondido",
        referencia_id=orcamento.id,
        payload_extra={
            "orcamento_id": orcamento.id,
            "valor_estimado": payload.valor_estimado,
            "profissional_nome": nome_prof,
        },
    )

    background_tasks.add_task(
        enviar_email_alerta_orcamento,
        destinatario_email=orcamento.cliente_email,
        destinatario_nome=orcamento.cliente_nome,
        titulo=f"Seu orçamento foi respondido por {nome_prof}!",
        descricao=f"Estimativa: R$ {payload.valor_estimado:.2f}. Observações: {payload.resposta_profissional}",
        orcamento_id=orcamento.id,
    )

    logger.info("Orçamento #%d respondido pelo profissional com valor R$ %.2f", orcamento.id, payload.valor_estimado)
    return _montar_orcamento_read(orcamento)


# ---------------------------------------------------------------------------
# Aceitar Solicitação de Orçamento (Profissional) - Issue #29
# ---------------------------------------------------------------------------


@router.patch(
    "/{orcamento_id}/aceitar",
    response_model=OrcamentoRead,
    summary="Aceitar solicitação de orçamento (Issue #29)",
    description="Permite ao prestador de serviços aceitar a solicitação de orçamento para gerenciar sua capacidade.",
)
def aceitar_orcamento(
    orcamento_id: int,
    payload: OrcamentoAceitar,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orcamento = db.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
    if not orcamento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orçamento não encontrado.",
        )

    prof = db.query(models.Professional).filter(models.Professional.email == current_user.email).first()
    eh_dono = prof and prof.id == orcamento.professional_id
    eh_admin = current_user.role == models.UserRole.ADMIN.value

    if not (eh_dono or eh_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o profissional destinatário deste orçamento pode aceitá-lo.",
        )

    # Validação de transição de estado defensiva
    if orcamento.status == models.OrcamentoStatus.ACEITO.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta solicitação de orçamento já foi aceita anteriormente.",
        )
    if orcamento.status == models.OrcamentoStatus.RECUSADO.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível aceitar uma solicitação de orçamento que já foi recusada.",
        )
    if orcamento.status == models.OrcamentoStatus.CANCELADO.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível aceitar uma solicitação de orçamento cancelada pelo cliente.",
        )

    agora = datetime.now(timezone.utc)
    orcamento.status = models.OrcamentoStatus.ACEITO.value
    orcamento.decidido_em = agora
    orcamento.respondido_em = agora

    if payload.valor_estimado is not None:
        orcamento.valor_estimado = payload.valor_estimado
    if payload.mensagem:
        orcamento.resposta_profissional = payload.mensagem.strip()
    if payload.data_prevista is not None:
        orcamento.data_prevista = payload.data_prevista

    db.commit()
    db.refresh(orcamento)

    nome_prof = prof.name if prof else "O profissional"
    titulo_notificacao = f"Orçamento #{orcamento.id} Aceito por {nome_prof}!"
    detalhes_msg = f"{nome_prof} aceitou sua solicitação de orçamento."
    if payload.valor_estimado:
        detalhes_msg += f" Estimativa preliminar: R$ {payload.valor_estimado:.2f}."
    if payload.mensagem:
        detalhes_msg += f" Mensagem: {payload.mensagem.strip()}."

    registrar_e_enviar_notificacao(
        db=db,
        user_email=orcamento.cliente_email,
        titulo=titulo_notificacao,
        mensagem=detalhes_msg,
        tipo="orcamento_aceito",
        referencia_id=orcamento.id,
        payload_extra={
            "orcamento_id": orcamento.id,
            "status": "aceito",
            "profissional_nome": nome_prof,
            "valor_estimado": payload.valor_estimado,
            "data_prevista": payload.data_prevista.isoformat() if payload.data_prevista else None,
        },
    )

    background_tasks.add_task(
        enviar_email_alerta_orcamento,
        destinatario_email=orcamento.cliente_email,
        destinatario_nome=orcamento.cliente_nome,
        titulo=titulo_notificacao,
        descricao=detalhes_msg,
        orcamento_id=orcamento.id,
    )

    logger.info("Orçamento #%d aceito pelo profissional '%s'.", orcamento.id, current_user.email)
    return _montar_orcamento_read(orcamento)


# ---------------------------------------------------------------------------
# Recusar Solicitação de Orçamento (Profissional) - Issue #29
# ---------------------------------------------------------------------------


@router.patch(
    "/{orcamento_id}/recusar",
    response_model=OrcamentoRead,
    summary="Recusar solicitação de orçamento (Issue #29)",
    description="Permite ao prestador de serviços recusar a solicitação de orçamento justificando o motivo para gerenciar sua capacidade.",
)
def recusar_orcamento(
    orcamento_id: int,
    payload: OrcamentoRecusar,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orcamento = db.query(models.Orcamento).filter(models.Orcamento.id == orcamento_id).first()
    if not orcamento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orçamento não encontrado.",
        )

    prof = db.query(models.Professional).filter(models.Professional.email == current_user.email).first()
    eh_dono = prof and prof.id == orcamento.professional_id
    eh_admin = current_user.role == models.UserRole.ADMIN.value

    if not (eh_dono or eh_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o profissional destinatário deste orçamento pode recusá-lo.",
        )

    # Validação de transição de estado defensiva
    if orcamento.status == models.OrcamentoStatus.RECUSADO.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta solicitação de orçamento já foi recusada anteriormente.",
        )
    if orcamento.status == models.OrcamentoStatus.ACEITO.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível recusar uma solicitação de orçamento que já foi aceita.",
        )
    if orcamento.status == models.OrcamentoStatus.CANCELADO.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível recusar uma solicitação de orçamento cancelada pelo cliente.",
        )

    agora = datetime.now(timezone.utc)
    orcamento.status = models.OrcamentoStatus.RECUSADO.value
    orcamento.motivo_recusa = payload.motivo.strip()
    orcamento.justificativa_recusa = (
        payload.justificativa_detalhada.strip() if payload.justificativa_detalhada else None
    )
    orcamento.decidido_em = agora

    db.commit()
    db.refresh(orcamento)

    nome_prof = prof.name if prof else "O profissional"
    titulo_notificacao = f"Orçamento #{orcamento.id} Recusado"
    detalhes_msg = (
        f"{nome_prof} não pôde aceitar sua solicitação no momento. Motivo: {payload.motivo.strip()}."
    )
    if payload.justificativa_detalhada:
        detalhes_msg += f" Detalhes: {payload.justificativa_detalhada.strip()}."

    registrar_e_enviar_notificacao(
        db=db,
        user_email=orcamento.cliente_email,
        titulo=titulo_notificacao,
        mensagem=detalhes_msg,
        tipo="orcamento_recusado",
        referencia_id=orcamento.id,
        payload_extra={
            "orcamento_id": orcamento.id,
            "status": "recusado",
            "profissional_nome": nome_prof,
            "motivo": payload.motivo.strip(),
        },
    )

    background_tasks.add_task(
        enviar_email_alerta_orcamento,
        destinatario_email=orcamento.cliente_email,
        destinatario_nome=orcamento.cliente_nome,
        titulo=titulo_notificacao,
        descricao=detalhes_msg,
        orcamento_id=orcamento.id,
    )

    logger.info(
        "Orçamento #%d recusado pelo profissional '%s'. Motivo: %s",
        orcamento.id,
        current_user.email,
        payload.motivo,
    )
    return _montar_orcamento_read(orcamento)

