import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Lê a URL do banco a partir de variável de ambiente.
# Fallback para desenvolvimento local sem Docker.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://rentalspouse:rentalspouse_pass@localhost:5432/rentalspouse_db",
)

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency que fornece uma sessão de banco de dados por requisição."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
