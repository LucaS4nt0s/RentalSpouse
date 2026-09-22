import hashlib
import secrets


def hash_senha(senha: str) -> str:
    """
    Gera um hash seguro da senha utilizando PBKDF2-HMAC-SHA256 com salt aleatório.
    Formato do retorno: <salt_hex>$<hash_hex>
    """
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        senha.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=100_000,
    )
    return f"{salt}${key.hex()}"


def verificar_senha(senha: str, senha_hash: str) -> bool:
    """
    Verifica se a senha em texto plano corresponde ao hash armazenado.
    """
    try:
        salt, key_hex = senha_hash.split("$", 1)
        key = hashlib.pbkdf2_hmac(
            "sha256",
            senha.encode("utf-8"),
            salt.encode("utf-8"),
            iterations=100_000,
        )
        return secrets.compare_digest(key.hex(), key_hex)
    except Exception:
        return False
