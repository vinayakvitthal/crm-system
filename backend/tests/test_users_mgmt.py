"""Integration tests for admin-only user management endpoints (task 3.1)."""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_db
from backend.main import app


def override_get_db(session: AsyncSession):
    async def _override():
        yield session

    return _override


@pytest_asyncio.fixture
async def mgmt_client(db_session: AsyncSession, client: AsyncClient):
    app.dependency_overrides[get_db] = override_get_db(db_session)
    yield client
    app.dependency_overrides.pop(get_db, None)


async def _register_and_login(client: AsyncClient, email: str, password: str = "pass123", full_name: str = "Test User") -> str:
    """Register a user and return their access token."""
    await client.post(
        "/auth/register",
        json={"email": email, "full_name": full_name, "password": password},
    )
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


async def _make_admin(db_session: AsyncSession, email: str) -> None:
    """Directly set a user's role to admin in the DB."""
    from sqlalchemy import select, update
    from backend.users.models import User

    await db_session.execute(
        update(User).where(User.email == email).values(role="admin")
    )
    await db_session.commit()


# ---------------------------------------------------------------------------
# GET /users/ — list all users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_users_as_admin(mgmt_client: AsyncClient, db_session: AsyncSession):
    # Register two users
    await _register_and_login(mgmt_client, "admin@example.com", full_name="Admin User")
    await _register_and_login(mgmt_client, "other@example.com", full_name="Other User")

    # Promote first user to admin
    await _make_admin(db_session, "admin@example.com")

    # Login again to get a fresh token with admin role
    login_resp = await mgmt_client.post(
        "/auth/login", json={"email": "admin@example.com", "password": "pass123"}
    )
    token = login_resp.json()["access_token"]

    resp = await mgmt_client.get("/users/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    users = resp.json()
    assert isinstance(users, list)
    emails = [u["email"] for u in users]
    assert "admin@example.com" in emails
    assert "other@example.com" in emails
    # Each user has required fields
    for u in users:
        assert "id" in u
        assert "email" in u
        assert "role" in u
        assert "is_active" in u


@pytest.mark.asyncio
async def test_list_users_as_non_admin_returns_403(mgmt_client: AsyncClient):
    token = await _register_and_login(mgmt_client, "sales@example.com")
    resp = await mgmt_client.get("/users/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert resp.json()["error"] == "forbidden"


@pytest.mark.asyncio
async def test_list_users_unauthenticated_returns_401(mgmt_client: AsyncClient):
    resp = await mgmt_client.get("/users/")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /users/{id}/role — update role
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_role_as_admin(mgmt_client: AsyncClient, db_session: AsyncSession):
    # Register target user
    reg_resp = await mgmt_client.post(
        "/auth/register",
        json={"email": "target@example.com", "full_name": "Target", "password": "pass123"},
    )
    target_id = reg_resp.json()["id"]

    # Register and promote admin
    await _register_and_login(mgmt_client, "admin2@example.com", full_name="Admin2")
    await _make_admin(db_session, "admin2@example.com")
    login_resp = await mgmt_client.post(
        "/auth/login", json={"email": "admin2@example.com", "password": "pass123"}
    )
    token = login_resp.json()["access_token"]

    resp = await mgmt_client.patch(
        f"/users/{target_id}/role",
        json={"role": "support_agent"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "support_agent"
    assert data["id"] == target_id


@pytest.mark.asyncio
async def test_update_role_invalid_role_returns_422(mgmt_client: AsyncClient, db_session: AsyncSession):
    reg_resp = await mgmt_client.post(
        "/auth/register",
        json={"email": "target2@example.com", "full_name": "Target2", "password": "pass123"},
    )
    target_id = reg_resp.json()["id"]

    await _register_and_login(mgmt_client, "admin3@example.com", full_name="Admin3")
    await _make_admin(db_session, "admin3@example.com")
    login_resp = await mgmt_client.post(
        "/auth/login", json={"email": "admin3@example.com", "password": "pass123"}
    )
    token = login_resp.json()["access_token"]

    resp = await mgmt_client.patch(
        f"/users/{target_id}/role",
        json={"role": "superuser"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_role_user_not_found_returns_404(mgmt_client: AsyncClient, db_session: AsyncSession):
    await _register_and_login(mgmt_client, "admin4@example.com", full_name="Admin4")
    await _make_admin(db_session, "admin4@example.com")
    login_resp = await mgmt_client.post(
        "/auth/login", json={"email": "admin4@example.com", "password": "pass123"}
    )
    token = login_resp.json()["access_token"]

    resp = await mgmt_client.patch(
        "/users/00000000-0000-0000-0000-000000000000/role",
        json={"role": "viewer"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
    assert resp.json()["error"] == "not_found"


@pytest.mark.asyncio
async def test_update_role_as_non_admin_returns_403(mgmt_client: AsyncClient):
    reg_resp = await mgmt_client.post(
        "/auth/register",
        json={"email": "target3@example.com", "full_name": "Target3", "password": "pass123"},
    )
    target_id = reg_resp.json()["id"]

    token = await _register_and_login(mgmt_client, "viewer@example.com", full_name="Viewer")

    resp = await mgmt_client.patch(
        f"/users/{target_id}/role",
        json={"role": "admin"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "forbidden"


@pytest.mark.asyncio
async def test_all_valid_roles_accepted(mgmt_client: AsyncClient, db_session: AsyncSession):
    """All four valid roles can be assigned."""
    reg_resp = await mgmt_client.post(
        "/auth/register",
        json={"email": "roletest@example.com", "full_name": "RoleTest", "password": "pass123"},
    )
    target_id = reg_resp.json()["id"]

    await _register_and_login(mgmt_client, "admin5@example.com", full_name="Admin5")
    await _make_admin(db_session, "admin5@example.com")
    login_resp = await mgmt_client.post(
        "/auth/login", json={"email": "admin5@example.com", "password": "pass123"}
    )
    token = login_resp.json()["access_token"]

    for role in ("admin", "sales_rep", "support_agent", "viewer"):
        resp = await mgmt_client.patch(
            f"/users/{target_id}/role",
            json={"role": role},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, f"Expected 200 for role={role}, got {resp.status_code}"
        assert resp.json()["role"] == role
