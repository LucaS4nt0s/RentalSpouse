"""
Rotas de Moderação Administrativa de Profissionais (Issue #64).

Permite que administradores autenticados:
- Consultem a fila FIFO de profissionais pendentes de avaliação de documentos;
- Filtrem profissionais por status de moderação;
- Auditem detalhadamente os dados cadastrais e documentos anexados;
- Aprovem o cadastro com registro de auditoria e notificação por e-mail;
- Rejeitem o cadastro com justificativa obrigatória e notificação por e-mail,
  reabrindo o fluxo para reenvio de documentos pelo profissional.
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
import models
from notificacoes import (
    notificar_profissional_aprovado,
    notificar_profissional_rejeitado,
)
from schemas import (
    ProfessionalDocumentRead,
    ProfessionalModerationDecisionRead,
    ProfessionalModerationItemRead,
    ProfessionalModerationReviewRead,
    ProfessionalRejectPayload,
)
from security import get_current_admin

router = APIRouter(
    prefix="/api/admins/professionals",
    tags=["Moderação Administrativa"],
)


def _compute_documents_info(
    docs: List[models.ProfessionalDocument],
) -> dict:
    """Calcula indicadores de completude e contagem dos documentos anexados."""
    doc_types = {d.document_type for d in docs}
    has_photo_id = models.DocumentType.PHOTO_ID.value in doc_types
    has_proof_of_residence = models.DocumentType.PROOF_OF_RESIDENCE.value in doc_types
    has_technical_certificate = models.DocumentType.TECHNICAL_CERTIFICATE.value in doc_types
    has_profile_photo = models.DocumentType.PROFILE_PHOTO.value in doc_types
    is_complete = has_photo_id and has_proof_of_residence

    return {
        "documents_count": len(docs),
        "has_photo_id": has_photo_id,
        "has_proof_of_residence": has_proof_of_residence,
        "has_technical_certificate": has_technical_certificate,
        "has_profile_photo": has_profile_photo,
        "is_complete": is_complete,
    }


def _build_moderation_item(
    prof: models.Professional,
    docs: List[models.ProfessionalDocument],
) -> ProfessionalModerationItemRead:
    """Monta o schema de leitura para um item da lista de moderação."""
    doc_info = _compute_documents_info(docs)
    return ProfessionalModerationItemRead(
        id=prof.id,
        name=prof.name,
        email=prof.email,
        phone=prof.phone,
        city=prof.city,
        state=prof.state,
        specialties=prof.specialties or [],
        approval_status=prof.approval_status,
        approval_notes=prof.approval_notes,
        documents_submitted_at=prof.documents_submitted_at,
        approved_at=prof.approved_at,
        approved_by_id=prof.approved_by_id,
        created_at=prof.created_at,
        updated_at=prof.updated_at,
        documents_count=doc_info["documents_count"],
        has_photo_id=doc_info["has_photo_id"],
        has_proof_of_residence=doc_info["has_proof_of_residence"],
        has_technical_certificate=doc_info["has_technical_certificate"],
        has_profile_photo=doc_info["has_profile_photo"],
        is_complete=doc_info["is_complete"],
    )


@router.get(
    "/pending",
    response_model=List[ProfessionalModerationItemRead],
    summary="Listar profissionais pendentes de moderação",
    description="Retorna a fila de profissionais com documentos submetidos aguardando análise administrativa (ordem FIFO).",
)
def list_pending_professionals(
    skip: int = Query(0, ge=0, description="Registros a pular"),
    limit: int = Query(50, ge=1, le=100, description="Limite de registros"),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Fila de moderação: profissionais pendentes com documentos enviados, ordenados por tempo de espera."""
    query = (
        db.query(models.Professional)
        .filter(
            models.Professional.approval_status == models.ProfessionalApprovalStatus.PENDING.value,
            models.Professional.documents_submitted_at.isnot(None),
        )
        .order_by(models.Professional.documents_submitted_at.asc(), models.Professional.id.asc())
        .offset(skip)
        .limit(limit)
    )
    professionals = query.all()

    # Coleta IDs e busca documentos em lote para evitar N+1 queries
    prof_ids = [p.id for p in professionals]
    docs_by_prof: dict[int, list[models.ProfessionalDocument]] = {pid: [] for pid in prof_ids}
    if prof_ids:
        all_docs = (
            db.query(models.ProfessionalDocument)
            .filter(models.ProfessionalDocument.professional_id.in_(prof_ids))
            .all()
        )
        for doc in all_docs:
            docs_by_prof[doc.professional_id].append(doc)

    return [_build_moderation_item(p, docs_by_prof[p.id]) for p in professionals]


