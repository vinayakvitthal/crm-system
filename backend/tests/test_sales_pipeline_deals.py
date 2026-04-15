"""Integration tests for Pipeline, Stage, and Deal endpoints (task 8)."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_db
from backend.main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def override_get_db(session: AsyncSession):
    async def _override():
        yield session

    return _override


async def _register_and_login(client: AsyncClient, email: str, role: str = "sales_rep") -> str:
    """Register a user, optionally promote to role, and return access token."""
    reg = await client.post(
        "/auth/register",
        json={"email": email, "full_name": "Test User", "password": "pass123"},
    )
    assert reg.status_code == 201
    user_id = reg.json()["id"]

    # Login as admin to set role if needed
    if role != "sales_rep":
        # Register admin first (first registered user becomes sales_rep by default,
        # so we need to patch role via admin endpoint)
        admin_email = f"admin_{uuid.uuid4().hex[:6]}@example.com"
        await client.post(
            "/auth/register",
            json={"email": admin_email, "full_name": "Admin", "password": "adminpass"},
        )
        # Promote admin user via direct DB manipulation isn't possible here,
        # so we use a workaround: register the target user and patch role
        # For simplicity, we'll use the admin fixture approach below

    login = await client.post("/auth/login", json={"email": email, "password": "pass123"})
    assert login.status_code == 200
    return login.json()["access_token"]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def sales_client(db_session: AsyncSession, client: AsyncClient):
    app.dependency_overrides[get_db] = override_get_db(db_session)
    yield client
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def admin_token(sales_client: AsyncClient, db_session: AsyncSession) -> str:
    """Create an admin user and return their access token."""
    from backend.users.models import User
    from backend.core.security import hash_password

    admin = User(
        email="admin@test.com",
        full_name="Admin User",
        hashed_password=hash_password("adminpass"),
        role="admin",
    )
    db_session.add(admin)
    await db_session.commit()

    login = await sales_client.post("/auth/login", json={"email": "admin@test.com", "password": "adminpass"})
    assert login.status_code == 200
    return login.json()["access_token"]


@pytest_asyncio.fixture
async def sales_rep_token(sales_client: AsyncClient, db_session: AsyncSession) -> str:
    """Create a sales_rep user and return their access token."""
    from backend.users.models import User
    from backend.core.security import hash_password

    rep = User(
        email="rep@test.com",
        full_name="Sales Rep",
        hashed_password=hash_password("reppass"),
        role="sales_rep",
    )
    db_session.add(rep)
    await db_session.commit()

    login = await sales_client.post("/auth/login", json={"email": "rep@test.com", "password": "reppass"})
    assert login.status_code == 200
    return login.json()["access_token"]


@pytest_asyncio.fixture
async def viewer_token(sales_client: AsyncClient, db_session: AsyncSession) -> str:
    """Create a viewer user and return their access token."""
    from backend.users.models import User
    from backend.core.security import hash_password

    viewer = User(
        email="viewer@test.com",
        full_name="Viewer",
        hashed_password=hash_password("viewerpass"),
        role="viewer",
    )
    db_session.add(viewer)
    await db_session.commit()

    login = await sales_client.post("/auth/login", json={"email": "viewer@test.com", "password": "viewerpass"})
    assert login.status_code == 200
    return login.json()["access_token"]


@pytest_asyncio.fixture
async def pipeline(sales_client: AsyncClient, admin_token: str) -> dict:
    """Create a pipeline and return its data."""
    resp = await sales_client.post(
        "/pipelines/",
        json={"name": "Test Pipeline", "is_default": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def stage(sales_client: AsyncClient, admin_token: str, pipeline: dict) -> dict:
    """Create a stage in the test pipeline."""
    resp = await sales_client.post(
        f"/pipelines/{pipeline['id']}/stages",
        json={"name": "Prospecting", "position": 1},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def deal(sales_client: AsyncClient, sales_rep_token: str, pipeline: dict, stage: dict, db_session: AsyncSession) -> dict:
    """Create a deal and return its data."""
    from backend.users.models import User
    result = await db_session.execute(__import__("sqlalchemy").select(User).where(User.email == "rep@test.com"))
    rep = result.scalar_one()

    resp = await sales_client.post(
        "/deals/",
        json={
            "title": "Test Deal",
            "value": "1000.00",
            "currency": "USD",
            "pipeline_id": pipeline["id"],
            "stage_id": stage["id"],
            "owner_id": str(rep.id),
        },
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Pipeline CRUD tests (Req 10.1, 10.4, 10.5)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_pipeline_admin(sales_client: AsyncClient, admin_token: str):
    resp = await sales_client.post(
        "/pipelines/",
        json={"name": "Sales Pipeline", "is_default": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Sales Pipeline"
    assert data["is_default"] is False
    assert "id" in data


@pytest.mark.asyncio
async def test_create_pipeline_non_admin_forbidden(sales_client: AsyncClient, sales_rep_token: str):
    resp = await sales_client.post(
        "/pipelines/",
        json={"name": "Unauthorized Pipeline"},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_single_default_pipeline_invariant(sales_client: AsyncClient, admin_token: str):
    """Only one pipeline can be default at a time (Req 10.4)."""
    r1 = await sales_client.post(
        "/pipelines/",
        json={"name": "Pipeline A", "is_default": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r1.status_code == 201
    assert r1.json()["is_default"] is True

    r2 = await sales_client.post(
        "/pipelines/",
        json={"name": "Pipeline B", "is_default": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 201
    assert r2.json()["is_default"] is True

    # Fetch Pipeline A — should no longer be default
    r1_get = await sales_client.get(
        f"/pipelines/{r1.json()['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r1_get.json()["is_default"] is False


@pytest.mark.asyncio
async def test_get_pipeline_not_found(sales_client: AsyncClient, admin_token: str):
    resp = await sales_client.get(
        f"/pipelines/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404
    assert resp.json()["error"] == "not_found"


@pytest.mark.asyncio
async def test_delete_pipeline_non_admin_forbidden(sales_client: AsyncClient, sales_rep_token: str, pipeline: dict):
    resp = await sales_client.delete(
        f"/pipelines/{pipeline['id']}",
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Stage CRUD tests (Req 10.2, 10.3, 10.5)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_stage_admin(sales_client: AsyncClient, admin_token: str, pipeline: dict):
    resp = await sales_client.post(
        f"/pipelines/{pipeline['id']}/stages",
        json={"name": "Qualification", "position": 2},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Qualification"
    assert data["position"] == 2
    assert data["pipeline_id"] == pipeline["id"]


@pytest.mark.asyncio
async def test_create_stage_non_admin_forbidden(sales_client: AsyncClient, sales_rep_token: str, pipeline: dict):
    resp = await sales_client.post(
        f"/pipelines/{pipeline['id']}/stages",
        json={"name": "Stage", "position": 1},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_stages_ordered_by_position(sales_client: AsyncClient, admin_token: str, pipeline: dict):
    """Stages must be returned ordered by position ascending (Req 10.2)."""
    for pos, name in [(3, "Close"), (1, "Prospect"), (2, "Qualify")]:
        await sales_client.post(
            f"/pipelines/{pipeline['id']}/stages",
            json={"name": name, "position": pos},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    resp = await sales_client.get(
        f"/pipelines/{pipeline['id']}/stages",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    positions = [s["position"] for s in resp.json()]
    assert positions == sorted(positions)


@pytest.mark.asyncio
async def test_update_stage_position(sales_client: AsyncClient, admin_token: str, stage: dict):
    """Updating stage position is reflected on read (Req 10.3)."""
    resp = await sales_client.patch(
        f"/stages/{stage['id']}",
        json={"position": 99},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["position"] == 99


@pytest.mark.asyncio
async def test_update_stage_non_admin_forbidden(sales_client: AsyncClient, sales_rep_token: str, stage: dict):
    resp = await sales_client.patch(
        f"/stages/{stage['id']}",
        json={"position": 5},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Deal CRUD tests (Req 11.1 – 11.4)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_deal_status_always_open(sales_client: AsyncClient, sales_rep_token: str, pipeline: dict, stage: dict, db_session: AsyncSession):
    """New deals always have status open regardless of payload (Req 11.1)."""
    from backend.users.models import User
    from sqlalchemy import select as sa_select
    result = await db_session.execute(sa_select(User).where(User.email == "rep@test.com"))
    rep = result.scalar_one()

    resp = await sales_client.post(
        "/deals/",
        json={
            "title": "Big Deal",
            "value": "5000.00",
            "currency": "EUR",
            "pipeline_id": pipeline["id"],
            "stage_id": stage["id"],
            "owner_id": str(rep.id),
            "status": "won",  # should be ignored
        },
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "open"


@pytest.mark.asyncio
async def test_create_deal_viewer_forbidden(sales_client: AsyncClient, viewer_token: str, pipeline: dict, stage: dict, db_session: AsyncSession):
    """Viewer cannot create deals (Req 11.3)."""
    from backend.users.models import User
    from sqlalchemy import select as sa_select
    result = await db_session.execute(sa_select(User).where(User.email == "viewer@test.com"))
    viewer = result.scalar_one()

    resp = await sales_client.post(
        "/deals/",
        json={
            "title": "Viewer Deal",
            "value": "100.00",
            "currency": "USD",
            "pipeline_id": pipeline["id"],
            "stage_id": stage["id"],
            "owner_id": str(viewer.id),
        },
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_deal_not_found(sales_client: AsyncClient, sales_rep_token: str):
    resp = await sales_client.get(
        f"/deals/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 404
    assert resp.json()["error"] == "not_found"


@pytest.mark.asyncio
async def test_update_deal(sales_client: AsyncClient, sales_rep_token: str, deal: dict):
    resp = await sales_client.patch(
        f"/deals/{deal['id']}",
        json={"title": "Updated Deal Title"},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Deal Title"


@pytest.mark.asyncio
async def test_delete_deal_viewer_forbidden(sales_client: AsyncClient, viewer_token: str, deal: dict):
    resp = await sales_client.delete(
        f"/deals/{deal['id']}",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Deal stage transition tests (Req 12.1, 12.2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_move_deal_stage_updates_stage_and_history(
    sales_client: AsyncClient, sales_rep_token: str, admin_token: str, deal: dict, pipeline: dict, db_session: AsyncSession
):
    """Stage move updates stage_id, stage_entered_at, and inserts DealHistory (Req 12.1, 12.2)."""
    # Create a second stage to move to
    new_stage_resp = await sales_client.post(
        f"/pipelines/{pipeline['id']}/stages",
        json={"name": "Negotiation", "position": 2},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert new_stage_resp.status_code == 201
    new_stage_id = new_stage_resp.json()["id"]

    old_stage_id = deal["stage_id"]
    old_entered_at = deal["stage_entered_at"]

    resp = await sales_client.patch(
        f"/deals/{deal['id']}/stage",
        json={"stage_id": new_stage_id},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["stage_id"] == new_stage_id
    assert updated["stage_entered_at"] != old_entered_at

    # Verify DealHistory was inserted
    from backend.sales.models import DealHistory
    from sqlalchemy import select as sa_select
    result = await db_session.execute(
        sa_select(DealHistory).where(DealHistory.deal_id == uuid.UUID(deal["id"]))
    )
    history_rows = result.scalars().all()
    assert len(history_rows) >= 1
    last = history_rows[-1]
    assert last.field == "stage_id"
    assert last.old_value == old_stage_id
    assert last.new_value == new_stage_id


@pytest.mark.asyncio
async def test_move_deal_stage_viewer_forbidden(sales_client: AsyncClient, viewer_token: str, deal: dict, stage: dict):
    resp = await sales_client.patch(
        f"/deals/{deal['id']}/stage",
        json={"stage_id": stage["id"]},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Deal won / lost tests (Req 13.1, 13.2, 13.3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_deal_won(sales_client: AsyncClient, sales_rep_token: str, deal: dict):
    resp = await sales_client.post(
        f"/deals/{deal['id']}/won",
        json={"won_lost_reason": "Great fit"},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "won"
    assert data["won_lost_reason"] == "Great fit"


@pytest.mark.asyncio
async def test_mark_deal_lost(sales_client: AsyncClient, sales_rep_token: str, deal: dict):
    resp = await sales_client.post(
        f"/deals/{deal['id']}/lost",
        json={"won_lost_reason": "Budget cut"},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "lost"
    assert data["won_lost_reason"] == "Budget cut"


@pytest.mark.asyncio
async def test_mark_already_closed_deal_returns_400(sales_client: AsyncClient, sales_rep_token: str, deal: dict):
    """Closing an already-closed deal returns 400 (Req 13.3)."""
    # Close it first
    await sales_client.post(
        f"/deals/{deal['id']}/won",
        json={},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    # Try to close again
    resp = await sales_client.post(
        f"/deals/{deal['id']}/lost",
        json={},
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "bad_request"


@pytest.mark.asyncio
async def test_mark_deal_won_viewer_forbidden(sales_client: AsyncClient, viewer_token: str, deal: dict):
    resp = await sales_client.post(
        f"/deals/{deal['id']}/won",
        json={},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403
