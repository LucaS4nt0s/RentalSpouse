from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String, Text

from database import Base


class Status(Base):
    """Tabela de status com uma mensagem simples."""

    __tablename__ = "status"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(String, nullable=False)


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
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
