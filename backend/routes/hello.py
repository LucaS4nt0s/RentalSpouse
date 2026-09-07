from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from database import get_db
from schemas import StatusRead

router = APIRouter(prefix="/api", tags=["Status"])


@router.get("/hello", response_model=StatusRead)
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
