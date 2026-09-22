from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class StatusBase(BaseModel):
    """Campos compartilhados entre criação e leitura."""

    message: str


class StatusCreate(StatusBase):
    """Schema para criação de um registro Status."""

    pass


class StatusRead(StatusBase):
    """Schema para leitura/resposta de um registro Status."""

    id: int

    model_config = {"from_attributes": True}


class ProfessionalBase(BaseModel):
    """Campos base do perfil de um profissional."""

    name: str = Field(..., min_length=2, max_length=100, description="Nome completo do profissional")
    email: str = Field(..., max_length=255, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$", description="E-mail de contato")
    phone: Optional[str] = Field(None, max_length=20, description="Telefone ou celular com DDD")
    bio: str = Field(..., min_length=10, max_length=2000, description="Biografia detalhada e apresentação aos clientes")
    service_radius_km: float = Field(..., ge=1.0, description="Raio de atendimento em km (mínimo 1 km)")
    specialties: List[str] = Field(..., min_length=1, description="Lista de especialidades do profissional")
    city: Optional[str] = Field(None, max_length=100, description="Cidade base do profissional")
    state: Optional[str] = Field(None, min_length=2, max_length=2, description="Sigla do estado (ex: SP)")

    @field_validator("specialties")
    @classmethod
    def validate_specialties(cls, v: List[str]) -> List[str]:
        cleaned = [s.strip() for s in v if isinstance(s, str) and s.strip()]
        if not cleaned:
            raise ValueError("O profissional deve possuir ao menos uma especialidade válida.")
        return cleaned


class ProfessionalCreate(ProfessionalBase):
    """Schema para criação do perfil do profissional."""

    pass


class ProfessionalUpdate(BaseModel):
    """Schema para atualização dos dados do profissional."""

    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[str] = Field(None, max_length=255, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    phone: Optional[str] = Field(None, max_length=20)
    bio: Optional[str] = Field(None, min_length=10, max_length=2000)
    service_radius_km: Optional[float] = Field(None, ge=1.0)
    specialties: Optional[List[str]] = Field(None, min_length=1)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, min_length=2, max_length=2)
    is_active: Optional[bool] = None

    @field_validator("specialties")
    @classmethod
    def validate_specialties(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        cleaned = [s.strip() for s in v if isinstance(s, str) and s.strip()]
        if not cleaned:
            raise ValueError("Ao atualizar as especialidades, ao menos uma deve ser informada.")
        return cleaned


class ProfessionalRead(ProfessionalBase):
    """Schema para leitura e serialização do perfil do profissional."""

    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
