"""
Módulo de carregamento defensivo de variáveis de ambiente (.env) para o RentalSpouse.

Garante que o arquivo `.env` seja localizado e carregado independentemente de como
a aplicação é executada (seja da raiz do repositório, da pasta backend, via uvicorn,
pytest, docker ou scripts CLI).

Utiliza `python-dotenv` se disponível e possui fallback nativo sem dependências externas.
Não sobrescreve variáveis que já estejam definidas no ambiente operacional (`override=False`).
"""

import os
from pathlib import Path
from typing import Optional


def encontrar_arquivo_env() -> Optional[Path]:
    """
    Localiza o arquivo `.env` em diretórios prováveis do monorepo:
    1. Diretório atual de trabalho (`Path.cwd()`)
    2. Diretório `backend/`
    3. Raiz do projeto (pai de `backend/`)
    """
    base_dir = Path(__file__).resolve().parent
    candidatos = [
        Path.cwd() / ".env",
        base_dir / ".env",
        base_dir.parent / ".env",
    ]
    for caminho in candidatos:
        if caminho.is_file():
            return caminho.resolve()
    return None


def carregar_env() -> Optional[Path]:
    """
    Carrega as variáveis do arquivo `.env` para `os.environ`.
    Retorna o `Path` do arquivo carregado ou `None` caso não encontrado.
    """
    caminho = encontrar_arquivo_env()
    if not caminho:
        return None

    # Tenta usar python-dotenv se estiver instalado
    try:
        from dotenv import load_dotenv

        load_dotenv(caminho, override=False)
        return caminho
    except ImportError:
        pass

    # Fallback nativo: leitura linha a linha em Python puro
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            for linha in f:
                linha = linha.strip()
                if not linha or linha.startswith("#"):
                    continue
                if linha.startswith("export "):
                    linha = linha[7:].strip()
                if "=" not in linha:
                    continue
                chave, valor = linha.split("=", 1)
                chave = chave.strip()
                valor = valor.strip()
                # Remove aspas envolventes se presentes
                if (valor.startswith('"') and valor.endswith('"')) or (
                    valor.startswith("'") and valor.endswith("'")
                ):
                    valor = valor[1:-1]
                # Não sobrescreve variáveis já presentes no ambiente
                if chave and chave not in os.environ:
                    os.environ[chave] = valor
        return caminho
    except Exception:
        return None


# Executa o carregamento automaticamente no momento da importação
ARQUIVO_ENV_CARREGADO = carregar_env()
