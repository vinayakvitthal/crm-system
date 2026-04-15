"""Integration tests for Support Ticket endpoints (tasks 10.1, 10.4, 10.5)."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_db
from backend.core.security import hash_password
from backend.main import app
from backend.users.models import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def override_get_db(session: AsyncSession):
    async def _override():
        yield session

    return _override


async def _make_user(db: AsyncSession, email: str, role: str) -> User:
    user = User(
        email=email,
        full_name=f"{role} user",
        hashed_password=hash_password("pass123"),
        role=role,
    )
    db.add(user)
    await db.commit()
    return user


async def _login(client: AsyncClient, email: str) -> str:
    resp = await client.post("/auth/login", json={"email": email, "password": "pass123"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def support_client(db_session: AsyncSession, client: AsyncClient):
    app.dependency_overrides[get_db] = override_get_db(db_session)
    yield client
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def admin_token(support_client: AsyncClient, db_session: AsyncSession) -> str:
    await _make_user(db_session, "admin_sup@test.com", "admin")
    return await _login(support_client, "admin_sup@test.com")


@pytest_asyncio.fixture
async def agent_token(support_client: AsyncClient, db_session: AsyncSession) -> str:
    await _make_user(db_session, "agent@test.com", "support_agent")
    return await _login(support_client, "agent@test.com")


@pytest_asyncio.fixture
async def viewer_token(support_client: AsyncClient, db_session: AsyncSession) -> str:
    await _make_user(db_session, "viewer_sup@test.com", "viewer")
    return await _login(support_client, "viewer_sup@test.com")


@pytest_asyncio.fixture
async def sales_rep_token(support_client: AsyncClient, db_session: AsyncSession) -> str:
    await _make_user(db_session, "rep_sup@test.com", "sales_rep")
    return await _login(support_client, "rep_sup@test.com")


@pytest_asyncio.fixture
async def ticket(support_client: AsyncClient, agent_token: str) -> dict:
    resp = await support_client.post(
        "/tickets/",
        json={"subject": "Test ticket", "description": "Something broke", "priority": "high"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Task 10.1 — CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_ticket_as_agent(support_client: AsyncClient, agent_token: str):
    resp = await support_client.post(
        "/tickets/",
        json={"subject": "Bug report", "description": "App crashes", "priority": "urgent"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["subject"] == "Bug report"
    # Req 14.3: status always "open" on creation
    assert data["status"] == "open"


@pytest.mark.asyncio
async def test_create_ticket_forces_open_status(support_client: AsyncClient, agent_token: str):
    """Even if client sends a different status, it must be forced to 'open'."""
    resp = await support_client.post(
        "/tickets/",
        json={"subject": "S", "description": "D", "priority": "low"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "open"


@pytest.mark.asyncio
async def test_create_ticket_viewer_forbidden(support_client: AsyncClient, viewer_token: str):
    resp = await support_client.post(
        "/tickets/",
        json={"subject": "S", "description": "D", "priority": "low"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_ticket_sales_rep_forbidden(support_client: AsyncClient, sales_rep_token: str):
    resp = await support_client.post(
        "/tickets/",
        json={"subject": "S", "description": "D", "priority": "low"},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_tickets_all_roles(support_client: AsyncClient, ticket: dict, viewer_token: str):
    resp = await support_client.get(
        "/tickets/",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 200
    assert any(t["id"] == ticket["id"] for t in resp.json())


@pytest.mark.asyncio
async def test_get_ticket(support_client: AsyncClient, ticket: dict, viewer_token: str):
    resp = await support_client.get(
        f"/tickets/{ticket['id']}",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == ticket["id"]


@pytest.mark.asyncio
async def test_get_ticket_not_found(support_client: AsyncClient, viewer_token: str):
    resp = await support_client.get(
        f"/tickets/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_ticket_as_agent(support_client: AsyncClient, ticket: dict, agent_token: str):
    resp = await support_client.patch(
        f"/tickets/{ticket['id']}",
        json={"subject": "Updated subject"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["subject"] == "Updated subject"


@pytest.mark.asyncio
async def test_update_ticket_viewer_forbidden(support_client: AsyncClient, ticket: dict, viewer_token: str):
    resp = await support_client.patch(
        f"/tickets/{ticket['id']}",
        json={"subject": "X"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_ticket_admin_only(support_client: AsyncClient, ticket: dict, admin_token: str, agent_token: str):
    # agent cannot delete
    resp = await support_client.delete(
        f"/tickets/{ticket['id']}",
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 403

    # admin can delete
    resp = await support_client.delete(
        f"/tickets/{ticket['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Task 10.4 — Status update and assignment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_update_valid(support_client: AsyncClient, ticket: dict, agent_token: str):
    resp = await support_client.patch(
        f"/tickets/{ticket['id']}/status",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_status_update_sets_resolved_at(support_client: AsyncClient, ticket: dict, agent_token: str):
    resp = await support_client.patch(
        f"/tickets/{ticket['id']}/status",
        json={"status": "resolved"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "resolved"
    assert data["resolved_at"] is not None


@pytest.mark.asyncio
async def test_status_update_invalid_value(support_client: AsyncClient, ticket: dict, agent_token: str):
    resp = await support_client.patch(
        f"/tickets/{ticket['id']}/status",
        json={"status": "invalid_status"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_status_update_not_found(support_client: AsyncClient, agent_token: str):
    resp = await support_client.patch(
        f"/tickets/{uuid.uuid4()}/status",
        json={"status": "resolved"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_assign_ticket(support_client: AsyncClient, ticket: dict, agent_token: str, db_session: AsyncSession):
    # Create a user to assign to
    target = await _make_user(db_session, "assignee@test.com", "support_agent")
    resp = await support_client.patch(
        f"/tickets/{ticket['id']}/assign",
        json={"assigned_to": str(target.id)},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["assigned_to"] == str(target.id)


@pytest.mark.asyncio
async def test_assign_ticket_user_not_found(support_client: AsyncClient, ticket: dict, agent_token: str):
    resp = await support_client.patch(
        f"/tickets/{ticket['id']}/assign",
        json={"assigned_to": str(uuid.uuid4())},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Task 10.5 — Comments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_comment(support_client: AsyncClient, ticket: dict, agent_token: str):
    resp = await support_client.post(
        f"/tickets/{ticket['id']}/comments",
        json={"body": "Looking into this now."},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["body"] == "Looking into this now."
    assert data["ticket_id"] == ticket["id"]


@pytest.mark.asyncio
async def test_create_comment_viewer_forbidden(support_client: AsyncClient, ticket: dict, viewer_token: str):
    resp = await support_client.post(
        f"/tickets/{ticket['id']}/comments",
        json={"body": "Can I comment?"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_comments_sorted(support_client: AsyncClient, ticket: dict, agent_token: str):
    # Create two comments
    await support_client.post(
        f"/tickets/{ticket['id']}/comments",
        json={"body": "First comment"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    await support_client.post(
        f"/tickets/{ticket['id']}/comments",
        json={"body": "Second comment"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    resp = await support_client.get(
        f"/tickets/{ticket['id']}/comments",
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 200
    comments = resp.json()
    assert len(comments) >= 2
    # Req 17.2: sorted by created_at ascending
    timestamps = [c["created_at"] for c in comments]
    assert timestamps == sorted(timestamps)


@pytest.mark.asyncio
async def test_list_comments_ticket_not_found(support_client: AsyncClient, agent_token: str):
    resp = await support_client.get(
        f"/tickets/{uuid.uuid4()}/comments",
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_comment_ticket_not_found(support_client: AsyncClient, agent_token: str):
    resp = await support_client.post(
        f"/tickets/{uuid.uuid4()}/comments",
        json={"body": "Ghost comment"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 404
