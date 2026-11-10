import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import env_loader  # noqa: F401
import database
import payment_gateway
from migrations import run_all_migrations
from routes.admin_moderation import router as admin_moderation_router
from routes.admins import router as admins_router
from routes.agendamentos import router as agendamentos_router
from routes.avaliacoes import router as avaliacoes_router
from routes.auth import router as auth_router
from routes.clientes import router as clientes_router
from routes.denuncias import router as denuncias_router
from routes.hello import router as hello_router
from routes.professional_documents_me import (
    router as professional_documents_me_router,
)
from routes.professionals import (
    profissionais_router,
    router as professionals_router,
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


@app.exception_handler(RequestValidationError)
async def tratar_erro_validacao(request: Request, exc: RequestValidationError):
    """
    Remove o eco de valores sensíveis no corpo do erro 422.

    O handler padrão do FastAPI inclui `input`/`ctx` em cada item, o que fazia
    PAN e CVV voltarem para o cliente. Em rotas de pagamento removemos o eco
    de todos os campos; nas demais, apenas dos campos sensíveis.
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
        erros.append(item)
    return JSONResponse(status_code=422, content={"detail": erros})


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

