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
    migrate_denuncias_table,
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

    # Verifica que as colunas legadas ausentes NÃO existem antes da migração
    inspector = inspect(engine)
    cols_before = {c["name"] for c in inspector.get_columns("professionals")}
    assert "approval_status" not in cols_before
    assert "approval_notes" not in cols_before
    assert "documents_submitted_at" not in cols_before
    assert "approved_at" not in cols_before
    assert "approved_by_id" not in cols_before
    assert "normalized_city" not in cols_before
    assert "normalized_specialties" not in cols_before
    assert "normalized_search" not in cols_before

    # 2. Executa a migração (ALTER TABLE + criação de índices)
    migrate_columns_and_indexes(engine)

    # Verifica que as colunas foram criadas com sucesso
    inspector_after = inspect(engine)
    cols_after = {c["name"] for c in inspector_after.get_columns("professionals")}
    assert "email_verificado" in cols_after
    assert "verificacao_token_hash" in cols_after
    assert "verificacao_expira_em" in cols_after
    assert "verificacao_enviada_em" in cols_after
    assert "approval_status" in cols_after
    assert "approval_notes" in cols_after
    assert "documents_submitted_at" in cols_after
    assert "approved_at" in cols_after
    assert "approved_by_id" in cols_after
    assert "normalized_city" in cols_after
    assert "normalized_specialties" in cols_after
    assert "normalized_search" in cols_after

    # Verifica que os índices foram criados
    indexes_after = {idx["name"] for idx in inspector_after.get_indexes("professionals")}
    assert "ix_professionals_approval_status" in indexes_after
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


def test_migrations_on_nonexistent_table() -> None:
    """Valida que a migração não falha se a tabela 'professionals' ainda não existe."""
    engine = create_engine("sqlite:///:memory:")
    # Não deve levantar exceção
    migrate_columns_and_indexes(engine)


def test_migrations_users_and_clientes_legacy_tables():
    """Valida adição idempotente de colunas de verificação e role em tabelas legadas users e clientes (#53/#93)."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    cpf VARCHAR(11) NOT NULL
                )
                """
            )
        )

    migrate_columns_and_indexes(engine)
    inspector = inspect(engine)
    user_cols = {c["name"] for c in inspector.get_columns("users")}
    cliente_cols = {c["name"] for c in inspector.get_columns("clientes")}

    assert {"role", "is_active", "email_verificado", "created_at"}.issubset(user_cols)
    assert {
        "email_verificado",
        "verificacao_token_hash",
        "verificacao_expira_em",
        "verificacao_enviada_em",
    }.issubset(cliente_cols)


def test_migrate_denuncias_table_adiciona_colunas_de_moderacao() -> None:
    """
    Simula um banco legado com a tabela `denuncias` anterior à issue #99 e
    confirma que as colunas de decisão da moderação são adicionadas (e que a
    migração é idempotente).
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE denuncias (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cliente_id INTEGER NOT NULL,
                    professional_id INTEGER NOT NULL,
                    motivo VARCHAR(50) NOT NULL,
                    descricao TEXT NOT NULL,
                    status VARCHAR(30) NOT NULL,
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )

    cols_before = {c["name"] for c in inspect(engine).get_columns("denuncias")}
    assert "moderacao_acao" not in cols_before
    assert "moderacao_parecer" not in cols_before
    assert "moderado_em" not in cols_before
    assert "moderado_por_id" not in cols_before

    migrate_denuncias_table(engine)

    cols_after = {c["name"] for c in inspect(engine).get_columns("denuncias")}
    assert {
        "moderacao_acao",
        "moderacao_parecer",
        "moderado_em",
        "moderado_por_id",
    } <= cols_after

    # Idempotência: rodar de novo não deve tentar recriar as colunas.
    migrate_denuncias_table(engine)


def test_migrate_denuncias_table_ignora_banco_sem_tabela() -> None:
    """A migração de denúncias não deve falhar em bancos que ainda não têm a tabela."""
    engine = create_engine("sqlite:///:memory:")
    migrate_denuncias_table(engine)
