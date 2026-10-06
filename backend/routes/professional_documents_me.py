"""
Rotas de documentos do profissional autenticado (issue #55 · Tarefa 1 · Fase B).

Cada profissional gerencia **apenas os próprios** documentos: o dono dos
recursos é sempre derivado do token de acesso (`get_current_professional`),
nunca de um ID informado pelo cliente — por construção, não há IDOR.

Regras de estado (sem novo enum, derivadas do que já existe):

- `documents_submitted_at` nulo -> rascunho (edição livre);
- enviado e `approval_status != "rejected"` -> edição bloqueada (409);
- enviado e `approval_status == "rejected"` -> pode corrigir e reenviar.

As rotas legadas `/api/professionals/{professional_id}/documents` (issues #58
e #17) não são alteradas por este módulo. Em `main.py`, este router precisa ser
registrado ANTES do router de profissionais para que `/me` não seja capturado
pelo path param `{professional_id}`.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import notificacoes
import schemas
import storage
from database import get_db
from professional_access import get_current_professional

router = APIRouter(
    prefix="/api/professionals/me/documents",
    tags=["Documentos do Profissional"],
)

# Documentos obrigatórios para habilitar o envio para análise.
DOCUMENTOS_OBRIGATORIOS: List[str] = [
    models.DocumentType.PHOTO_ID.value,
    models.DocumentType.PROOF_OF_RESIDENCE.value,
]


def _edicao_bloqueada(professional: models.Professional) -> bool:
    """True quando o envio já foi feito e ainda não foi rejeitado."""
    return (
        professional.documents_submitted_at is not None
        and professional.approval_status != models.ProfessionalApprovalStatus.REJECTED.value
    )


def _garantir_edicao_permitida(professional: models.Professional) -> None:
    """Levanta HTTP 409 quando os documentos estão bloqueados para edição."""
    if _edicao_bloqueada(professional):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Os documentos já foram enviados para análise e não podem ser alterados "
                "enquanto o envio não for rejeitado."
            ),
        )


def _documentos_do(professional_id: int, db: Session) -> List[models.ProfessionalDocument]:
    """Lista os documentos do profissional em ordem estável de upload."""
    return (
        db.query(models.ProfessionalDocument)
        .filter(models.ProfessionalDocument.professional_id == professional_id)
        .order_by(
            models.ProfessionalDocument.uploaded_at.asc(),
            models.ProfessionalDocument.id.asc(),
        )
        .all()
    )


def _documento_read(doc: models.ProfessionalDocument) -> schemas.ProfessionalDocumentRead:
    """Serializa um documento no formato público de leitura."""
    return schemas.ProfessionalDocumentRead(
        id=doc.id,
        professional_id=doc.professional_id,
        document_type=doc.document_type,
        file_name=doc.file_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        uploaded_at=doc.uploaded_at,
        download_url=f"/api/professionals/{doc.professional_id}/documents/{doc.id}/download",
    )


def _faltantes_obrigatorios(docs: List[models.ProfessionalDocument]) -> List[str]:
    """Tipos obrigatórios ainda ausentes, na ordem canônica."""
    tipos = {doc.document_type for doc in docs}
    return [tipo for tipo in DOCUMENTOS_OBRIGATORIOS if tipo not in tipos]


def montar_resumo(
    professional: models.Professional,
    docs: List[models.ProfessionalDocument],
) -> schemas.ProfessionalDocumentsMeSummaryRead:
    """Monta o resumo do envio exibido na tela do profissional."""
    tipos = {doc.document_type for doc in docs}
    faltantes = _faltantes_obrigatorios(docs)

    return schemas.ProfessionalDocumentsMeSummaryRead(
        professional_id=professional.id,
        approval_status=professional.approval_status,
        approval_notes=professional.approval_notes,
        has_photo_id=models.DocumentType.PHOTO_ID.value in tipos,
        has_proof_of_residence=models.DocumentType.PROOF_OF_RESIDENCE.value in tipos,
        has_technical_certificate=models.DocumentType.TECHNICAL_CERTIFICATE.value in tipos,
        has_profile_photo=models.DocumentType.PROFILE_PHOTO.value in tipos,
        is_complete=not faltantes,
        documents=[_documento_read(doc) for doc in docs],
        submitted_at=professional.documents_submitted_at,
        can_submit=not faltantes and not _edicao_bloqueada(professional),
        missing_required=faltantes,
    )


@router.get(
    "",
    response_model=schemas.ProfessionalDocumentsMeSummaryRead,
    summary="Consultar meus documentos",
    description=(
        "Retorna o resumo do envio de documentos do profissional autenticado: "
        "documentos anexados, obrigatórios ausentes e estado do envio "
        "(rascunho / em análise / rejeitado / aprovado)."
    ),
)
def list_my_documents(
    professional: models.Professional = Depends(get_current_professional),
    db: Session = Depends(get_db),
):
    """Resumo dos documentos do próprio profissional autenticado."""
    docs = _documentos_do(professional.id, db)
    return montar_resumo(professional, docs)


@router.post(
    "",
    response_model=schemas.ProfessionalDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Anexar documento",
    description=(
        "Envia um documento do profissional autenticado (multipart: document_type + file). "
        "Reenviar o mesmo tipo substitui o arquivo anterior. Bloqueado com 409 após o envio para análise."
    ),
)
async def upload_my_document(
    document_type: str = Form(
        ...,
        description="Tipo do documento: photo_id, proof_of_residence, technical_certificate, profile_photo",
    ),
    file: UploadFile = File(
        ...,
        description="Arquivo nos formatos permitidos (PDF, JPEG, PNG, WebP) com tamanho máximo de 10 MB",
    ),
    professional: models.Professional = Depends(get_current_professional),
    db: Session = Depends(get_db),
):
    """Anexa (ou substitui) um documento do próprio profissional autenticado."""
    _garantir_edicao_permitida(professional)

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
            models.ProfessionalDocument.professional_id == professional.id,
            models.ProfessionalDocument.document_type == clean_doc_type,
        )
        .first()
    )

    if existing_doc:
        storage.delete_document_file(existing_doc.file_path)
        rel_path, clean_name = storage.save_document_file(
            professional.id, file.filename or "document", content
        )
        existing_doc.file_name = clean_name
        existing_doc.file_path = rel_path
        existing_doc.file_size = len(content)
        existing_doc.mime_type = file.content_type or "application/octet-stream"
        existing_doc.uploaded_at = datetime.now(timezone.utc)
        doc = existing_doc
    else:
        rel_path, clean_name = storage.save_document_file(
            professional.id, file.filename or "document", content
        )
        doc = models.ProfessionalDocument(
            professional_id=professional.id,
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

    return _documento_read(doc)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir meu documento",
    description=(
        "Remove um documento do profissional autenticado do banco e do disco. "
        "Documento de outro profissional retorna 404. Bloqueado com 409 após o envio para análise."
    ),
)
def delete_my_document(
    document_id: int,
    professional: models.Professional = Depends(get_current_professional),
    db: Session = Depends(get_db),
):
    """Exclui um documento do próprio profissional autenticado."""
    _garantir_edicao_permitida(professional)

    doc = (
        db.query(models.ProfessionalDocument)
        .filter(
            models.ProfessionalDocument.id == document_id,
            models.ProfessionalDocument.professional_id == professional.id,
        )
        .first()
    )
    if doc is None:
        # 404 (e não 403) para não vazar a existência de documentos de terceiros.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado.",
        )

    storage.delete_document_file(doc.file_path)
    db.delete(doc)
    db.commit()

    return None


@router.post(
    "/submit",
    response_model=schemas.ProfessionalDocumentsMeSummaryRead,
    summary="Enviar documentos para análise",
    description=(
        "Valida os documentos obrigatórios, marca o envio para análise e notifica "
        "os administradores ativos por e-mail. Retorna 422 com `missing_required` "
        "quando faltam documentos obrigatórios e 409 quando já existe um envio em "
        "andamento/aprovado (reenvio permitido apenas após rejeição)."
    ),
)
def submit_my_documents(
    professional: models.Professional = Depends(get_current_professional),
    db: Session = Depends(get_db),
):
    """Envia os documentos do próprio profissional para análise de um administrador."""
    _garantir_edicao_permitida(professional)

    docs = _documentos_do(professional.id, db)
    faltantes = _faltantes_obrigatorios(docs)
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Anexe os documentos obrigatórios antes de enviar para análise.",
                "missing_required": faltantes,
            },
        )

    professional.documents_submitted_at = datetime.now(timezone.utc)
    professional.approval_status = models.ProfessionalApprovalStatus.PENDING.value
    db.commit()
    db.refresh(professional)

    # Notificação best-effort: falha de e-mail nunca quebra a submissão.
    notificacoes.notificar_admins_documentos_enviados(db, professional)

    return montar_resumo(professional, docs)
