"""
Testes unitários e de integração para o módulo de migrações e retrocompatibilidade (migrations.py).
Valida a execução de comandos ALTER TABLE defensivos, criação de índices B-Tree/pg_trgm
e o backfill de colunas normalizadas para bancos legados.
"""
import json
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from migrations import (
    backfill_normalized_fields,
    migrate_columns_and_indexes,
    run_all_migrations,
)


def test_migrations_alter_table_and_backfill():
    """
    Simula um banco legado com tabela 'professionals' sem as colunas normalizadas,
    aplica as migrações defensivas via ALTER TABLE e executa o backfill de dados.
    """
    # Cria um SQLite isolado em memória
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # 1. Cria a tabela 'professionals' em formato legado (sem normalized_*)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE professionals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    phone VARCHAR(20),
                    bio TEXT NOT NULL,
                    service_radius_km FLOAT NOT NULL,
                    specialties JSON NOT NULL,
                    city VARCHAR(100),
                    state VARCHAR(2),
                    senha_hash VARCHAR(255),
                    is_active BOOLEAN DEFAULT 1,
                    approval_status VARCHAR(50) DEFAULT 'approved',
                    approval_notes TEXT,
                    approved_at DATETIME,
                    approved_by_id INTEGER,
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        # Insere dados legados
        conn.execute(
            text(
                """
                INSERT INTO professionals (name, email, bio, service_radius_km, specialties, city, state)
                VALUES ('Antônio Eletricista', 'antonio@legacy.com', 'Instalação elétrica residencial', 20.0, :specs, 'São Paulo', 'SP')
                """
            ),
            {"specs": json.dumps(["Elétrica", "Ar-condicionado"])},
        )
        conn.execute(
            text(
                """
                INSERT INTO professionals (name, email, bio, service_radius_km, specialties, city, state)
                VALUES ('Bárbara Encanadora', 'barbara@legacy.com', 'Conserto de pias e torneiras', 15.0, :specs, 'Niterói', 'RJ')
                """
            ),
            {"specs": json.dumps(["Hidráulica"])},
        )

    # Verifica que as colunas normalizadas e documents_submitted_at NÃO existem antes da migração
    inspector = inspect(engine)
    cols_before = {c["name"] for c in inspector.get_columns("professionals")}
    assert "documents_submitted_at" not in cols_before
    assert "normalized_city" not in cols_before
    assert "normalized_specialties" not in cols_before
    assert "normalized_search" not in cols_before

    # 2. Executa a migração (ALTER TABLE + criação de índices)
    migrate_columns_and_indexes(engine)

    # Verifica que as colunas foram criadas com sucesso
    inspector_after = inspect(engine)
    cols_after = {c["name"] for c in inspector_after.get_columns("professionals")}
    assert "documents_submitted_at" in cols_after
    assert "normalized_city" in cols_after
    assert "normalized_specialties" in cols_after
    assert "normalized_search" in cols_after

    # Verifica que os índices foram criados
    indexes_after = {idx["name"] for idx in inspector_after.get_indexes("professionals")}
    assert "ix_professionals_normalized_city" in indexes_after
    assert "ix_professionals_normalized_specialties" in indexes_after
    assert "ix_professionals_normalized_search" in indexes_after

    # 3. Executa o backfill dos registros antigos
    updated_count = backfill_normalized_fields(Session)
    assert updated_count == 2

    # Verifica que os registros foram devidamente normalizados no banco
    with Session() as db:
        antonio = db.query(models.Professional).filter_by(email="antonio@legacy.com").first()
        assert antonio is not None
        assert antonio.normalized_city == "sao paulo"
        assert "eletrica" in antonio.normalized_specialties
        assert "ar-condicionado" in antonio.normalized_specialties
        assert "antonio" in antonio.normalized_search
        assert "sao paulo" in antonio.normalized_search

        barbara = db.query(models.Professional).filter_by(email="barbara@legacy.com").first()
        assert barbara is not None
        assert barbara.normalized_city == "niteroi"
        assert "hidraulica" in barbara.normalized_specialties
        assert "barbara" in barbara.normalized_search
        assert "niteroi" in barbara.normalized_search

    # 4. Verifica idempotência: rodar novamente não deve dar erro nem refazer o backfill
    run_all_migrations(engine, Session)
    re_updated = backfill_normalized_fields(Session)
    assert re_updated == 0


def test_migrations_on_nonexistent_table():
    """Valida que a migração não falha se a tabela 'professionals' ainda não existe."""
    engine = create_engine("sqlite:///:memory:")
    # Não deve levantar exceção
    migrate_columns_and_indexes(engine)
