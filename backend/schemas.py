from datetime import date, datetime
import enum
import re
from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator, model_validator

# Conjunto de Unidades Federativas válidas do Brasil
UFS_VALIDAS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO"
}

# Regex rigoroso para e-mail: impede pontos consecutivos, ponto final no domínio ou no nome, e exige TLD >= 2 letras
EMAIL_REGEX = re.compile(
    r"^(?!.*\.\.)[a-zA-Z0-9_+-]+(?:\.[a-zA-Z0-9_+-]+)*@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$"
)


# ---------------------------------------------------------------------------
# Schemas de Status
# ---------------------------------------------------------------------------


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


class UserBase(BaseModel):
    """Campos base de um Usuário."""

    name: str = Field(..., min_length=2, max_length=255, description="Nome completo do usuário")
    email: EmailStr = Field(..., description="E-mail do usuário")


class UserRead(UserBase):
    """Schema de resposta para exibição de dados do usuário."""

    id: Optional[int] = None
    role: str
    is_active: bool
    email_verificado: bool = True
    created_at: Optional[datetime] = None

    @computed_field
    @property
    def nome(self) -> str:
        return self.name

    @computed_field
    @property
    def tipo(self) -> str:
        role_map = {
            "client": "cliente",
            "professional": "profissional",
            "admin": "admin",
        }
        return role_map.get(self.role, self.role)

    model_config = {"from_attributes": True}


class AdminBase(UserBase):
    """Campos base de um Administrador."""

    pass


class AdminCreate(AdminBase):
    """Schema de payload para cadastro de um novo Administrador."""

    password: str = Field(..., min_length=8, max_length=128, description="Senha com no mínimo 8 caracteres")


class AdminRead(UserRead):
    """Schema de resposta para exibição pública de um Administrador (sem expor hash de senha)."""

    pass


