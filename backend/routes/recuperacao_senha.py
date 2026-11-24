"""
Rotas HTTP do fluxo "Esqueci minha senha" (issue #75).

A rota de solicitação sempre responde 202 com a mesma mensagem, exista ou não
uma conta para o e-mail informado. O token trafega no corpo do POST de
redefinição — a página web lê o parâmetro do link recebido por e-mail e o
submete, evitando registrar o token nos logs de acesso da API.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import recuperacao_senha
import schemas

router = APIRouter(prefix="/api/auth", tags=["Recuperação de Senha"])


@router.post(
    "/esqueci-senha",
    response_model=schemas.MensagemResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Solicitar link de redefinição de senha",
    description=(
        "Envia um link de redefinição para o e-mail informado, caso exista uma "
        "conta ativa. A resposta é idêntica para e-mails cadastrados ou não, "
        "evitando a enumeração de contas."
    ),
)
def solicitar_recuperacao(
    payload: schemas.SolicitarRecuperacaoSenhaRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Prepara o token e agenda o envio do e-mail de redefinição."""
    pendente = recuperacao_senha.solicitar_recuperacao(db, payload.email)

    if pendente is not None:
        background_tasks.add_task(
            recuperacao_senha.enviar_email_de_redefinicao, pendente
        )

    return schemas.MensagemResponse(mensagem=recuperacao_senha.MENSAGEM_SOLICITACAO)


@router.post(
    "/redefinir-senha",
    response_model=schemas.MensagemResponse,
    status_code=status.HTTP_200_OK,
    summary="Redefinir senha com token",
    description=(
        "Consome o token de uso único recebido por e-mail e aplica a nova senha. "
        "Retorna 400 quando o link é inválido, já foi utilizado ou expirou."
    ),
)
def redefinir_senha(
    payload: schemas.RedefinirSenhaRequest,
    db: Session = Depends(get_db),
):
    """Valida o token e atualiza a senha da conta correspondente."""
    try:
        recuperacao_senha.redefinir_senha(db, payload.token, payload.nova_senha)
    except recuperacao_senha.ErroRecuperacaoSenha as erro:
        raise HTTPException(status_code=erro.status_code, detail=erro.mensagem)

    return schemas.MensagemResponse(mensagem=recuperacao_senha.MENSAGEM_SENHA_REDEFINIDA)
