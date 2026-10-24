import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    Time,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import relationship

from database import Base
from search import normalize_text


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

    # Colunas normalizadas para busca eficiente e indexada no banco de dados (sem acentos/minúsculas)
    normalized_city = Column(String(100), nullable=True, index=True)
    normalized_specialties = Column(Text, nullable=True, index=True)
    normalized_search = Column(Text, nullable=True, index=True)

    def update_normalized_fields(self):
        """Atualiza os campos normalizados para busca insensível a acentos e maiúsculas."""
        self.normalized_city = normalize_text(self.city)
        specs = " ".join(normalize_text(s) for s in (self.specialties or []) if isinstance(s, str))
        self.normalized_specialties = specs
        self.normalized_search = f"{normalize_text(self.name)} {normalize_text(self.bio)} {self.normalized_city} {specs}".strip()


@event.listens_for(Professional, "before_insert")
def _before_insert_professional(mapper, connection, target: Professional):
    target.update_normalized_fields()


@event.listens_for(Professional, "before_update")
def _before_update_professional(mapper, connection, target: Professional):
    target.update_normalized_fields()


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


class OrcamentoStatus(str, enum.Enum):
    """Status do ciclo de vida de uma solicitação de orçamento."""

    PENDENTE = "pendente"
    ACEITO = "aceito"
    RESPONDIDO = "respondido"
    RECUSADO = "recusado"
    CANCELADO = "cancelado"


class Orcamento(Base):
    """Solicitação de orçamento enviada por um cliente para um profissional."""

    __tablename__ = "orcamentos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True, index=True)
    cliente_nome = Column(String(100), nullable=False)
    cliente_email = Column(String(255), nullable=False, index=True)
    cliente_telefone = Column(String(20), nullable=True)
    professional_id = Column(Integer, ForeignKey("professionals.id", ondelete="CASCADE"), nullable=False, index=True)
    descricao = Column(Text, nullable=False)
    status = Column(String(30), default=OrcamentoStatus.PENDENTE.value, nullable=False, index=True)
    valor_estimado = Column(Float, nullable=True)
    resposta_profissional = Column(Text, nullable=True)
    respondido_em = Column(DateTime, nullable=True)
    motivo_recusa = Column(String(150), nullable=True)
    justificativa_recusa = Column(Text, nullable=True)
    data_prevista = Column(DateTime, nullable=True)
    decidido_em = Column(DateTime, nullable=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    atualizado_em = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    fotos = relationship(
        "OrcamentoFoto",
        back_populates="orcamento",
        cascade="all, delete-orphan",
        order_by="OrcamentoFoto.id.asc()",
    )
    professional = relationship("Professional")
    cliente = relationship("Cliente")


class OrcamentoFoto(Base):
    """Foto ou imagem anexada à solicitação de orçamento pelo cliente."""

    __tablename__ = "orcamento_fotos"

    id = Column(Integer, primary_key=True, index=True)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id", ondelete="CASCADE"), nullable=False, index=True)
    nome_original = Column(String(255), nullable=False)
    caminho_arquivo = Column(String(500), nullable=False)
    tamanho_bytes = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    enviado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    orcamento = relationship("Orcamento", back_populates="fotos")


class Notificacao(Base):
    """Notificação persistida no banco de dados para usuários do sistema."""

    __tablename__ = "notificacoes"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), nullable=False, index=True)
    titulo = Column(String(150), nullable=False)
    mensagem = Column(Text, nullable=False)
    tipo = Column(String(50), nullable=False, index=True)
    referencia_id = Column(Integer, nullable=True)
    lida = Column(Boolean, default=False, nullable=False, index=True)
    criada_em = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class DenunciaMotivo(str, enum.Enum):
    """Motivos padronizados aceitos em uma denúncia de profissional (issue #68)."""

    SERVICO_NAO_REALIZADO = "servico_nao_realizado"   # Não realizou (ou abandonou) o serviço contratado
    COBRANCA_INDEVIDA = "cobranca_indevida"           # Cobrou valor diferente do combinado
    CONDUTA_INADEQUADA = "conduta_inadequada"         # Conduta desrespeitosa/ofensiva
    INFORMACOES_FALSAS = "informacoes_falsas"         # Perfil, especialidades ou documentos falsos
    OUTRO = "outro"                                   # Outro motivo (relato livre na descrição)


class DenunciaStatus(str, enum.Enum):
    """Situação da denúncia na trilha de moderação (painel do administrador: issue #23)."""

    PENDENTE = "pendente"
    EM_ANALISE = "em_analise"
    RESOLVIDA = "resolvida"
    ARQUIVADA = "arquivada"


# Status que mantêm a denúncia "em aberto". Enquanto existir uma denúncia do
# mesmo cliente contra o mesmo profissional nesses estados, uma nova denúncia
# idêntica é recusada (anti-spam); após resolvida/arquivada, o cliente pode
# denunciar novamente.
DENUNCIA_STATUS_EM_ABERTO = (
    DenunciaStatus.PENDENTE.value,
    DenunciaStatus.EM_ANALISE.value,
)