class LoginRequest(BaseModel):
    """Schema para autenticação (login) de usuários."""

    email: EmailStr
    password: str = Field(..., max_length=128, description="Senha de acesso")

    @field_validator("email", mode="before")
    @classmethod
    def normalizar_email(cls, v: Any) -> str:
        limpo = (v or "").strip().lower() if isinstance(v, str) else ""
        if not limpo:
            raise ValueError("O e-mail é obrigatório.")
        if not EMAIL_REGEX.match(limpo):
            raise ValueError("E-mail com formato inválido.")
        return limpo

    @model_validator(mode="before")
    @classmethod
    def accept_senha_alias(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "password" not in data and "senha" in data:
                data["password"] = data["senha"]
        return data

    @field_validator("password")
    @classmethod
    def validar_senha(cls, v: str) -> str:
        if not (v or "").strip():
            raise ValueError("A senha é obrigatória.")
        return v


class TokenResponse(BaseModel):
    """Schema para resposta de emissão de token JWT."""

    access_token: str
    token_type: str = "bearer"
    user: Optional[UserRead] = None


UsuarioAutenticado = UserRead
LoginResponse = TokenResponse



# ---------------------------------------------------------------------------
# Schemas de Endereço
# ---------------------------------------------------------------------------


class EnderecoSchema(BaseModel):
    """Schema com os dados do endereço estruturado do cliente."""

    cep: str = Field(..., max_length=9, description="CEP do endereço (com ou sem pontuação)")
    logradouro: str = Field(..., max_length=255, description="Logradouro / Rua / Avenida")
    numero: str = Field(..., max_length=50, description="Número residencial")
    complemento: Optional[str] = Field(None, max_length=255, description="Complemento do endereço")
    bairro: str = Field(..., max_length=100, description="Bairro")
    cidade: str = Field(..., max_length=100, description="Cidade")
    estado: str = Field(..., min_length=2, max_length=2, description="Sigla da UF (2 caracteres)")

    model_config = {"from_attributes": True}

    @field_validator("cep")
    @classmethod
    def validar_cep(cls, valor: str) -> str:
        digitos = "".join(filter(str.isdigit, valor or ""))
        if len(digitos) != 8:
            raise ValueError("O CEP deve conter exatamente 8 dígitos numéricos.")
        return digitos

    @field_validator("logradouro", "numero", "bairro", "cidade")
    @classmethod
    def validar_campos_obrigatorios(cls, valor: str, info) -> str:
        campo = info.field_name
        limpo = valor.strip() if valor else ""
        if not limpo:
            raise ValueError(f"O campo '{campo}' não pode ser vazio.")
        return limpo

    @field_validator("estado")
    @classmethod
    def validar_estado(cls, valor: str) -> str:
        uf = (valor or "").strip().upper()
        if uf not in UFS_VALIDAS:
            raise ValueError(f"Estado '{valor}' inválido. Deve ser uma sigla de UF brasileira válida.")
        return uf

    @field_validator("complemento")
    @classmethod
    def validar_complemento(cls, valor: Optional[str]) -> Optional[str]:
        if valor is not None:
            limpo = valor.strip()
            return limpo if limpo else None
        return None


# ---------------------------------------------------------------------------
# Schemas de Cliente
# ---------------------------------------------------------------------------


class ClienteBase(BaseModel):
    """Campos base do cliente."""

    nome: str = Field(..., max_length=255, description="Nome completo do cliente")
    email: str = Field(..., max_length=255, description="E-mail único do cliente")
    cpf: str = Field(..., max_length=14, description="CPF com ou sem formatação")
    data_nascimento: date
    endereco: EnderecoSchema

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str) -> str:
        limpo = (valor or "").strip()
        if len(limpo) < 3:
            raise ValueError("O nome deve ter no mínimo 3 caracteres.")
        if not any(c.isalpha() for c in limpo):
            raise ValueError("O nome deve conter letras.")
        return limpo

    @field_validator("email")
    @classmethod
    def validar_email(cls, valor: str) -> str:
        limpo = (valor or "").strip().lower()
        if not EMAIL_REGEX.match(limpo):
            raise ValueError("E-mail com formato inválido.")
        return limpo

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor: str) -> str:
        digitos = "".join(filter(str.isdigit, str(valor or "")))
        if len(digitos) != 11:
            raise ValueError("O CPF deve conter exatamente 11 dígitos numéricos.")

        # Rejeita CPFs com todos os dígitos repetidos (ex: 111.111.111-11)
        if digitos == digitos[0] * 11:
            raise ValueError("CPF inválido.")

        # Validação do primeiro dígito verificador
        soma_1 = sum(int(d) * peso for d, peso in zip(digitos[:9], range(10, 1, -1)))
        resto_1 = (soma_1 * 10) % 11
        d1 = 0 if resto_1 >= 10 else resto_1
        if d1 != int(digitos[9]):
            raise ValueError("Dígito verificador do CPF inválido.")

        # Validação do segundo dígito verificador
        soma_2 = sum(int(d) * peso for d, peso in zip(digitos[:10], range(11, 1, -1)))
        resto_2 = (soma_2 * 10) % 11
        d2 = 0 if resto_2 >= 10 else resto_2
        if d2 != int(digitos[10]):
            raise ValueError("Dígito verificador do CPF inválido.")

        return digitos

    @field_validator("data_nascimento")
    @classmethod
    def validar_data_nascimento(cls, valor: date) -> date:
        hoje = date.today()
        if valor > hoje:
            raise ValueError("A data de nascimento não pode ser no futuro.")

        # Cálculo preciso da idade considerando dia e mês
        idade = hoje.year - valor.year - ((hoje.month, hoje.day) < (valor.month, valor.day))
        if idade < 18:
            raise ValueError("O cliente deve ter no mínimo 18 anos.")
        if idade > 120:
            raise ValueError("Data de nascimento inválida.")

        return valor


class ClienteCreate(ClienteBase):
    """Schema para cadastro de um novo cliente, incluindo senha e confirmação."""

    senha: str = Field(..., max_length=128, description="Senha de acesso")
    confirmar_senha: str = Field(..., max_length=128, description="Confirmação de senha")

    @field_validator("senha")
    @classmethod
    def validar_senha(cls, valor: str) -> str:
        if len(valor or "") < 8:
            raise ValueError("A senha deve conter no mínimo 8 caracteres.")
        if not any(c.isalpha() for c in valor):
            raise ValueError("A senha deve conter pelo menos uma letra.")
        if not any(c.isdigit() for c in valor):
            raise ValueError("A senha deve conter pelo menos um número.")
        return valor

    @model_validator(mode="after")
    def validar_confirmacao_senha(self):
        if self.senha != self.confirmar_senha:
            raise ValueError("A confirmação de senha não confere com a senha informada.")
        return self


