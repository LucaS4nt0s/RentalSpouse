from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from database import get_db
from schemas import (
    ProfessionalCreate,
    ProfessionalDocumentRead,
    ProfessionalDocumentsSummaryRead,
    ProfessionalRead,
    ProfessionalUpdate,
)
from security import get_optional_current_user
import storage

router = APIRouter(prefix="/api/professionals", tags=["Profissionais"])


@router.post(
    "",
    response_model=ProfessionalRead,
    status_code=status.HTTP_201_CREATED,
    summary="Criar perfil de profissional",
)
def create_professional(
    payload: ProfessionalCreate,
    db: Session = Depends(get_db),
):
    """
    Cria um perfil de profissional com bio detalhada, especialidades e raio de atendimento.
    Garante unicidade de e-mail e validação das especialidades e raio mínimo (>= 1 km).
    """
    existing_professional = (
        db.query(models.Professional)
        .filter(models.Professional.email == payload.email)
        .first()
    )
    if existing_professional:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado para outro profissional.",
        )

    professional = models.Professional(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        bio=payload.bio,
        service_radius_km=payload.service_radius_km,
        specialties=payload.specialties,
        city=payload.city,
        state=payload.state,
    )
    try:
        db.add(professional)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado para outro profissional.",
        )

    db.refresh(professional)

    return professional


