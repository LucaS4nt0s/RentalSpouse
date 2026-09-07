from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
from database import Base, engine, get_db
from schemas import StatusRead


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Cria todas as tabelas no banco de dados ao iniciar a aplicação."""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="RentalSpouse API",
    description="Backend do projeto RentalSpouse",
    version="0.1.0",
    lifespan=lifespan,
)

# Origens explícitas: "*" é inválido com allow_credentials=True (spec CORS).
# Adicione aqui as origens de staging/produção conforme necessário.
ALLOW_ORIGINS = [
    "http://localhost:3000",   # Next.js dev server
    "http://localhost",        # Generics / mobile via localhost
    "http://10.0.2.2",         # Android Emulator -> host machine
    "http://10.0.2.2:8000",    # Android Emulator full URL
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/api/hello", response_model=StatusRead, tags=["Status"])
def hello(db: Session = Depends(get_db)):
    """
    Retorna a primeira mensagem da tabela Status.
    Caso a tabela esteja vazia, insere 'Olá Mundo do Banco de Dados!' e a retorna.
    """
    status = db.query(models.Status).first()

    if status is None:
        status = models.Status(message="Olá Mundo do Banco de Dados!")
        db.add(status)
        db.commit()
        db.refresh(status)

    return status
