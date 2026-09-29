from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from database import get_db
from schemas import ProfessionalCreate, ProfessionalRead, ProfessionalUpdate
from security import hash_senha

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
    skip: int = Query(0, ge=0, description="Número de registros a pular"),
    limit: int = Query(50, ge=1, le=100, description="Limite máximo de registros"),
    db: Session = Depends(get_db),
):
    """
    Lista profissionais cadastrados ativos, com suporte a busca e filtros por
    especialidade, cidade e paginação.
    """
    query = db.query(models.Professional).filter(models.Professional.is_active.is_(True))

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

    db.delete(professional)
    db.commit()
    return None
