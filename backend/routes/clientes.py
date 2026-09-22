from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import ClienteCreate, ClienteRead
from security import hash_senha

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])


@router.post(
    "",
    response_model=ClienteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar novo cliente",
    description="Realiza o cadastro de um novo cliente na plataforma com validação de dados, unicidade de e-mail e CPF.",
)
def cadastrar_cliente(cliente_in: ClienteCreate, db: Session = Depends(get_db)):
    """
    Cadastra um novo cliente na plataforma:
    - Valida se o e-mail já está cadastrado (retorna 409 Conflict).
    - Valida se o CPF já está cadastrado (retorna 409 Conflict).
    - Aplica hash criptográfico na senha antes de salvar.
    - Persiste os dados e o endereço estruturado no banco relacional.
    """
    # 1. Verificar unicidade de e-mail
    cliente_existente_email = (
        db.query(models.Cliente)
        .filter(models.Cliente.email == cliente_in.email)
        .first()
    )
    if cliente_existente_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado na plataforma.",
        )

    # 2. Verificar unicidade de CPF
    cliente_existente_cpf = (
        db.query(models.Cliente)
        .filter(models.Cliente.cpf == cliente_in.cpf)
        .first()
    )
    if cliente_existente_cpf:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="CPF já cadastrado na plataforma.",
        )

    # 3. Criar entidade no banco com senha hasheada
    db_cliente = models.Cliente(
        nome=cliente_in.nome,
        email=cliente_in.email,
        cpf=cliente_in.cpf,
        data_nascimento=cliente_in.data_nascimento,
        senha_hash=hash_senha(cliente_in.senha),
        cep=cliente_in.endereco.cep,
        logradouro=cliente_in.endereco.logradouro,
        numero=cliente_in.endereco.numero,
        complemento=cliente_in.endereco.complemento,
        bairro=cliente_in.endereco.bairro,
        cidade=cliente_in.endereco.cidade,
        estado=cliente_in.endereco.estado,
    )

    db.add(db_cliente)
    db.commit()
    db.refresh(db_cliente)

    return db_cliente


@router.get(
    "/{cliente_id}",
    response_model=ClienteRead,
    summary="Obter dados de um cliente",
    description="Retorna os dados públicos de um cliente cadastrado pelo seu identificador único.",
)
def obter_cliente(cliente_id: int, db: Session = Depends(get_db)):
    """Busca um cliente cadastrado pelo ID."""
    db_cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == cliente_id)
        .first()
    )
    if not db_cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado.",
        )
    return db_cliente


@router.get(
    "",
    response_model=List[ClienteRead],
    summary="Listar clientes",
    description="Retorna a lista paginada de clientes cadastrados na plataforma.",
)
def listar_clientes(
    skip: int = Query(0, ge=0, description="Número de registros a pular"),
    limit: int = Query(20, ge=1, le=100, description="Limite de registros a retornar"),
    db: Session = Depends(get_db),
):
    """Lista clientes cadastrados com paginação."""
    clientes = db.query(models.Cliente).offset(skip).limit(limit).all()
    return clientes
