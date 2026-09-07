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

# Configuração de CORS para permitir que o frontend acesse a API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
