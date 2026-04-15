import bcrypt
from cryptography.fernet import Fernet

from backend.core.config import settings


def hash_password(plain: str) -> str:
    """Hash a plaintext password using bcrypt with cost factor >= 12."""
    rounds = max(settings.BCRYPT_ROUNDS, 12)
    hashed = bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=rounds))
    return hashed.decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _fernet() -> Fernet:
    return Fernet(settings.EMAIL_ENCRYPTION_KEY.encode())


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value using Fernet symmetric encryption."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str:
    """Decrypt a Fernet-encrypted token back to plaintext."""
    return _fernet().decrypt(token.encode()).decode()
