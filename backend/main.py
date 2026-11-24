import os
import logging
import re
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import env_loader  # noqa: F401
import database
import payment_gateway
from migrations import run_all_migrations
from routes.admin_moderation import router as admin_moderation_router
from routes.admins import router as admins_router
from routes.agendamentos import router as agendamentos_router
from routes.avaliacoes import router as avaliacoes_router
from routes.auth import conta_router, router as auth_router
from routes.clientes import router as clientes_router
from routes.denuncias import router as denuncias_router
from routes.hello import router as hello_router
from routes.professional_documents_me import (
    router as professional_documents_me_router,
)
from routes.professionals import (
    profissionais_router,
    router as professionals_router,
    seed_demo_professionals,
)
from routes.verificacao import router as verificacao_router
from routes.orcamentos import router as orcamentos_router
from routes.recuperacao_senha import router as recuperacao_senha_router
from routes.notificacoes import (
    router as notificacoes_router,
    ws_router as notificacoes_ws_router,
)
from routes.pagamentos import router as pagamentos_router
from security import seed_initial_admin

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Cria todas as tabelas no banco de dados, executa migrações defensivas e semeia o admin inicial."""
    # Fail-closed: provider inválido ou sandbox_mock em produção impede o startup.
    payment_gateway.validar_configuracao_pagamentos()
    database.Base.metadata.create_all(bind=database.engine)
    try:
        run_all_migrations(database.engine, database.SessionLocal)
    except Exception:
        logger.exception("Falha ao executar migrações ou backfill durante o startup da aplicação.")

    db = database.SessionLocal()
    try:
        seed_initial_admin(db)
        if not os.getenv("PYTEST_CURRENT_TEST"):
            seed_demo_professionals(db)
    except Exception:
        db.rollback()
        logger.exception("Falha ao semear o administrador inicial durante o startup da aplicação.")
    finally:
        db.close()
    yield


app = FastAPI(
    title="RentalSpouse API",
    description="Backend do projeto RentalSpouse",
    version="0.1.0",
    lifespan=lifespan,
)


# Campos que nunca podem voltar no eco de erros 422 (PCI-DSS / LGPD).
_CAMPOS_SENSIVEIS_VALIDACAO = {
    "numero_cartao",
    "pan",
    "cvv",
    "validade",
    "card_token",
    "cpf_titular",
}

# ---------------------------------------------------------------------------
# Localização pt-BR das mensagens de erro da API (issue #100)
#
# O Pydantic v2 e o Starlette respondem em inglês por padrão. Traduzimos apenas
# as mensagens genéricas do framework: detalhes de domínio levantados pelas
# rotas (HTTPException com texto próprio) e validadores customizados já são
# escritos em português e passam intactos.
# ---------------------------------------------------------------------------

_MENSAGEM_VALIDACAO_GENERICA = "Dados inválidos para este campo."

# Mensagens padrão do Starlette/FastAPI que nunca devem chegar ao usuário.
_TRADUCOES_HTTP_PADRAO = {
    "Not Found": "Recurso não encontrado.",
    "Method Not Allowed": "Método HTTP não permitido para este recurso.",
    "Not authenticated": "Você precisa estar autenticado para acessar este recurso.",
    "Unauthorized": "Você precisa estar autenticado para acessar este recurso.",
    "Could not validate credentials": (
        "Não foi possível validar suas credenciais. Faça login novamente."
    ),
    "Forbidden": "Você não tem permissão para acessar este recurso.",
    "Bad Request": "Requisição inválida.",
    "Conflict": "A operação não pôde ser concluída: o recurso já existe ou está em uso.",
    "Unprocessable Entity": "Não foi possível processar os dados enviados.",
    "Too Many Requests": "Muitas tentativas em pouco tempo. Aguarde e tente novamente.",
    "Internal Server Error": "Erro interno no servidor. Tente novamente mais tarde.",
    "Service Unavailable": "Serviço temporariamente indisponível. Tente novamente mais tarde.",
}

# Templates por `type` do Pydantic v2; os placeholders vêm de `ctx`.
_TRADUCOES_ERRO_VALIDACAO = {
    "missing": "Este campo é obrigatório.",
    "string_type": "Informe um texto válido.",
    "string_too_short": "O texto deve ter pelo menos {min_length} caracteres.",
    "string_too_long": "O texto deve ter no máximo {max_length} caracteres.",
    "string_pattern_mismatch": "O texto não está em um formato válido.",
    "string_unicode": "Informe um texto válido.",
    "too_short": "Informe pelo menos {min_length} item(ns).",
    "too_long": "Informe no máximo {max_length} item(ns).",
    "greater_than": "O valor deve ser maior que {gt}.",
    "greater_than_equal": "O valor deve ser maior ou igual a {ge}.",
    "less_than": "O valor deve ser menor que {lt}.",
    "less_than_equal": "O valor deve ser menor ou igual a {le}.",
    "int_parsing": "Informe um número inteiro válido.",
    "int_type": "Informe um número inteiro válido.",
    "int_from_float": "Informe um número inteiro válido.",
    "float_parsing": "Informe um valor numérico válido.",
    "float_type": "Informe um valor numérico válido.",
    "decimal_parsing": "Informe um valor numérico válido.",
    "decimal_type": "Informe um valor numérico válido.",
    "bool_parsing": "Informe um valor booleano válido (verdadeiro ou falso).",
    "bool_type": "Informe um valor booleano válido (verdadeiro ou falso).",
    "date_parsing": "Informe uma data válida (formato AAAA-MM-DD).",
    "date_from_datetime_parsing": "Informe uma data válida (formato AAAA-MM-DD).",
    "date_type": "Informe uma data válida (formato AAAA-MM-DD).",
    "datetime_parsing": "Informe uma data e hora válidas.",
    "datetime_from_date_parsing": "Informe uma data e hora válidas.",
    "datetime_type": "Informe uma data e hora válidas.",
    "time_parsing": "Informe um horário válido.",
    "time_type": "Informe um horário válido.",
    "json_invalid": "O corpo da requisição não é um JSON válido.",
    "json_type": "O corpo da requisição não é um JSON válido.",
    "model_type": "Envie um objeto JSON válido.",
    "model_attributes_type": "Envie um objeto JSON válido.",
    "dict_type": "Envie um objeto JSON válido.",
    "list_type": "Envie uma lista válida.",
    "tuple_type": "Envie uma lista válida.",
    "set_type": "Envie uma lista válida.",
    "url_parsing": "Informe uma URL válida.",
    "url_scheme": "A URL deve começar com http:// ou https://.",
    "url_type": "Informe uma URL válida.",
}

_PADRAO_EMAIL_EM_INGLES = re.compile(
    r"valid email address|email address must have an @|@-sign", re.IGNORECASE
)

# Rede de segurança para tipos não catalogados acima que ainda venham em inglês.
_PADROES_INGLES_VALIDACAO: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^field required$", re.IGNORECASE), "Este campo é obrigatório."),
    (re.compile(r"^input should be a valid string$", re.IGNORECASE), "Informe um texto válido."),
    (
        re.compile(r"^string should have at least (\d+) characters?", re.IGNORECASE),
        r"O texto deve ter pelo menos \1 caracteres.",
    ),
    (
        re.compile(r"^string should have at most (\d+) characters?", re.IGNORECASE),
        r"O texto deve ter no máximo \1 caracteres.",
    ),
    (
        re.compile(r"^input should be greater than or equal to (\S+)$", re.IGNORECASE),
        r"O valor deve ser maior ou igual a \1.",
    ),
    (
        re.compile(r"^input should be less than or equal to (\S+)$", re.IGNORECASE),
        r"O valor deve ser menor ou igual a \1.",
    ),
    (re.compile(r"valid integer", re.IGNORECASE), "Informe um número inteiro válido."),
    (re.compile(r"valid number", re.IGNORECASE), "Informe um valor numérico válido."),
    (re.compile(r"valid boolean", re.IGNORECASE), "Informe um valor booleano válido."),
    (re.compile(r"valid date", re.IGNORECASE), "Informe uma data válida."),
    (re.compile(r"json decode error", re.IGNORECASE), "O corpo da requisição não é um JSON válido."),
)


def _traduzir_detalhe_http(detail: Any) -> Any:
    """Traduz as mensagens padrão do framework; detalhes de domínio seguem intactos."""
    if isinstance(detail, str):
        return _TRADUCOES_HTTP_PADRAO.get(detail.strip(), detail)
    return detail


def _traduzir_mensagem_por_padrao(mensagem: str) -> str | None:
    """Tenta traduzir mensagens em inglês por padrão textual (fallback)."""
    for padrao, traducao in _PADROES_INGLES_VALIDACAO:
        if padrao.search(mensagem):
            return padrao.sub(traducao, mensagem)
    return None


def _traduzir_erro_validacao(erro: dict[str, Any]) -> str:
    """Converte uma entrada de `RequestValidationError.errors()` para pt-BR."""
    tipo = str(erro.get("type") or "")
    mensagem = str(erro.get("msg") or "")
    ctx = erro.get("ctx") or {}

    if tipo in {"value_error", "assertion_error"}:
        # Validadores customizados já escrevem em português: apenas removemos
        # o prefixo que o Pydantic adiciona ("Value error, ", "Assertion failed, ").
        limpa = re.sub(r"^(Value error|Assertion failed),\s*", "", mensagem).strip()
        if _PADRAO_EMAIL_EM_INGLES.search(limpa):
            return "Informe um endereço de e-mail válido."
        return limpa or _MENSAGEM_VALIDACAO_GENERICA

    if tipo == "enum":
        esperado = ctx.get("expected")
        if isinstance(esperado, (list, tuple, set)):
            opcoes = ", ".join(str(item) for item in esperado)
            return f"Valor inválido. Opções permitidas: {opcoes}."
        return "Valor inválido para este campo."

    template = _TRADUCOES_ERRO_VALIDACAO.get(tipo)
    if template is not None:
        try:
            return template.format(**ctx)
        except (KeyError, IndexError, ValueError):
            return _MENSAGEM_VALIDACAO_GENERICA

    traduzida = _traduzir_mensagem_por_padrao(mensagem)
    return traduzida or _MENSAGEM_VALIDACAO_GENERICA


@app.exception_handler(RequestValidationError)
async def tratar_erro_validacao(request: Request, exc: RequestValidationError):
    """
    Remove o eco de valores sensíveis e traduz o erro 422 para pt-BR.

    O handler padrão do FastAPI inclui `input`/`ctx` em cada item, o que fazia
    PAN e CVV voltarem para o cliente. Em rotas de pagamento removemos o eco
    de todos os campos; nas demais, apenas dos campos sensíveis. As mensagens
    padrão em inglês do Pydantic v2 são traduzidas antes de devolver o JSON.
    """
    rota_pagamento = request.url.path.startswith("/api/pagamentos")
    erros = []
    for erro in exc.errors():
        item = dict(erro)
        loc = [str(parte) for parte in item.get("loc", [])]
        # `ctx` carrega a exceção original (ValueError) e não é serializável.
        item.pop("ctx", None)
        if rota_pagamento or any(campo in loc for campo in _CAMPOS_SENSIVEIS_VALIDACAO):
            item.pop("input", None)
        item["msg"] = _traduzir_erro_validacao(erro)
        erros.append(item)
    return JSONResponse(status_code=422, content={"detail": erros})


@app.exception_handler(StarletteHTTPException)
async def tratar_erro_http(request: Request, exc: StarletteHTTPException):
    """Traduz as respostas HTTP padrão (404, 405, 500, ...) para pt-BR."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": _traduzir_detalhe_http(exc.detail)},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def tratar_erro_inesperado(request: Request, exc: Exception):
    """Garante que falhas internas não vazem stack trace nem texto em inglês."""
    logger.exception(
        "Erro não tratado em %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno no servidor. Tente novamente mais tarde."},
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
    allow_headers=["*"],
)

# Registrar routers modulares
app.include_router(hello_router)
app.include_router(clientes_router)
app.include_router(verificacao_router)
# /api/professionals/me/documents precisa vir ANTES do router de profissionais:
# caso contrário, "me" casaria com o path param {professional_id} e viraria 422.
app.include_router(professional_documents_me_router)
app.include_router(professionals_router)
app.include_router(profissionais_router)
app.include_router(auth_router)
app.include_router(conta_router)
app.include_router(recuperacao_senha_router)
app.include_router(admins_router)
app.include_router(denuncias_router)
app.include_router(admin_moderation_router)
app.include_router(orcamentos_router)
app.include_router(notificacoes_router)
app.include_router(notificacoes_ws_router)
# Agenda de disponibilidade e agendamento de slots (issue #78).
app.include_router(agendamentos_router)
# Pagamentos In-App via PIX e Cartão de Crédito - Mercado Pago (issue #18).
app.include_router(pagamentos_router)
# Avaliações e comentários de profissionais (issues #19 e #21).
app.include_router(avaliacoes_router)

