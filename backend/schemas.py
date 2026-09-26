"""
Schemas Pydantic da API RentalSpouse.
Define as DTOs e os contratos de dados de entrada e saída.

A equipe de desenvolvimento do backend deve utilizar os modelos ClientCreateRequest
e AddressCreate para receber os dados trafegados pelos clientes Web e Mobile.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


# ============================================================================
# Status (Endpoint de verificação de integridade)
# ============================================================================


class StatusBase(BaseModel):
    """Campos compartilhados entre criação e leitura de status."""

    message: str


class StatusCreate(StatusBase):
    """Schema para criação de um registro Status."""

    pass


class StatusRead(StatusBase):
    """Schema para leitura/resposta de um registro Status."""

    id: int

    model_config = {"from_attributes": True}


# ============================================================================
# Modelo de Dados: Endereço (Address)
# ============================================================================


class AddressCreate(BaseModel):
    """
    Modelo de dados de endereço enviado pelo frontend (Web e Mobile).
    Os campos numéricos (CEP) chegam sanitizados (apenas dígitos).
    """

    cep: str = Field(
        ...,
        min_length=8,
        max_length=8,
        description="CEP sanitizado contendo exatamente 8 dígitos numéricos (sem hífen)",
        examples=["01001000"],
    )
    logradouro: str = Field(
        ...,
        min_length=3,
        max_length=200,
        description="Nome do logradouro (Rua, Avenida, Praça, etc.)",
        examples=["Praça da Sé"],
    )
    numero: str = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Número do imóvel ou S/N",
        examples=["100"],
    )
    complemento: Optional[str] = Field(
        None,
        max_length=60,
        description="Complemento opcional (apartamento, bloco, conjunto)",
        examples=["Apto 42"],
    )
    bairro: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Bairro do endereço",
        examples=["Sé"],
    )
    cidade: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Cidade do endereço",
        examples=["São Paulo"],
    )
    estado_uf: str = Field(
        ...,
        min_length=2,
        max_length=2,
        description="Sigla com 2 letras da Unidade Federativa (UF)",
        examples=["SP"],
    )


class AddressRead(AddressCreate):
    """Schema para retorno de dados de endereço persistido."""

    id: int

    model_config = {"from_attributes": True}


# ============================================================================
# Modelo de Dados: Cadastro de Clientes (Client)
# ============================================================================


class ClientCreateRequest(BaseModel):
    """
    Contrato de entrada para a rota POST /api/v1/clients (ou /api/clients).
    
    Representa exatamente o payload JSON que o frontend Web e Mobile enviam
    ao finalizar o formulário de cadastro de clientes.
    """

    nome_completo: str = Field(
        ...,
        min_length=3,
        max_length=120,
        description="Nome completo do cliente (mínimo nome e sobrenome)",
        examples=["Ana Clara da Silva"],
    )
    email: EmailStr = Field(
        ...,
        description="Endereço de e-mail válido RFC 5322 em minúsculas",
        examples=["ana.silva@exemplo.com.br"],
    )
    cpf: str = Field(
        ...,
        min_length=11,
        max_length=11,
        description="CPF higienizado contendo exatamente 11 dígitos numéricos",
        examples=["12345678901"],
    )
    data_nascimento: str = Field(
        ...,
        description="Data de nascimento no formato ISO YYYY-MM-DD",
        examples=["1994-05-18"],
    )
    senha: str = Field(
        ...,
        min_length=8,
        description="Senha forte cumprindo os 5 critérios de segurança",
        examples=["SenhaForte@2026"],
    )
    endereco: AddressCreate = Field(
        ...,
        description="Estrutura com os dados do endereço principal do cliente",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "nome_completo": "Ana Clara da Silva",
                "email": "ana.silva@exemplo.com.br",
                "cpf": "12345678901",
                "data_nascimento": "1994-05-18",
                "senha": "SenhaForte@2026",
                "endereco": {
                    "cep": "01001000",
                    "logradouro": "Praça da Sé",
                    "numero": "100",
                    "complemento": "Apto 42",
                    "bairro": "Sé",
                    "cidade": "São Paulo",
                    "estado_uf": "SP",
                },
            }
        }
    }


class ClientReadResponse(BaseModel):
    """
    Contrato de resposta esperado pelo frontend após sucesso (HTTP 201 Created).
    ATENÇÃO: A senha em texto claro e o hash nunca devem ser retornados.
    """

    id: int = Field(..., description="Identificador único do cliente no banco", examples=[104])
    nome_completo: str = Field(..., examples=["Ana Clara da Silva"])
    email: str = Field(..., examples=["ana.silva@exemplo.com.br"])
    cpf: str = Field(..., examples=["12345678901"])
    data_nascimento: str = Field(..., examples=["1994-05-18"])
    created_at: Optional[datetime] = Field(None, description="Data/hora de criação do registro")

    model_config = {"from_attributes": True}


class ConflictErrorResponse(BaseModel):
    """
    Contrato de erro esperado pelo frontend em caso de duplicidade (HTTP 409 Conflict).
    Permite que o frontend aponte ao usuário qual campo já está cadastrado (cpf ou email).
    """

    detail: str = Field(..., examples=["CPF já cadastrado na base de dados."])
    field: str = Field(..., description="Nome do campo em conflito ('cpf' ou 'email')", examples=["cpf"])
