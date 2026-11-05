from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import ClienteCreate, ClienteRead
from security import hash_senha
import verificacao

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])


@router.post(
    "",
    response_model=ClienteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar novo cliente",
    description="Realiza o cadastro de um novo cliente na plataforma com validação de dados, unicidade de e-mail e CPF.",
)
def cadastrar_cliente(
    cliente_in: ClienteCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Cadastra um cliente na plataforma:
    - Valida se o e-mail já está cadastrado (retorna 409 Conflict).
    - Valida se o CPF já está cadastrado (retorna 409 Conflict).
    - Aplica hash criptográfico na senha antes de salvar.
    - Persiste os dados e o endereço estruturado no banco relacional.
    - Emite o token de verificação e agenda o envio do e-mail de confirmação.
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

    try:
        db.add(db_cliente)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail ou CPF já cadastrado na plataforma.",
        )

    db.refresh(db_cliente)

    # O token é emitido e persistido ANTES da resposta, mas o envio do e-mail é
    # delegado a uma BackgroundTask: o handshake SMTP (que pode levar segundos
    # com STARTTLS) não deve atrasar o cadastro. A tarefa recebe apenas dados
    # primitivos, pois a sessão de banco da requisição já estará fechada quando
    # ela executar.
    pendente = verificacao.preparar_verificacao(db, db_cliente)
    background_tasks.add_task(verificacao.enviar_email_de_verificacao, pendente)

    return db_cliente