class Denuncia(Base):
    """
    Denúncia registrada por um cliente contra um profissional (issue #68).

    O autor (`cliente_id`) é sempre derivado do token de acesso do cliente; o
    alvo (`professional_id`) vem do payload. A moderação pelo administrador
    (issue #23) apenas muda `status` — nenhuma transição é exposta ao cliente.
    """

    __tablename__ = "denuncias"
    __table_args__ = (
        Index("ix_denuncias_cliente_profissional", "cliente_id", "professional_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(
        Integer,
        ForeignKey("clientes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    professional_id = Column(
        Integer,
        ForeignKey("professionals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    motivo = Column(String(50), nullable=False, index=True)
    descricao = Column(Text, nullable=False)
    status = Column(
        String(30),
        default=DenunciaStatus.PENDENTE.value,
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AgendamentoStatus(str, enum.Enum):
    """Status do ciclo de vida de um agendamento de slot (issue #78)."""

    AGENDADO = "agendado"
    CANCELADO = "cancelado"
    CONCLUIDO = "concluido"


# Status que efetivamente ocupam o horário do profissional. Um agendamento
# cancelado é histórico: libera o slot para uma nova reserva (o cancelamento em
# si pertence à issue #24, que só precisa mudar `status`).
AGENDAMENTO_STATUS_OCUPANTES = (
    AgendamentoStatus.AGENDADO.value,
    AgendamentoStatus.CONCLUIDO.value,
)


class DisponibilidadeProfissional(Base):
    """
    Janela semanal de atendimento informada pelo profissional (issue #78).

    Cada linha é uma faixa contínua de atendimento em um dia da semana, fatiada
    em slots de `duracao_slot_min` minutos pela rota de agenda. `dia_semana`
    segue a convenção de `datetime.weekday()`: 0 = segunda-feira ... 6 = domingo.

    Os horários (`hora_inicio` / `hora_fim`) e os instantes gerados para os slots
    usam o mesmo padrão naive-UTC das demais colunas de data do projeto (ver
    `verificacao.utcnow`): `TIMESTAMP WITHOUT TIME ZONE` no PostgreSQL e
    DATETIME no SQLite dos testes.
    """

    __tablename__ = "disponibilidade_profissional"
    __table_args__ = (
        UniqueConstraint(
            "professional_id",
            "dia_semana",
            "hora_inicio",
            name="uq_disponibilidade_professional_dia_inicio",
        ),
        CheckConstraint(
            "dia_semana >= 0 AND dia_semana <= 6",
            name="ck_disponibilidade_dia_semana_valido",
        ),
        CheckConstraint("duracao_slot_min > 0", name="ck_disponibilidade_duracao_positiva"),
    )

    id = Column(Integer, primary_key=True, index=True)
    professional_id = Column(
        Integer,
        ForeignKey("professionals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dia_semana = Column(Integer, nullable=False, index=True)
    hora_inicio = Column(Time, nullable=False)
    hora_fim = Column(Time, nullable=False)
    duracao_slot_min = Column(Integer, default=60, nullable=False)
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    atualizado_em = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    professional = relationship("Professional")


class Agendamento(Base):
    """
    Reserva de um slot da agenda por um cliente autenticado (issue #78).

    `data_hora_inicio`/`data_hora_fim` são derivados da grade semanal do
    profissional no momento da reserva (o cliente não escolhe a duração) e
    seguem o padrão naive-UTC do projeto.

    Anti double-booking: além de o índice `(professional_id, data_hora_inicio)`
    acelerar a consulta de ocupação, existe um índice único **parcial** que
    vale apenas para agendamentos não cancelados — assim dois clientes nunca
    conseguem reservar o mesmo instante, mas um agendamento cancelado (#24)
    devolve o slot para a agenda. O índice parcial usa a cláusula específica de
    cada dialeto (SQLite nos testes, PostgreSQL em produção).
    """

    __tablename__ = "agendamentos"
    __table_args__ = (
        Index("ix_agendamentos_professional_data_hora", "professional_id", "data_hora_inicio"),
        Index(
            "uq_agendamentos_professional_data_hora_ativo",
            "professional_id",
            "data_hora_inicio",
            unique=True,
            postgresql_where=text("status <> 'cancelado'"),
            sqlite_where=text("status <> 'cancelado'"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    professional_id = Column(
        Integer,
        ForeignKey("professionals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cliente_id = Column(
        Integer,
        ForeignKey("clientes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    orcamento_id = Column(
        Integer,
        ForeignKey("orcamentos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    data_hora_inicio = Column(DateTime, nullable=False)
    data_hora_fim = Column(DateTime, nullable=False)
    status = Column(
        String(30),
        default=AgendamentoStatus.AGENDADO.value,
        nullable=False,
        index=True,
    )
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    professional = relationship("Professional")
    cliente = relationship("Cliente")
    orcamento = relationship("Orcamento")
