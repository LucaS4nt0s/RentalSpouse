from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


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


# ============================================================================
# Schemas de Administrador e Autenticação
# ============================================================================


class AdminBase(BaseModel):
    """Campos base de um Administrador."""

    name: str = Field(..., min_length=2, max_length=255, description="Nome completo do administrador")
    email: EmailStr = Field(..., description="E-mail do administrador")


class AdminCreate(AdminBase):
    """Schema de payload para cadastro de um novo Administrador."""

    password: str = Field(..., min_length=8, max_length=128, description="Senha com no mínimo 8 caracteres")


class AdminRead(AdminBase):
    """Schema de resposta para exibição pública de um Administrador (sem expor hash de senha)."""

    id: int
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    """Schema para autenticação (login) de usuários."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Schema para resposta de emissão de token JWT."""

    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Dados decodificados de um token JWT."""

    sub: str | None = None
    role: str | None = None