class ClienteRead(ClienteBase):
    """Schema para resposta dos dados do cliente (sem expor credenciais)."""

    id: int
    criado_em: datetime
    email_verificado: bool = False

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Schemas de Verificação de E-mail
# ---------------------------------------------------------------------------


class ConfirmarVerificacaoRequest(BaseModel):
    """Payload de confirmação do token recebido por e-mail."""

    token: str = Field(
        ...,
        min_length=16,
        max_length=256,
        description="Token de verificação recebido no link enviado por e-mail",
    )


class ReenviarVerificacaoRequest(BaseModel):
    """Payload de solicitação de reenvio do e-mail de verificação."""

    email: str = Field(..., max_length=255, description="E-mail informado no cadastro")

    @field_validator("email")
    @classmethod
    def validar_email(cls, valor: str) -> str:
        limpo = (valor or "").strip().lower()
        if not EMAIL_REGEX.match(limpo):
            raise ValueError("E-mail com formato inválido.")
        return limpo


class MensagemResponse(BaseModel):
    """Resposta genérica contendo apenas uma mensagem ao usuário."""

    mensagem: str


class VerificacaoConfirmadaResponse(BaseModel):
    """Resultado da confirmação de e-mail."""

    email: str = Field(..., description="E-mail confirmado")
    email_verificado: bool = Field(
        ..., description="Indica que o endereço de e-mail está confirmado"
    )
    mensagem: str = Field(..., description="Mensagem de retorno para o usuário")


# ---------------------------------------------------------------------------
# Schemas de Profissional
# ---------------------------------------------------------------------------


class ProfessionalBase(BaseModel):
    """Campos base do perfil de um profissional."""

    name: str = Field(..., min_length=2, max_length=100, description="Nome completo do profissional")
    email: str = Field(..., max_length=255, description="E-mail de contato")
    phone: Optional[str] = Field(None, max_length=20, description="Telefone ou celular com DDD")
    bio: str = Field(..., min_length=10, max_length=2000, description="Biografia detalhada e apresentação aos clientes")
    service_radius_km: float = Field(..., ge=1.0, description="Raio de atendimento em km (mínimo 1 km)")
    specialties: List[str] = Field(..., min_length=1, description="Lista de especialidades do profissional")
    city: Optional[str] = Field(None, max_length=100, description="Cidade base do profissional")
    state: Optional[str] = Field(None, min_length=2, max_length=2, description="Sigla do estado (ex: SP)")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if len(cleaned) < 2:
            raise ValueError("O nome deve ter no mínimo 2 caracteres.")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        cleaned = (v or "").strip().lower()
        if not EMAIL_REGEX.match(cleaned):
            raise ValueError("E-mail com formato inválido.")
        return cleaned

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            uf = v.strip().upper()
            if uf not in UFS_VALIDAS:
                raise ValueError(f"Estado '{v}' inválido. Deve ser uma sigla de UF brasileira válida.")
            return uf
        return None

    @field_validator("specialties")
    @classmethod
    def validate_specialties(cls, v: List[str]) -> List[str]:
        cleaned = [s.strip() for s in v if isinstance(s, str) and s.strip()]
        if not cleaned:
            raise ValueError("O profissional deve possuir ao menos uma especialidade válida.")
        return cleaned


