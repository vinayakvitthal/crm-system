"""Integration tests for auth endpoints (task 2.1 + 2.4)."""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_db
from backend.main import app


# ---------------------------------------------------------------------------
# Helper: override get_db to use the test session
# ---------------------------------------------------------------------------


def override_get_db(session: AsyncSession):
    async def _override():
        yield session

    return _override


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def auth_client(db_session: AsyncSession, client: AsyncClient):
    """Client with get_db overridden to use the transactional test session."""
    app.dependency_overrides[get_db] = override_get_db(db_session)
    yield client
    app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_valid(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/auth/register",
        json={"email": "alice@example.com", "full_name": "Alice Smith", "password": "secret123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "alice@example.com"
    assert data["role"] == "sales_rep"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(auth_client: AsyncClient):
    payload = {"email": "bob@example.com", "full_name": "Bob", "password": "pass"}
    await auth_client.post("/auth/register", json=payload)
    resp = await auth_client.post("/auth/register", json=payload)
    assert resp.status_code == 409
    assert resp.json()["error"] == "conflict"


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_valid(auth_client: AsyncClient):
    await auth_client.post(
        "/auth/register",
        json={"email": "carol@example.com", "full_name": "Carol", "password": "mypassword"},
    )
    resp = await auth_client.post(
        "/auth/login",
        json={"email": "carol@example.com", "password": "mypassword"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert "refresh_token" in resp.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(auth_client: AsyncClient):
    await auth_client.post(
        "/auth/register",
        json={"email": "dave@example.com", "full_name": "Dave", "password": "correct"},
    )
    resp = await auth_client.post(
        "/auth/login",
        json={"email": "dave@example.com", "password": "wrong"},
    )
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"] == "unauthorized"
    assert "detail" in body


@pytest.mark.asyncio
async def test_login_unknown_email(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "whatever"},
    )
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"] == "unauthorized"


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_valid_cookie(auth_client: AsyncClient):
    await auth_client.post(
        "/auth/register",
        json={"email": "eve@example.com", "full_name": "Eve", "password": "pass123"},
    )
    login_resp = await auth_client.post(
        "/auth/login",
        json={"email": "eve@example.com", "password": "pass123"},
    )
    assert login_resp.status_code == 200

    resp = await auth_client.post("/auth/refresh")
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_refresh_no_cookie(auth_client: AsyncClient):
    resp = await auth_client.post("/auth/refresh")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_clears_cookie(auth_client: AsyncClient):
    await auth_client.post(
        "/auth/register",
        json={"email": "frank@example.com", "full_name": "Frank", "password": "pass"},
    )
    await auth_client.post(
        "/auth/login",
        json={"email": "frank@example.com", "password": "pass"},
    )
    resp = await auth_client.post("/auth/logout")
    assert resp.status_code == 204
    # Cookie should be cleared (set to empty or deleted)
    assert resp.cookies.get("refresh_token") is None


# ---------------------------------------------------------------------------
# Password Reset Request
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_password_reset_request_known_email(auth_client: AsyncClient):
    await auth_client.post(
        "/auth/register",
        json={"email": "grace@example.com", "full_name": "Grace", "password": "pass"},
    )
    resp = await auth_client.post(
        "/auth/password-reset/request",
        json={"email": "grace@example.com"},
    )
    assert resp.status_code == 200
    assert "message" in resp.json()


@pytest.mark.asyncio
async def test_password_reset_request_unknown_email(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/auth/password-reset/request",
        json={"email": "unknown@example.com"},
    )
    # Must return 200 regardless — no email enumeration
    assert resp.status_code == 200
    assert "message" in resp.json()


# ---------------------------------------------------------------------------
# Password Reset Confirm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_password_reset_confirm_valid(auth_client: AsyncClient):
    import logging

    # Register user
    await auth_client.post(
        "/auth/register",
        json={"email": "henry@example.com", "full_name": "Henry", "password": "oldpass"},
    )

    # Capture the reset token from the log
    reset_token_holder: list[str] = []

    class TokenCapture(logging.Handler):
        def emit(self, record):
            msg = self.format(record)
            if "password-reset/confirm?token=" in msg:
                token = msg.split("token=")[-1].strip()
                reset_token_holder.append(token)

    handler = TokenCapture()
    logging.getLogger("backend.users.router").addHandler(handler)
    try:
        await auth_client.post(
            "/auth/password-reset/request",
            json={"email": "henry@example.com"},
        )
    finally:
        logging.getLogger("backend.users.router").removeHandler(handler)

    assert reset_token_holder, "No reset token was logged"
    token = reset_token_holder[0]

    resp = await auth_client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "newpass123"},
    )
    assert resp.status_code == 200

    # Verify new password works
    login_resp = await auth_client.post(
        "/auth/login",
        json={"email": "henry@example.com", "password": "newpass123"},
    )
    assert login_resp.status_code == 200


@pytest.mark.asyncio
async def test_password_reset_confirm_invalid_token(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/auth/password-reset/confirm",
        json={"token": "not.a.valid.token", "new_password": "newpass"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == "bad_request"
