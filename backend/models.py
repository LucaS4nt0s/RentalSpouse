import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class UserRole(str, enum.Enum):
    """Papéis de usuário no sistema RentalSpouse."""

    ADMIN = "admin"
    CLIENT = "client"
    PROFESSIONAL = "professional"


class Status(Base):
    """Tabela de status com uma mensagem simples."""

    __tablename__ = "status"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(String, nullable=False)


class User(Base):
    """Entidade de usuário do sistema RentalSpouse."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default=UserRole.CLIENT.value, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verificado = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Cliente(Base):
    """Tabela de clientes cadastrados na plataforma."""

    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    cpf = Column(String(11), unique=True, index=True, nullable=False)
    data_nascimento = Column(Date, nullable=False)
    senha_hash = Column(String(255), nullable=False)

    # Campos de Endereço Estruturado
    cep = Column(String(8), nullable=False)
    logradouro = Column(String(255), nullable=False)
    numero = Column(String(50), nullable=False)
    complemento = Column(String(255), nullable=True)
    bairro = Column(String(100), nullable=False)
    cidade = Column(String(100), nullable=False)
    estado = Column(String(2), nullable=False)

    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # ---------------------------------------------------------------------
    # Verificação de e-mail
    # ---------------------------------------------------------------------
    # Toda conta nasce com o e-mail NÃO verificado. A confirmação só ocorre
    # quando o usuário acessa o link enviado por e-mail.
    email_verificado = Column(Boolean, default=False, nullable=False, index=True)
    # Armazenamos apenas o HASH SHA-256 do token — nunca o token em claro.
    verificacao_token_hash = Column(String(64), nullable=True, index=True)
    verificacao_expira_em = Column(DateTime, nullable=True)
    # Usado para aplicar intervalo mínimo entre reenvios (anti-spam).
    verificacao_enviada_em = Column(DateTime, nullable=True)

    @property
    def endereco(self):
        """Retorna o endereço estruturado para compatibilidade com os schemas Pydantic."""
        return {
            "cep": self.cep,
            "logradouro": self.logradouro,
            "numero": self.numero,
            "complemento": self.complemento,
            "bairro": self.bairro,
            "cidade": self.cidade,
            "estado": self.estado,
        }


class DocumentType(str, enum.Enum):
    """Tipos de documentos aceitos para análise cadastral do profissional."""

    PHOTO_ID = "photo_id"                      # Documento com foto (RG, CNH) - Obrigatório
    PROOF_OF_RESIDENCE = "proof_of_residence"  # Comprovante de residência - Obrigatório
    TECHNICAL_CERTIFICATE = "technical_certificate"  # Comprovante técnico / certificação - Opcional
    PROFILE_PHOTO = "profile_photo"            # Foto de perfil - Opcional / público


class ProfessionalApprovalStatus(str, enum.Enum):
    """Status de aprovação cadastral de um profissional."""

    PENDING = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


class Professional(Base):
    """Tabela de profissionais com especialidades e raio de atendimento."""

    __tablename__ = "professionals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    phone = Column(String(20), nullable=True)
    bio = Column(Text, nullable=False)
    service_radius_km = Column(Float, nullable=False)
    specialties = Column(JSON, nullable=False)
    city = Column(String(100), nullable=True)
    state = Column(String(2), nullable=True)
    senha_hash = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    approval_status = Column(
        String(50),
        default=ProfessionalApprovalStatus.PENDING.value,
        nullable=False,
        index=True,
    )
    approval_notes = Column(Text, nullable=True)
    # Momento (UTC) do último envio dos documentos para análise (issue #55).
    # Nulo enquanto o profissional ainda está montando o rascunho; após o envio,
    # os documentos ficam bloqueados para edição enquanto o status não for "rejected".
    documents_submitted_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    documents = relationship(
        "ProfessionalDocument",
        back_populates="professional",
        cascade="all, delete-orphan",
    )


class ProfessionalDocument(Base):
    """Documento anexado pelo profissional para validação cadastral ou exibição de perfil."""

    __tablename__ = "professional_documents"
    __table_args__ = (
        UniqueConstraint("professional_id", "document_type", name="uq_professional_document_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    professional_id = Column(
        Integer,
        ForeignKey("professionals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type = Column(String(50), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    uploaded_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    professional = relationship("Professional", back_populates="documents")
