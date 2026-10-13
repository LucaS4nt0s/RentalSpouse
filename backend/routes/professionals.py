from datetime import datetime, timezone
import re
from typing import List, Optional, Union

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import String, cast, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import notificacoes
import search
import storage
from database import get_db
from models import normalize_text
from rate_limiter import check_contact_rate_limit, check_search_rate_limit
from schemas import (
    PaginatedResponse,
    ProfessionalContactRequest,
    ProfessionalContactResponse,
    ProfessionalCreate,
    ProfessionalDocumentRead,
    ProfessionalDocumentsSummaryRead,
    ProfessionalPublicRead,
    ProfessionalRead,
    ProfessionalUpdate,
    SpecialtyCategoryRead,
    UFS_VALIDAS,
)
from security import get_optional_current_user, hash_senha

router = APIRouter(prefix="/api/professionals", tags=["Profissionais"])
profissionais_router = APIRouter(prefix="/api/profissionais", tags=["Profissionais"])


@router.post(
    "",
    response_model=ProfessionalRead,
    status_code=status.HTTP_201_CREATED,
    summary="Criar perfil de profissional",
)
@profissionais_router.post(
    "",
    response_model=ProfessionalRead,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
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

    existing_user = (
        db.query(models.User)
        .filter(models.User.email == payload.email)
        .first()
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado na plataforma.",
        )

    existing_cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.email == payload.email)
        .first()
    )
    if existing_cliente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado na plataforma.",
        )

    senha_hash = hash_senha(payload.password) if payload.password else None

    professional = models.Professional(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        bio=payload.bio,
        service_radius_km=payload.service_radius_km,
        specialties=payload.specialties,
        city=payload.city,
        state=payload.state,
        senha_hash=senha_hash,
    )
    try:
        db.add(professional)
        if senha_hash:
            user = models.User(
                name=payload.name,
                email=payload.email,
                hashed_password=senha_hash,
                role=models.UserRole.PROFESSIONAL.value,
                is_active=True,
                email_verificado=True,
            )
            db.add(user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado na plataforma.",
        )

    db.refresh(professional)

    return professional


def _escape_like(val: str) -> str:
    """Escapa caracteres especiais do SQL LIKE/ILIKE (% e _ e \\) para evitar desvios semânticos."""
    return val.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


CANONICAL_SPECIALTIES = [
    {
        "id": "eletrica",
        "name": "Elétrica",
        "slug": "eletrica",
        "icon": "Zap",
        "description": "Instalações elétricas, quadros de luz, tomadas e chuveiros",
    },
    {
        "id": "hidraulica",
        "name": "Hidráulica",
        "slug": "hidraulica",
        "icon": "Droplets",
        "description": "Vazamentos, desentupimentos, torneiras e encanamento geral",
    },
    {
        "id": "montagem-moveis",
        "name": "Montagem de Móveis",
        "slug": "montagem-de-moveis",
        "icon": "Hammer",
        "description": "Montagem e desmontagem de armários, camas, mesas e estantes",
    },
    {
        "id": "pintura",
        "name": "Pintura",
        "slug": "pintura",
        "icon": "Paintbrush",
        "description": "Pintura residencial interna, externa, massa corrida e texturas",
    },
    {
        "id": "reparos-gerais",
        "name": "Reparos Gerais",
        "slug": "reparos-gerais",
        "icon": "Wrench",
        "description": "Serviços gerais de marido de aluguel, furadeira e pequenos reparos",
    },
    {
        "id": "marcenaria",
        "name": "Marcenaria",
        "slug": "marcenaria",
        "icon": "Hammer",
        "description": "Móveis planejados, portas, gavetas e ajustes em madeira",
    },
    {
        "id": "limpeza",
        "name": "Limpeza",
        "slug": "limpeza",
        "icon": "Sparkles",
        "description": "Limpeza pós-obra, faxina residencial, higienização e vidros",
    },
    {
        "id": "jardinagem",
        "name": "Jardinagem",
        "slug": "jardinagem",
        "icon": "Flower2",
        "description": "Poda de árvores, corte de grama, paisagismo e plantas",
    },
    {
        "id": "ar-condicionado",
        "name": "Ar-condicionado",
        "slug": "ar-condicionado",
        "icon": "Wind",
        "description": "Instalação, manutenção, recarga de gás e limpeza de ar-condicionado",
    },
]


