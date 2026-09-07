from sqlalchemy import Column, Integer, String

from database import Base


class Status(Base):
    """Tabela de status com uma mensagem simples."""

    __tablename__ = "status"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(String, nullable=False)
