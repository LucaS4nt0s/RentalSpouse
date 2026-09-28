import hashlib
import secrets

# Recomendação OWASP para PBKDF2-HMAC-SHA256 (>= 600.000 iterações)
ITERACOES_PBKDF2 = 600_000


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
        iterations=ITERACOES_PBKDF2,
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
            iterations=ITERACOES_PBKDF2,
        )
        return secrets.compare_digest(key.hex(), key_hex)
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# Tokens de verificação de e-mail
# ---------------------------------------------------------------------------


def gerar_token_verificacao() -> str:
    """
    Gera um token opaco e de alta entropia para confirmação de e-mail.

    Utiliza 32 bytes (256 bits) de aleatoriedade criptográfica do módulo
    `secrets`, codificados em URL-safe base64 — seguro para trafegar em links
    de e-mail.
    """
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """
    Calcula o hash determinístico (SHA-256) de um token de verificação.

    O token NUNCA é persistido em claro: guardamos apenas o hash, de forma que
    um eventual vazamento do banco não permita a terceiros confirmar o e-mail
    de outros usuários. SHA-256 puro (sem salt) é adequado neste caso porque o
    token já possui 256 bits de entropia aleatória, diferentemente de uma senha
    escolhida por um humano. O determinismo também permite buscar o registro
    diretamente por índice no banco.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_confere(hash_armazenado: str, token_recebido: str) -> bool:
    """
    Compara, em tempo constante, o token recebido com o hash armazenado.
    """
    if not hash_armazenado or not token_recebido:
        return False
    return secrets.compare_digest(hash_armazenado, hash_token(token_recebido))