@router.get(
    "/specialties",
    response_model=List[SpecialtyCategoryRead],
    summary="Catálogo de especialidades",
)
@profissionais_router.get(
    "/specialties",
    response_model=List[SpecialtyCategoryRead],
    include_in_schema=False,
)
def get_specialties_catalog(
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Retorna o catálogo canônico de especialidades suportadas com a contagem em tempo real
    de profissionais aprovados e ativos em cada categoria.
    """
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    pros = (
        db.query(models.Professional.specialties, models.Professional.normalized_specialties)
        .filter(
            models.Professional.is_active.is_(True),
            models.Professional.approval_status == models.ProfessionalApprovalStatus.APPROVED.value,
        )
        .all()
    )

    categories_result = []
    for cat in CANONICAL_SPECIALTIES:
        clean_cat = search.clean_text(cat["name"])
        count = 0
        for prof_specs, prof_norm_specs in pros:
            matched = False
            if prof_specs and isinstance(prof_specs, list):
                for s in prof_specs:
                    if isinstance(s, str) and (search.clean_text(s) == clean_cat or clean_cat in search.clean_text(s)):
                        matched = True
                        break
            if not matched and prof_norm_specs:
                if clean_cat in prof_norm_specs:
                    matched = True
            if matched:
                count += 1

        categories_result.append(
            SpecialtyCategoryRead(
                id=cat["id"],
                name=cat["name"],
                slug=cat["slug"],
                icon=cat["icon"],
                description=cat["description"],
                professionals_count=count,
            )
        )

    return categories_result


@router.get(
    "",
    response_model=Union[List[ProfessionalPublicRead], PaginatedResponse[ProfessionalPublicRead]],
    summary="Listar profissionais",
)
@profissionais_router.get(
    "",
    response_model=Union[List[ProfessionalPublicRead], PaginatedResponse[ProfessionalPublicRead]],
    include_in_schema=False,
)
def list_professionals(
    request: Request,
    response: Response,
    q: Optional[str] = Query(
        None,
        max_length=120,
        description="Busca textual por nome, bio ou especialidade (máx. 120 caracteres)",
    ),
    specialty: Optional[str] = Query(
        None, max_length=100, description="Filtra por especialidade do profissional"
    ),
    city: Optional[str] = Query(
        None, max_length=100, description="Filtra por cidade base"
    ),
    state: Optional[str] = Query(
        None, min_length=2, max_length=2, description="Sigla da UF (ex: SP, RJ)"
    ),
    approval_status: Optional[str] = Query(
        models.ProfessionalApprovalStatus.APPROVED.value,
        description="Filtra por status de aprovação cadastral (padrão: approved; use 'all' para desativar filtro)",
    ),
    skip: int = Query(0, ge=0, description="Número de registros a pular"),
    limit: int = Query(20, ge=1, le=50, description="Limite máximo de registros"),
    envelope: bool = Query(False, description="Se true, retorna resposta envelopada com metadados"),
    db: Session = Depends(get_db),
):
    """
    Lista profissionais cadastrados ativos com suporte a busca inteligente (Tiered Two-Stage Search),
    filtros por especialidade, cidade, UF, paginação, mascaramento seguro LGPD e cabeçalhos de metadados.
    """
    check_search_rate_limit(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    if state:
        uf = state.strip().upper()
        if uf not in UFS_VALIDAS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Estado '{state}' inválido. Deve ser uma sigla de UF brasileira válida.",
            )

    has_query = bool(q and q.strip())
    clean_q = search.clean_text(q) if has_query else ""

    # Rejeita consultas vazias ou compostas unicamente por símbolos/metacaracteres
    if has_query and (not clean_q or re.fullmatch(r"[%_*\s\\]+", q or "")):
        response.headers["X-Total-Count"] = "0"
        response.headers["X-Page"] = "1"
        response.headers["X-Per-Page"] = str(limit)
        response.headers["X-Has-More"] = "false"
        if envelope:
            return PaginatedResponse[ProfessionalPublicRead](
                items=[],
                total=0,
                page=1,
                size=limit,
                pages=0,
                has_more=False,
                detected_suggestion=None,
            )
        return []

    query = db.query(models.Professional).filter(models.Professional.is_active.is_(True))

    if approval_status and approval_status.strip().lower() != "all":
        query = query.filter(models.Professional.approval_status == approval_status.strip().lower())

    if state:
        query = query.filter(models.Professional.state == state.strip().upper())

    if city and city.strip():
        norm_city = normalize_text(city)
        escaped_norm_city = _escape_like(norm_city)
        escaped_city = _escape_like(city.strip())
        query = query.filter(
            or_(
                models.Professional.normalized_city.ilike(f"%{escaped_norm_city}%", escape="\\"),
                models.Professional.city.ilike(f"%{escaped_city}%", escape="\\"),
            )
        )

    if specialty and specialty.strip() and specialty.strip().lower() != "todas":
        norm_spec = normalize_text(specialty)
        escaped_norm_spec = _escape_like(norm_spec)
        escaped_spec = _escape_like(specialty.strip())
        query = query.filter(
            or_(
                models.Professional.normalized_specialties.ilike(f"%{escaped_norm_spec}%", escape="\\"),
                cast(models.Professional.specialties, String).ilike(f"%{escaped_spec}%", escape="\\"),
            )
        )

    if has_query:
        # Tiered Two-Stage Search
        # Fase 1: Pré-filtro indexado no SQL (Database Index Filter)
        suggestion_tuple = search.find_best_category_suggestion(clean_q)
        detected_category = suggestion_tuple[0] if suggestion_tuple else None

        q_terms = [clean_q] + [t for t in clean_q.split() if len(t) >= 3]
        if detected_category:
            q_terms.append(search.clean_text(detected_category))
            for syn in search.synonyms_for(detected_category)[:6]:
                q_terms.append(search.clean_text(syn))

        conditions = []
        for term in set(q_terms):
            esc = _escape_like(term)
            conditions.append(models.Professional.normalized_search.ilike(f"%{esc}%", escape="\\"))
            conditions.append(models.Professional.normalized_specialties.ilike(f"%{esc}%", escape="\\"))

        candidates = (
            query.filter(or_(*conditions))
            .order_by(models.Professional.id.asc())
            .limit(250)
            .all()
        )

        if len(candidates) < 25:
            extra_candidates = (
                query.order_by(models.Professional.id.asc())
                .limit(250)
                .all()
            )
            seen_ids = {c.id for c in candidates}
            for extra in extra_candidates:
                if extra.id not in seen_ids:
                    candidates.append(extra)
                    seen_ids.add(extra.id)
                    if len(candidates) >= 250:
                        break

        # Fase 2: Refinamento e Ranking Fino em Memória (search.py)
        ranked, detected_suggestion = search.filter_professionals_intelligent(
            candidates,
            q=q or "",
            specialty=specialty or "",
            city=city or "",
        )

        total = len(ranked)
        page = (skip // limit) + 1 if limit > 0 else 1
        pages = (total + limit - 1) // limit if total > 0 else 0
        paged_items = ranked[skip : skip + limit]
        has_more = (skip + len(paged_items)) < total
    else:
        total = query.count()
        page = (skip // limit) + 1 if limit > 0 else 1
        pages = (total + limit - 1) // limit if total > 0 else 0
        paged_items = (
            query.order_by(models.Professional.id.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        has_more = (skip + len(paged_items)) < total
        detected_suggestion = None
        response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=60"

    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Per-Page"] = str(limit)
    response.headers["X-Has-More"] = "true" if has_more else "false"
    if detected_suggestion:
        response.headers["X-Search-Suggestion"] = normalize_text(detected_suggestion).title()

    serialized_items = [ProfessionalPublicRead.model_validate(p) for p in paged_items]

    if envelope:
        return PaginatedResponse[ProfessionalPublicRead](
            items=serialized_items,
            total=total,
            page=page,
            size=limit,
            pages=pages,
            has_more=has_more,
            detected_suggestion=detected_suggestion,
        )

    return serialized_items


@router.get(
    "/search",
    response_model=PaginatedResponse[ProfessionalPublicRead],
    summary="Busca envelopada de profissionais",
)
@profissionais_router.get(
    "/search",
    response_model=PaginatedResponse[ProfessionalPublicRead],
    include_in_schema=False,
)
def search_professionals_enveloped(
    request: Request,
    response: Response,
    q: Optional[str] = Query(None, max_length=120),
    specialty: Optional[str] = Query(None, max_length=100),
    city: Optional[str] = Query(None, max_length=100),
    state: Optional[str] = Query(None, min_length=2, max_length=2),
    approval_status: Optional[str] = Query(models.ProfessionalApprovalStatus.APPROVED.value),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return list_professionals(
        request=request,
        response=response,
        q=q,
        specialty=specialty,
        city=city,
        state=state,
        approval_status=approval_status,
        skip=skip,
        limit=limit,
        envelope=True,
        db=db,
    )


@router.post(
    "/{professional_id}/contact",
    response_model=ProfessionalContactResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Solicitar orçamento / contato com o profissional",
)
@profissionais_router.post(
    "/{professional_id}/contact",
    response_model=ProfessionalContactResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def request_professional_contact(
    professional_id: int,
    payload: ProfessionalContactRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_current_user),
):
    """
    Envia uma solicitação de contato e orçamento ao profissional aprovado e ativo.
    Dispara notificação segura por e-mail sem expor os dados de contato do profissional ao cliente.
    """
    client_id = current_user.email if current_user else None
    check_contact_rate_limit(request, client_identifier=client_id)

    professional = (
        db.query(models.Professional)
        .filter(
            models.Professional.id == professional_id,
            models.Professional.is_active.is_(True),
            models.Professional.approval_status == models.ProfessionalApprovalStatus.APPROVED.value,
        )
        .first()
    )
    if not professional:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profissional não encontrado ou não está disponível para contato.",
        )

    client_name = current_user.name if (current_user and current_user.name) else payload.client_name
    client_email = current_user.email if (current_user and current_user.email) else payload.client_email

    notificacoes.notificar_profissional_solicitacao_orcamento(
        profissional=professional,
        cliente_nome=client_name,
        cliente_email=client_email,
        cliente_telefone=payload.client_phone,
        categoria=payload.service_category,
        mensagem=payload.message,
        cliente_cidade=payload.client_city,
    )

    return ProfessionalContactResponse(
        success=True,
        message="Sua solicitação de orçamento foi enviada com sucesso para o profissional. Ele entrará em contato em breve.",
        professional_id=professional.id,
        professional_name=professional.name,
        contacted_at=datetime.now(timezone.utc),
    )



@router.get("/{professional_id}", response_model=ProfessionalRead, summary="Obter profissional por ID")
@profissionais_router.get("/{professional_id}", response_model=ProfessionalRead, include_in_schema=False)
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
@profissionais_router.put("/{professional_id}", response_model=ProfessionalRead, include_in_schema=False)
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
@profissionais_router.delete("/{professional_id}", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
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
