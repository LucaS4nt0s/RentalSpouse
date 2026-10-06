import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
from migrations import run_all_migrations
from routes.admins import router as admins_router
from routes.auth import router as auth_router
from routes.clientes import router as clientes_router
from routes.hello import router as hello_router
from routes.professional_documents_me import (
    router as professional_documents_me_router,
)
from routes.professionals import (
    profissionais_router,
    router as professionals_router,
)
from routes.verificacao import router as verificacao_router
from security import seed_initial_admin

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Cria todas as tabelas no banco de dados, executa migrações defensivas e semeia o admin inicial."""
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
app.include_router(admins_router)
