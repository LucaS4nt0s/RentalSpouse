from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

import models
from database import get_db
from schemas import ProfessionalCreate, ProfessionalRead, ProfessionalUpdate

router = APIRouter(prefix="/api/professionals", tags=["Profissionais"])


@router.post("", response_model=ProfessionalRead, status_code=status.HTTP_201_CREATED)
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
            status_code=status.HTTP_400_BAD_REQUEST,
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
    db.add(professional)
    db.commit()
    db.refresh(professional)

    return professional


@router.get("", response_model=List[ProfessionalRead])
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

    professionals = query.order_by(models.Professional.id.asc()).all()

    if specialty:
        target_spec = specialty.strip().lower()
        professionals = [
            p
            for p in professionals
            if any(target_spec in (s.lower() if isinstance(s, str) else "") for s in (p.specialties or []))
        ]

    return professionals[skip : skip + limit]


@router.get("/{professional_id}", response_model=ProfessionalRead)
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


@router.put("/{professional_id}", response_model=ProfessionalRead)
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
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="E-mail já está em uso por outro profissional.",
            )

    update_fields = payload.model_dump(exclude_unset=True)
    for field_name, value in update_fields.items():
        setattr(professional, field_name, value)

    db.commit()
    db.refresh(professional)

    return professional


@router.delete("/{professional_id}", status_code=status.HTTP_204_NO_CONTENT)
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