@router.get("", response_model=List[ProfessionalRead], summary="Listar profissionais")
def list_professionals(
    specialty: Optional[str] = Query(
        None, description="Filtra por especialidade do profissional"
    ),
    city: Optional[str] = Query(None, description="Filtra por cidade base"),
    approval_status: Optional[str] = Query(
        None, description="Filtra por status de aprovação cadastral (ex: pending_approval, approved, rejected)"
    ),
    skip: int = Query(0, ge=0, description="Número de registros a pular"),
    limit: int = Query(50, ge=1, le=100, description="Limite máximo de registros"),
    db: Session = Depends(get_db),
):
    """
    Lista profissionais cadastrados ativos, com suporte a busca e filtros por
    especialidade, cidade, status de aprovação e paginação.
    """
    query = db.query(models.Professional).filter(models.Professional.is_active.is_(True))

    if approval_status:
        query = query.filter(models.Professional.approval_status == approval_status.strip().lower())

    if city:
        query = query.filter(models.Professional.city.ilike(f"%{city.strip()}%"))

    if not specialty:
        return (
            query.order_by(models.Professional.id.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    target_spec = specialty.strip().lower()
    professionals = query.order_by(models.Professional.id.asc()).all()
    filtered = [
        p
        for p in professionals
        if any(target_spec in (s.lower() if isinstance(s, str) else "") for s in (p.specialties or []))
    ]

    return filtered[skip : skip + limit]


@router.get("/{professional_id}", response_model=ProfessionalRead, summary="Obter profissional por ID")
def get_professional_by_id(
    professional_id: int,
    db: Session = Depends(get_db),
):
    """
    Busca os detalhes completos do perfil de um profissional pelo ID.
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

    return professional


@router.put("/{professional_id}", response_model=ProfessionalRead, summary="Atualizar profissional")
def update_professional(
    professional_id: int,
    payload: ProfessionalUpdate,
    db: Session = Depends(get_db),
):
    """
    Atualiza dados cadastrais, especialidades, bio ou raio de atendimento do profissional.
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

    if payload.email and payload.email != professional.email:
        existing = (
            db.query(models.Professional)
            .filter(
                models.Professional.email == payload.email,
                models.Professional.id != professional_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="E-mail já está em uso por outro profissional.",
            )

    update_fields = payload.model_dump(exclude_unset=True)
    for field_name, value in update_fields.items():
        setattr(professional, field_name, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já está em uso por outro profissional.",
        )

    db.refresh(professional)

    return professional


@router.delete("/{professional_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remover profissional")
def delete_professional(
    professional_id: int,
    db: Session = Depends(get_db),
):
    """
    Remove o perfil de um profissional da plataforma.
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

    # Remove também os arquivos físicos de documentos do profissional
    for doc in professional.documents:
        storage.delete_document_file(doc.file_path)
    storage.delete_professional_directory(professional.id)

    db.delete(professional)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Endpoints de Gestão de Documentos do Profissional
# ---------------------------------------------------------------------------


@router.post(
    "/{professional_id}/documents",
    response_model=ProfessionalDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar documento do profissional",
    description="Realiza upload de documento para validação cadastral (photo_id, proof_of_residence, technical_certificate, profile_photo).",
)
async def upload_professional_document(
    professional_id: int,
    document_type: str = Form(
        ...,
        description="Tipo do documento: photo_id, proof_of_residence, technical_certificate, profile_photo",
    ),
    file: UploadFile = File(
        ...,
        description="Arquivo nos formatos permitidos (PDF, JPEG, PNG, WebP) com tamanho máximo de 10 MB",
    ),
    db: Session = Depends(get_db),
):
    """
    Recebe um arquivo via multipart/form-data e associa ao profissional.
    Caso já exista um documento do mesmo tipo para o profissional, o arquivo anterior é
    substituído no armazenamento e o registro atualizado.
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

    clean_doc_type = (document_type or "").strip().lower()
    valid_types = [t.value for t in models.DocumentType]
    if clean_doc_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de documento '{document_type}' inválido. Tipos aceitos: {', '.join(valid_types)}.",
        )

    content = await file.read()
    try:
        storage.validate_document_file(file.filename, file.content_type, content)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    existing_doc = (
        db.query(models.ProfessionalDocument)
        .filter(
            models.ProfessionalDocument.professional_id == professional_id,
            models.ProfessionalDocument.document_type == clean_doc_type,
        )
        .first()
    )

    if existing_doc:
        storage.delete_document_file(existing_doc.file_path)
        rel_path, clean_name = storage.save_document_file(
            professional_id, file.filename or "document", content
        )
        existing_doc.file_name = clean_name
        existing_doc.file_path = rel_path
        existing_doc.file_size = len(content)
        existing_doc.mime_type = file.content_type or "application/octet-stream"
        existing_doc.uploaded_at = datetime.now(timezone.utc)
        doc = existing_doc
    else:
        rel_path, clean_name = storage.save_document_file(
            professional_id, file.filename or "document", content
        )
        doc = models.ProfessionalDocument(
            professional_id=professional_id,
            document_type=clean_doc_type,
            file_name=clean_name,
            file_path=rel_path,
            file_size=len(content),
            mime_type=file.content_type or "application/octet-stream",
        )
        db.add(doc)

    try:
        db.commit()
        db.refresh(doc)
    except IntegrityError:
        db.rollback()
        storage.delete_document_file(rel_path)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe um documento do tipo '{clean_doc_type}' cadastrado para este profissional.",
        )

    return ProfessionalDocumentRead(
        id=doc.id,
        professional_id=doc.professional_id,
        document_type=doc.document_type,
        file_name=doc.file_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        uploaded_at=doc.uploaded_at,
        download_url=f"/api/professionals/{professional_id}/documents/{doc.id}/download",
    )


@router.get(
    "/{professional_id}/documents",
    response_model=ProfessionalDocumentsSummaryRead,
    summary="Listar documentos do profissional",
    description="Retorna resumo de conformidade e todos os documentos enviados pelo profissional.",
)
def list_professional_documents(
    professional_id: int,
    db: Session = Depends(get_db),
):
    """
    Retorna o status dos documentos do profissional e sinaliza se a documentação
    mínima obrigatória (documento com foto + comprovante de residência) está completa.
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

    docs = (
        db.query(models.ProfessionalDocument)
        .filter(models.ProfessionalDocument.professional_id == professional_id)
        .order_by(models.ProfessionalDocument.uploaded_at.asc())
        .all()
    )

    doc_types = {d.document_type for d in docs}
    has_photo_id = models.DocumentType.PHOTO_ID.value in doc_types
    has_proof_of_residence = models.DocumentType.PROOF_OF_RESIDENCE.value in doc_types
    has_technical_certificate = models.DocumentType.TECHNICAL_CERTIFICATE.value in doc_types
    has_profile_photo = models.DocumentType.PROFILE_PHOTO.value in doc_types

    doc_reads = [
        ProfessionalDocumentRead(
            id=d.id,
            professional_id=d.professional_id,
            document_type=d.document_type,
            file_name=d.file_name,
            file_size=d.file_size,
            mime_type=d.mime_type,
            uploaded_at=d.uploaded_at,
            download_url=f"/api/professionals/{professional_id}/documents/{d.id}/download",
        )
        for d in docs
    ]

    return ProfessionalDocumentsSummaryRead(
        professional_id=professional.id,
        approval_status=professional.approval_status,
        approval_notes=professional.approval_notes,
        has_photo_id=has_photo_id,
        has_proof_of_residence=has_proof_of_residence,
        has_technical_certificate=has_technical_certificate,
        has_profile_photo=has_profile_photo,
        is_complete=(has_photo_id and has_proof_of_residence),
        documents=doc_reads,
    )


@router.get(
    "/{professional_id}/documents/{document_id}/download",
    summary="Baixar ou visualizar documento do profissional",
    description="Retorna o arquivo binário do documento para conferência ou download.",
)
def download_professional_document(
    professional_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_current_user),
):
    """
    Retorna o arquivo binário do documento para visualização ou download.
    Garante controle de acesso: apenas administradores ou o próprio profissional
    possuem permissão para baixar documentos sensíveis quando autenticados.
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

    # Controle de autorização
    if current_user and current_user.role != models.UserRole.ADMIN.value and current_user.email != professional.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito: você não tem permissão para acessar este documento.",
        )

    doc = (
        db.query(models.ProfessionalDocument)
        .filter(
            models.ProfessionalDocument.id == document_id,
            models.ProfessionalDocument.professional_id == professional_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado.",
        )

    try:
        file_path = storage.resolve_document_file_path(doc.file_path)
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado ao arquivo.",
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Caminho de arquivo inválido.",
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo não encontrado no servidor.",
        )

    return FileResponse(
        path=str(file_path),
        media_type=doc.mime_type,
        filename=doc.file_name,
    )


@router.delete(
    "/{professional_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir documento do profissional",
    description="Remove o documento do banco de dados e apaga o arquivo físico armazenado.",
)
def delete_professional_document(
    professional_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    """
    Remove o registro do documento e exclui o arquivo armazenado no disco.
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

    doc = (
        db.query(models.ProfessionalDocument)
        .filter(
            models.ProfessionalDocument.id == document_id,
            models.ProfessionalDocument.professional_id == professional_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado.",
        )

    storage.delete_document_file(doc.file_path)
    db.delete(doc)
    db.commit()

    return None
