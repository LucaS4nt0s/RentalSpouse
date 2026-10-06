"""
Módulo de migrações e retrocompatibilidade de esquema de banco de dados.
Executa comandos ALTER TABLE defensivos e idempotentes para assegurar que
volumes de banco de dados existentes (como postgres_data) recebam novas colunas e índices
sem exigir Alembic ou recriação do container/volume.
"""
import logging
from typing import Callable

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)


def migrate_columns_and_indexes(engine: Engine) -> None:
    """
    Verifica a existência das colunas e índices de busca normalizada na tabela
    'professionals'. Caso não existam (banco legado), executa ALTER TABLE e CREATE INDEX.
    """
    inspector = inspect(engine)
    if not inspector.has_table("professionals"):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("professionals")}

    columns_to_add = [
        ("documents_submitted_at", "TIMESTAMP"),
        ("normalized_city", "VARCHAR(100)"),
        ("normalized_specialties", "TEXT"),
        ("normalized_search", "TEXT"),
    ]

    with engine.begin() as conn:
        for col_name, col_type in columns_to_add:
            if col_name not in existing_columns:
                logger.info(
                    "Migração RentalSpouse: adicionando coluna '%s' na tabela 'professionals' via ALTER TABLE...",
                    col_name,
                )
                conn.execute(text(f"ALTER TABLE professionals ADD COLUMN {col_name} {col_type}"))

        # Índices B-Tree
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("professionals")}
        indexes_to_create = [
            ("ix_professionals_normalized_city", "normalized_city"),
            ("ix_professionals_normalized_specialties", "normalized_specialties"),
            ("ix_professionals_normalized_search", "normalized_search"),
        ]
        for idx_name, col_name in indexes_to_create:
            if idx_name not in existing_indexes:
                logger.info("Migração RentalSpouse: criando índice '%s'...", idx_name)
                conn.execute(
                    text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON professionals ({col_name})")
                )

        # Trigram / GIN para PostgreSQL (para acelerar ILIKE com wildcard à esquerda)
        if engine.dialect.name == "postgresql":
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_professionals_normalized_search_trgm "
                        "ON professionals USING gin (normalized_search gin_trgm_ops);"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_professionals_normalized_city_trgm "
                        "ON professionals USING gin (normalized_city gin_trgm_ops);"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_professionals_normalized_specs_trgm "
                        "ON professionals USING gin (normalized_specialties gin_trgm_ops);"
                    )
                )
                logger.info("Migração RentalSpouse: índices GIN/pg_trgm verificados com sucesso.")
            except Exception as exc:
                logger.warning(
                    "Não foi possível criar índices pg_trgm (permissão ou extensão ausente): %s",
                    exc,
                )


def backfill_normalized_fields(session_factory: Callable[[], Session]) -> int:
    """
    Percorre profissionais que possuem campos normalizados como NULL
    e executa a rotina update_normalized_fields() para preencher os dados.
    """
    with session_factory() as db:
        profs = (
            db.query(models.Professional)
            .filter(
                (models.Professional.normalized_search.is_(None))
                | (models.Professional.normalized_city.is_(None))
                | (models.Professional.normalized_specialties.is_(None))
            )
            .all()
        )
        if not profs:
            return 0

        logger.info(
            "Migração RentalSpouse: executando backfill de campos normalizados para %d registros...",
            len(profs),
        )
        for prof in profs:
            prof.update_normalized_fields()
        db.commit()
        logger.info("Migração RentalSpouse: backfill de normalização concluído com sucesso.")
        return len(profs)


def run_all_migrations(engine: Engine, session_factory: Callable[[], Session]) -> None:
    """Executa a verificação/adição de colunas, índices e o backfill de dados."""
    migrate_columns_and_indexes(engine)
    backfill_normalized_fields(session_factory)
