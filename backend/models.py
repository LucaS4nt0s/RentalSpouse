from datetime import datetime, timezone
from sqlalchemy import Column, Date, DateTime, Integer, String

from database import Base


class Status(Base):
    """Tabela de status com uma mensagem simples."""

    __tablename__ = "status"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(String, nullable=False)


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