@router.get(
    "",
    response_model=List[ProfessionalModerationItemRead],
    summary="Listar profissionais para painel administrativo",
    description="Retorna listagem de profissionais com suporte a filtro por status de aprovação (pending_approval, approved, rejected ou all).",
)
def list_moderation_professionals(
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filtro de status de aprovação (pending_approval, approved, rejected, all)",
    ),
    skip: int = Query(0, ge=0, description="Registros a pular"),
    limit: int = Query(50, ge=1, le=100, description="Limite de registros"),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Listagem geral para o painel administrativo de profissionais."""
    query = db.query(models.Professional)

    if status_filter and status_filter.strip().lower() != "all":
        query = query.filter(
            models.Professional.approval_status == status_filter.strip().lower()
        )

    professionals = (
        query.order_by(
            models.Professional.documents_submitted_at.desc().nullslast(),
            models.Professional.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    prof_ids = [p.id for p in professionals]
    docs_by_prof: dict[int, list[models.ProfessionalDocument]] = {pid: [] for pid in prof_ids}
    if prof_ids:
        all_docs = (
            db.query(models.ProfessionalDocument)
            .filter(models.ProfessionalDocument.professional_id.in_(prof_ids))
            .all()
        )
        for doc in all_docs:
            docs_by_prof[doc.professional_id].append(doc)

    return [_build_moderation_item(p, docs_by_prof[p.id]) for p in professionals]


@router.get(
    "/{professional_id}/review",
    response_model=ProfessionalModerationReviewRead,
    summary="Detalhes completos do profissional para auditoria administrativa",
    description="Retorna dados cadastrais completos, lista de documentos anexados com links seguros de download e histórico de moderação.",
)
def get_professional_for_review(
    professional_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Consulta os detalhes cadastrais e os documentos de um profissional específico para análise."""
    professional = (
        db.query(models.Professional)
        .filter(models.Professional.id == professional_id)
        .first()
    )
    if not professional:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional não encontrado.",
        )

    documents = (
        db.query(models.ProfessionalDocument)
        .filter(models.ProfessionalDocument.professional_id == professional_id)
        .order_by(models.ProfessionalDocument.uploaded_at.asc())
        .all()
    )

    doc_info = _compute_documents_info(documents)

    doc_reads = [
        ProfessionalDocumentRead(
            id=d.id,
            professional_id=d.professional_id,
            document_type=d.document_type,
            file_name=d.file_name,
            file_size=d.file_size,
            mime_type=d.mime_type,
            uploaded_at=d.uploaded_at,
            download_url=f"/api/professionals/{professional.id}/documents/{d.id}/download",
        )
        for d in documents
    ]

    approved_by_name = None
    if professional.approved_by_id:
        admin_user = (
            db.query(models.User)
            .filter(models.User.id == professional.approved_by_id)
            .first()
        )
        if admin_user:
            approved_by_name = admin_user.name

    return ProfessionalModerationReviewRead(
        id=professional.id,
        name=professional.name,
        email=professional.email,
        phone=professional.phone,
        bio=professional.bio,
        service_radius_km=professional.service_radius_km,
        specialties=professional.specialties or [],
        city=professional.city,
        state=professional.state,
        is_active=professional.is_active,
        approval_status=professional.approval_status,
        approval_notes=professional.approval_notes,
        documents_submitted_at=professional.documents_submitted_at,
        approved_at=professional.approved_at,
        approved_by_id=professional.approved_by_id,
        approved_by_name=approved_by_name,
        created_at=professional.created_at,
        updated_at=professional.updated_at,
        is_complete=doc_info["is_complete"],
        documents=doc_reads,
    )


