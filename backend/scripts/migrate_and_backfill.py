"""
Script standalone para executar as migrações ALTER TABLE e backfill de dados.
Pode ser executado diretamente no terminal ou em contêineres:
    python scripts/migrate_and_backfill.py
"""
import logging
import os
import sys

# Ajusta path para importar módulos do backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import database
from migrations import run_all_migrations

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Iniciando rotina de migração ALTER TABLE e backfill...")
    run_all_migrations(database.engine, database.SessionLocal)
    logger.info("Migração concluída com sucesso.")
