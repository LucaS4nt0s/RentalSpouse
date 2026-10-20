from datetime import date, datetime
import enum
import re
from typing import Any, Generic, List, Optional, TypeVar, Union

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


T = TypeVar("T")


class ProfessionalPublicRead(BaseModel):
    """
    Schema seguro para busca e diretório público de profissionais.
    Garante conformidade com a LGPD através do mascaramento de e-mail e telefone
    no lado do servidor, sem expor PII a scrapers e acessos não autorizados.
    """

    id: int
    name: str
    email: str = Field(..., description="E-mail parcialmente mascarado para proteção de dados")
    phone: Optional[str] = Field(None, description="Telefone parcialmente mascarado para proteção de dados")
    bio: str
    service_radius_km: float
    specialties: List[str]
    city: Optional[str] = None
    state: Optional[str] = None
    is_active: bool
    approval_status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("email", mode="before")
    @classmethod
    def mask_email_server_side(cls, v: Optional[str]) -> str:
        """Aplica mascaramento de e-mail conforme LGPD: jo***o@dominio.com"""
        if not v or "@" not in str(v):
            return "E-mail protegido"
        raw = str(v).strip().lower()
        user_part, domain = raw.split("@", 1)
        if len(user_part) <= 2:
            masked_user = f"{user_part[0]}***"
        else:
            masked_user = f"{user_part[:2]}***{user_part[-1]}"
        return f"{masked_user}@{domain}"

    @field_validator("phone", mode="before")
    @classmethod
    def mask_phone_server_side(cls, v: Optional[str]) -> Optional[str]:
        """Aplica mascaramento de telefone conforme LGPD: (11) 9****-**45"""
        if not v:
            return None
        digits = "".join(filter(str.isdigit, str(v)))
        if len(digits) < 8:
            return "Telefone protegido"
        if len(digits) == 11:  # Celular com DDD (XX) 9XXXX-XXXX
            return f"({digits[:2]}) {digits[2]}****-**{digits[-2:]}"
        if len(digits) == 10:  # Fixo com DDD (XX) XXXX-XXXX
            return f"({digits[:2]}) {digits[2]}***-**{digits[-2:]}"
        return f"***-**{digits[-4:]}"


class PaginatedResponse(BaseModel, Generic[T]):
    """Envelope de paginação contendo metadados de navegação e busca."""

    items: List[T]
    total: int = Field(..., ge=0, description="Total absoluto de itens encontrados")
    page: int = Field(..., ge=1, description="Número da página atual")
    size: int = Field(..., ge=1, description="Quantidade de itens por página")
    pages: int = Field(..., ge=0, description="Total de páginas disponíveis")
    has_more: bool = Field(..., description="Indica se há páginas subsequentes")
    detected_suggestion: Optional[str] = Field(
        None, description="Sugestão de correção ortográfica calculada pelo servidor"
    )


class SpecialtyCategoryRead(BaseModel):
    """Schema para catálogo canônico de especialidades da plataforma."""

    id: str
    name: str
    slug: str
    icon: str
    description: str
    professionals_count: int = Field(0, ge=0)


class ProfessionalContactRequest(BaseModel):
    """Payload de solicitação de contato / orçamento com o profissional."""

    client_name: str = Field(..., min_length=2, max_length=100)
    client_email: str = Field(..., max_length=255)
    client_phone: Optional[str] = Field(None, max_length=20)
    service_category: str = Field(..., min_length=2, max_length=100)
    message: str = Field(..., min_length=10, max_length=2000)
    client_city: Optional[str] = Field(None, max_length=100)

    @field_validator("client_name", mode="before")
    @classmethod
    def validate_client_name(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        cleaned = re.sub(r"[\r\n\x00-\x1f]+", " ", v).strip()
        if len(cleaned) < 2:
            raise ValueError("O nome do cliente deve ter no mínimo 2 caracteres.")
        return cleaned

    @field_validator("client_email", mode="before")
    @classmethod
    def validate_client_email(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        if "\r" in v or "\n" in v:
            raise ValueError("E-mail contém caracteres de controle inválidos.")
        cleaned = v.strip().lower()
        if not EMAIL_REGEX.match(cleaned):
            raise ValueError("E-mail com formato inválido.")
        return cleaned

    @field_validator("service_category", mode="before")
    @classmethod
    def validate_service_category(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        cleaned = re.sub(r"[\r\n\x00-\x1f]+", " ", v).strip()
        if len(cleaned) < 2:
            raise ValueError("A categoria do serviço deve ter no mínimo 2 caracteres.")
        return cleaned

    @field_validator("client_phone", "client_city", mode="before")
    @classmethod
    def validate_optional_single_line(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not isinstance(v, str):
            return v
        cleaned = re.sub(r"[\r\n\x00-\x1f]+", " ", v).strip()
        return cleaned or None

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if len(cleaned) < 10:
            raise ValueError("A mensagem deve ter no mínimo 10 caracteres.")
        if "<script" in cleaned.lower() or "</script>" in cleaned.lower():
            raise ValueError("A mensagem contém caracteres ou scripts inválidos.")
        return cleaned


class ProfessionalContactResponse(BaseModel):
    """Resposta de confirmação de envio da solicitação de orçamento."""

    success: bool = True
    message: str
    professional_id: int
    professional_name: str
    contacted_at: datetime


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


# ---------------------------------------------------------------------------
# Schemas de Moderação Administrativa de Profissionais (Issue #64)
# ---------------------------------------------------------------------------


class ProfessionalModerationItemRead(BaseModel):
    """Item da fila/listagem de moderação para administradores."""

    id: int
    name: str
    email: str
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    specialties: List[str]
    approval_status: str
    approval_notes: Optional[str] = None
    documents_submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    approved_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    documents_count: int = 0
    has_photo_id: bool = False
    has_proof_of_residence: bool = False
    has_technical_certificate: bool = False
    has_profile_photo: bool = False
    is_complete: bool = False

    model_config = {"from_attributes": True}


class ProfessionalModerationReviewRead(BaseModel):
    """Dados cadastrais completos e documentos anexados para auditoria administrativa."""

    id: int
    name: str
    email: str
    phone: Optional[str] = None
    bio: str
    service_radius_km: float
    specialties: List[str]
    city: Optional[str] = None
    state: Optional[str] = None
    is_active: bool
    approval_status: str
    approval_notes: Optional[str] = None
    documents_submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_complete: bool
    documents: List[ProfessionalDocumentRead] = []

    model_config = {"from_attributes": True}


class ProfessionalRejectPayload(BaseModel):
    """Payload obrigatório para rejeição de documentos do profissional."""

    reason: str = Field(
        ...,
        min_length=5,
        max_length=1000,
        description="Justificativa da reprovação dos documentos enviada ao profissional.",
    )

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        cleaned = v.strip() if v else ""
        if len(cleaned) < 5:
            raise ValueError("O motivo da rejeição deve ter no mínimo 5 caracteres válidos.")
        return cleaned


class ProfessionalModerationDecisionRead(BaseModel):
    """Resposta estruturada após uma ação de aprovação ou rejeição administrativa."""

    id: int
    name: str
    email: str
    approval_status: str
    approval_notes: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved_by_id: Optional[int] = None
    updated_at: datetime
    message: str

    model_config = {"from_attributes": True}