@router.post(
    "/{professional_id}/approve",
    response_model=ProfessionalModerationDecisionRead,
    summary="Aprovar cadastro de profissional",
    description="Transiciona o status do profissional para 'approved', grava dados de auditoria e dispara notificação por e-mail.",
)
def approve_professional(
    professional_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """
    Aprova o cadastro e a documentação do profissional.
    Exige privilégio de administrador e que os documentos obrigatórios estejam presentes.
    """
    professional = (
        db.query(models.Professional)
        .filter(models.Professional.id == professional_id)
        .first()
    )
    if not professional:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional não encontrado.",
        )

    if professional.approval_status == models.ProfessionalApprovalStatus.APPROVED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O profissional já se encontra com cadastro aprovado.",
        )

    documents = (
        db.query(models.ProfessionalDocument)
        .filter(models.ProfessionalDocument.professional_id == professional_id)
        .all()
    )
    doc_info = _compute_documents_info(documents)
    if not doc_info["is_complete"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível aprovar o profissional: documentos obrigatórios ausentes (documento com foto e comprovante de residência).",
        )

    now = datetime.now(timezone.utc)
    professional.approval_status = models.ProfessionalApprovalStatus.APPROVED.value
    professional.approved_at = now
    professional.approved_by_id = current_admin.id
    professional.approval_notes = None

    db.commit()
    db.refresh(professional)

    # Dispara e-mail não-bloqueante ao profissional
    notificar_profissional_aprovado(professional)

    return ProfessionalModerationDecisionRead(
        id=professional.id,
        name=professional.name,
        email=professional.email,
        approval_status=professional.approval_status,
        approval_notes=professional.approval_notes,
        approved_at=professional.approved_at,
        approved_by_id=professional.approved_by_id,
        updated_at=professional.updated_at,
        message="Cadastro e documentos do profissional aprovados com sucesso.",
    )


@router.post(
    "/{professional_id}/reject",
    response_model=ProfessionalModerationDecisionRead,
    summary="Rejeitar cadastro de profissional com justificativa",
    description="Transiciona o status para 'rejected', grava a justificativa de reprovação e notifica o profissional por e-mail para permitir reenvio.",
)
def reject_professional(
    professional_id: int,
    payload: ProfessionalRejectPayload,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """
    Rejeita a documentação do profissional informando o motivo.
    Reabre o fluxo para que o profissional possa corrigir e reenviar seus documentos.
    """
    professional = (
        db.query(models.Professional)
        .filter(models.Professional.id == professional_id)
        .first()
    )
    if not professional:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional não encontrado.",
        )

    if professional.approval_status == models.ProfessionalApprovalStatus.REJECTED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O profissional já se encontra com cadastro reprovado.",
        )

    if professional.documents_submitted_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O profissional ainda não submeteu documentos para análise.",
        )

    reason_clean = payload.reason.strip()

    professional.approval_status = models.ProfessionalApprovalStatus.REJECTED.value
    professional.approval_notes = reason_clean
    professional.approved_at = None
    professional.approved_by_id = current_admin.id

    db.commit()
    db.refresh(professional)

    # Dispara e-mail não-bloqueante com o motivo da reprovação
    notificar_profissional_rejeitado(professional, reason_clean)

    return ProfessionalModerationDecisionRead(
        id=professional.id,
        name=professional.name,
        email=professional.email,
        approval_status=professional.approval_status,
        approval_notes=professional.approval_notes,
        approved_at=None,
        approved_by_id=professional.approved_by_id,
        updated_at=professional.updated_at,
        message="Cadastro do profissional reprovado e justificativa registrada com sucesso.",
    )
