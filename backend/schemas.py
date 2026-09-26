from datetime import date, datetime
import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

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

    model_config = {"from_attributes": True}
