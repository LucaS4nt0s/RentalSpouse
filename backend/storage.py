import os
from pathlib import Path
import re
from typing import Optional, Set
import uuid

# Diretório padrão de upload de documentos (pode ser sobrescrito via variável de ambiente)
DEFAULT_UPLOAD_DIR = os.getenv("DOCUMENTS_UPLOAD_DIR", "uploads/documents")

# Tamanho máximo de arquivo: 10 MB
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

# Extensões e tipos MIME permitidos para documentos e fotos
ALLOWED_EXTENSIONS: Set[str] = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES: Set[str] = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


# Assinaturas binárias (magic bytes) para validação de integridade de arquivos
MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    ".pdf": [b"%PDF-"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".webp": [b"RIFF"],
}


def get_storage_root() -> Path:
    """Retorna o caminho absoluto do diretório raiz de armazenamento de documentos."""
    upload_dir = os.getenv("DOCUMENTS_UPLOAD_DIR", DEFAULT_UPLOAD_DIR)
    root = Path(upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def sanitize_filename(filename: str) -> str:
    """
    Sanitiza o nome original do arquivo removendo caracteres potencialmente perigosos
    e impedindo qualquer tentativa de path traversal.
    """
    if not filename:
        return "document"
    # Pega apenas o basename, ignorando caminhos
    base = Path(filename).name
    # Remove caracteres especiais preservando letras, números, ponto, hífen e underline
    clean = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
    return clean or "document"


def validate_document_file(
    filename: Optional[str],
    mime_type: Optional[str],
    file_or_content: int | bytes,
) -> None:
    """
    Valida formato, tipo MIME, tamanho e assinatura binária (magic bytes) do arquivo enviado.
    Levanta ValueError caso o arquivo viole alguma das regras.
    """
    if not filename or not filename.strip():
        raise ValueError("O nome do arquivo não pode ser vazio.")

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Extensão '{ext}' não suportada. Extensões permitidas: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
        )

    if isinstance(file_or_content, (bytes, bytearray)):
        file_size = len(file_or_content)
        content: Optional[bytes] = bytes(file_or_content)
    else:
        file_size = int(file_or_content)
        content = None

    if file_size <= 0:
        raise ValueError("O arquivo enviado está vazio (0 bytes).")

    if file_size > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"O arquivo excede o limite máximo permitido de {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
        )

    if mime_type:
        normalized_mime = mime_type.lower().split(";")[0].strip()
        if normalized_mime not in ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Tipo MIME '{mime_type}' não permitido. Formatos aceitos: PDF e imagens (JPEG, PNG, WebP)."
            )

    # Validação de magic bytes quando os bytes do arquivo são fornecidos
    if content is not None:
        signatures = MAGIC_SIGNATURES.get(ext, [])
        if ext == ".webp":
            is_valid_magic = content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP"
        else:
            is_valid_magic = any(content.startswith(sig) for sig in signatures)

        if not is_valid_magic:
            raise ValueError(
                f"O conteúdo binário do arquivo não corresponde à extensão '{ext}' declarada (assinatura inválida)."
            )


def resolve_document_file_path(relative_path: str) -> Path:
    """
    Resolve o caminho absoluto do arquivo a partir do caminho relativo armazenado,
    garantindo que o arquivo resida estritamente dentro da raiz de upload (anti path traversal).
    """
    if not relative_path or not relative_path.strip():
        raise ValueError("Caminho de arquivo inválido.")

    root = get_storage_root()
    # Normaliza separadores de caminho
    normalized = Path(relative_path.replace("\\", "/"))
    target = (root / normalized).resolve()

    # Validação de segurança: o caminho alvo deve começar com o diretório raiz
    try:
        target.relative_to(root)
    except ValueError:
        raise PermissionError("Acesso não autorizado: tentativa de path traversal detectada.")

    return target


def save_document_file(
    professional_id: int,
    original_filename: str,
    content: bytes,
) -> tuple[str, str]:
    """
    Salva os bytes do documento no sistema de arquivos sob o diretório do profissional.
    Retorna uma tupla (caminho_relativo, nome_sanitizado).
    """
    root = get_storage_root()
    clean_name = sanitize_filename(original_filename)
    unique_filename = f"{uuid.uuid4().hex}_{clean_name}"

    prof_dir = root / str(professional_id)
    prof_dir.mkdir(parents=True, exist_ok=True)

    dest_file = prof_dir / unique_filename
    dest_file.write_bytes(content)

    relative_path = f"{professional_id}/{unique_filename}"
    return relative_path, clean_name


def delete_document_file(relative_path: str) -> bool:
    """
    Exclui um arquivo do disco a partir de seu caminho relativo seguro.
    Retorna True se o arquivo foi excluído, ou False se não existia.
    """
    try:
        target = resolve_document_file_path(relative_path)
        if target.is_file():
            target.unlink()
            return True
        return False
    except Exception:
        return False


def delete_professional_directory(professional_id: int) -> bool:
    """
    Exclui o diretório de documentos do profissional e todos os arquivos contidos,
    garantindo que não fiquem pastas órfãs no filesystem.
    """
    try:
        root = get_storage_root()
        prof_dir = (root / str(professional_id)).resolve()
        if prof_dir.is_dir() and prof_dir != root:
            prof_dir.relative_to(root)
            import shutil
            shutil.rmtree(prof_dir, ignore_errors=True)
            return True
        return False
    except Exception:
        return False