class ProfessionalCreate(ProfessionalBase):
    """Schema para criação do perfil do profissional."""

    password: Optional[str] = Field(None, min_length=8, max_length=128, description="Senha de acesso")

    @model_validator(mode="before")
    @classmethod
    def accept_aliases_and_nested(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # name / nome
            if "name" not in data and "nome" in data:
                data["name"] = data["nome"]
            # phone / telefone
            if "phone" not in data and "telefone" in data:
                data["phone"] = data["telefone"]
            # specialties / especialidades
            if "specialties" not in data and "especialidades" in data:
                data["specialties"] = data["especialidades"]
            # service_radius_km / raio_atendimento_km / raio_atendimento
            if "service_radius_km" not in data:
                if "raio_atendimento_km" in data:
                    data["service_radius_km"] = data["raio_atendimento_km"]
                elif "raio_atendimento" in data:
                    data["service_radius_km"] = data["raio_atendimento"]
            # endereco -> city / state
            if "endereco" in data and isinstance(data["endereco"], dict):
                end = data["endereco"]
                if "city" not in data and "cidade" in end:
                    data["city"] = end["cidade"]
                if "state" not in data:
                    if "estado" in end:
                        data["state"] = end["estado"]
                    elif "estado_uf" in end:
                        data["state"] = end["estado_uf"]
            # city / cidade direta
            if "city" not in data and "cidade" in data:
                data["city"] = data["cidade"]
            # state / estado direto
            if "state" not in data:
                if "estado" in data:
                    data["state"] = data["estado"]
                elif "estado_uf" in data:
                    data["state"] = data["estado_uf"]
            # password / senha
            if "password" not in data and "senha" in data:
                data["password"] = data["senha"]
        return data


class ProfessionalUpdate(BaseModel):
    """Schema para atualização dos dados do profissional."""

    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    bio: Optional[str] = Field(None, min_length=10, max_length=2000)
    service_radius_km: Optional[float] = Field(None, ge=1.0)
    specialties: Optional[List[str]] = Field(None, min_length=1)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, min_length=2, max_length=2)
    is_active: Optional[bool] = None

    @field_validator("name", "email", "bio", "service_radius_km", "specialties", "is_active", mode="before")
    @classmethod
    def reject_null_on_non_nullable_fields(cls, v, info):
        if v is None:
            raise ValueError(f"O campo '{info.field_name}' não pode ser nulo.")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if len(cleaned) < 2:
                raise ValueError("O nome deve ter no mínimo 2 caracteres.")
            return cleaned
        return None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().lower()
            if not EMAIL_REGEX.match(cleaned):
                raise ValueError("E-mail com formato inválido.")
            return cleaned
        return None

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            uf = v.strip().upper()
            if uf not in UFS_VALIDAS:
                raise ValueError(f"Estado '{v}' inválido. Deve ser uma sigla de UF brasileira válida.")
            return uf
        return None

    @field_validator("specialties")
    @classmethod
    def validate_specialties(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        cleaned = [s.strip() for s in v if isinstance(s, str) and s.strip()]
        if not cleaned:
            raise ValueError("Ao atualizar as especialidades, ao menos uma deve ser informada.")
        return cleaned


from models import DocumentType as DocumentTypeEnum, ProfessionalApprovalStatus as ProfessionalApprovalStatusEnum


class ProfessionalRead(ProfessionalBase):
    """Schema para leitura e serialização do perfil do profissional."""

    id: int
    is_active: bool
    approval_status: str = ProfessionalApprovalStatusEnum.PENDING.value
    approval_notes: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

# ---------------------------------------------------------------------------
# Schemas de Documentos do Profissional
# ---------------------------------------------------------------------------


class ProfessionalDocumentRead(BaseModel):
    """Schema para visualização de metadados de documento anexado pelo profissional."""

    id: int
    professional_id: int
    document_type: str
    file_name: str
    file_size: int
    mime_type: str
    uploaded_at: datetime
    download_url: Optional[str] = None

    model_config = {"from_attributes": True}


class ProfessionalDocumentsSummaryRead(BaseModel):
    """Resumo da documentação enviada pelo profissional para validação cadastral."""

    professional_id: int
    approval_status: str
    approval_notes: Optional[str] = None
    has_photo_id: bool
    has_proof_of_residence: bool
    has_technical_certificate: bool
    has_profile_photo: bool
    is_complete: bool = Field(
        ...,
        description="Indica se os documentos mínimos obrigatórios (documento com foto e comprovante de residência) foram enviados.",
    )
    documents: List[ProfessionalDocumentRead]


class ProfessionalDocumentsMeSummaryRead(ProfessionalDocumentsSummaryRead):
    """
    Resumo dos documentos do profissional autenticado (`/me`), com o estado do
    envio para análise derivado — sem novo enum:

    - `submitted_at` nulo -> rascunho;
    - `approval_status == "rejected"` -> pode corrigir e reenviar;
    - caso contrário (com `submitted_at` preenchido) -> em análise/aprovado, edição bloqueada.
    """

    submitted_at: Optional[datetime] = Field(
        None,
        description="Momento (UTC) do último envio para análise; nulo enquanto o envio for rascunho.",
    )
    can_submit: bool = Field(
        ...,
        description="True quando os 2 documentos obrigatórios estão anexados e o envio não está bloqueado.",
    )
    missing_required: List[str] = Field(
        ...,
        description="Tipos de documento obrigatórios ainda ausentes (photo_id, proof_of_residence).",
    )

