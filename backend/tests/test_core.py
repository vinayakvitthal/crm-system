"""
Smoke tests for core infrastructure utilities.
Validates requirements: 1.7, 1.8, 1.9, 24.1, 24.6, 26.1
"""
import os
import time

import pytest
from httpx import AsyncClient
from jose import jwt

from backend.core.config import settings
from backend.core.jwt_utils import ALGORITHM, create_access_token, create_refresh_token, decode_token
from backend.core.security import decrypt_value, encrypt_value, hash_password, verify_password


# ---------------------------------------------------------------------------
# security.py — bcrypt (requirement 1.7)
# ---------------------------------------------------------------------------

def test_hash_password_is_not_plaintext():
    hashed = hash_password("mysecretpassword")
    assert hashed != "mysecretpassword"


def test_hash_password_bcrypt_cost_at_least_12():
    """Requirement 1.7: bcrypt cost factor >= 12."""
    import bcrypt as _bcrypt
    hashed = hash_password("testpass")
    # bcrypt hash encodes the cost factor in the string: $2b$12$...
    cost = int(hashed.split("$")[2])
    assert cost >= 12


def test_verify_password_correct():
    hashed = hash_password("correct")
    assert verify_password("correct", hashed) is True


def test_verify_password_wrong():
    hashed = hash_password("correct")
    assert verify_password("wrong", hashed) is False


# ---------------------------------------------------------------------------
# security.py — Fernet encrypt/decrypt
# ---------------------------------------------------------------------------

def test_encrypt_decrypt_roundtrip():
    original = "super-secret-imap-password"
    token = encrypt_value(original)
    assert token != original
    assert decrypt_value(token) == original


def test_encrypted_value_is_not_plaintext():
    plaintext = "my-password"
    token = encrypt_value(plaintext)
    assert plaintext not in token


# ---------------------------------------------------------------------------
# jwt_utils.py — access token (requirement 1.8)
# ---------------------------------------------------------------------------

def test_access_token_expiry_15_minutes():
    """Requirement 1.8: access token expires after 15 minutes."""
    token = create_access_token("user-123")
    payload = decode_token(token)
    exp = payload["exp"]
    iat = payload["iat"]
    delta_minutes = (exp - iat) / 60
    assert abs(delta_minutes - 15) < 1  # within 1 minute tolerance


def test_access_token_type():
    token = create_access_token("user-123")
    payload = decode_token(token)
    assert payload["type"] == "access"
    assert payload["sub"] == "user-123"


# ---------------------------------------------------------------------------
# jwt_utils.py — refresh token (requirement 1.9)
# ---------------------------------------------------------------------------

def test_refresh_token_expiry_7_days():
    """Requirement 1.9: refresh token expires after 7 days."""
    token = create_refresh_token("user-456")
    payload = decode_token(token)
    exp = payload["exp"]
    iat = payload["iat"]
    delta_days = (exp - iat) / 86400
    assert abs(delta_days - 7) < 0.1  # within ~2.4 hours tolerance


def test_refresh_token_type():
    token = create_refresh_token("user-456")
    payload = decode_token(token)
    assert payload["type"] == "refresh"
    assert payload["sub"] == "user-456"


# ---------------------------------------------------------------------------
# config.py — secrets from env (requirement 26.1)
# ---------------------------------------------------------------------------

def test_settings_loaded_from_env():
    """Requirement 26.1: secrets loaded from environment variables."""
    assert settings.DATABASE_URL is not None
    assert settings.JWT_SECRET is not None
    assert settings.EMAIL_ENCRYPTION_KEY is not None


# ---------------------------------------------------------------------------
# main.py — error envelope (requirements 24.1, 24.6)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_404_uses_error_envelope(client: AsyncClient):
    """Requirement 24.1: 404 response uses { error, detail } envelope."""
    response = await client.get("/nonexistent-route")
    assert response.status_code == 404
    body = response.json()
    assert "error" in body
    assert "detail" in body


@pytest.mark.asyncio
async def test_error_envelope_shape_on_http_exception(client: AsyncClient):
    """Requirement 24.1: all error responses use the standard envelope."""
    # Trigger a 404 from FastAPI's own routing
    response = await client.get("/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert set(body.keys()) >= {"error", "detail"}
    assert isinstance(body["error"], str)
    assert isinstance(body["detail"], str)
