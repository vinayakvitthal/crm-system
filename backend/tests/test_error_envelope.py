"""
Property-based test: all API error responses use the standard envelope.

Property 26: For any request that results in an error (4xx or 5xx), the response
body SHALL conform to the JSON schema { "error": string, "detail": string } with
no additional required fields.

**Validates: Requirement 24.1**
"""
import uuid

import pytest
import pytest_asyncio
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_db
from backend.main import app


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def override_get_db(session: AsyncSession):
    async def _override():
        yield session

    return _override


@pytest_asyncio.fixture
async def envelope_client(db_session: AsyncSession, client: AsyncClient):
    """Client with get_db overridden to use the transactional test session."""
    app.dependency_overrides[get_db] = override_get_db(db_session)
    yield client
    app.dependency_overrides.pop(get_db, None)


def assert_error_envelope(body: dict) -> None:
    """Assert the response body conforms to { "error": str, "detail": str }."""
    assert isinstance(body, dict), f"Expected dict, got {type(body)}: {body}"
    assert "error" in body, f"Missing 'error' key in: {body}"
    assert "detail" in body, f"Missing 'detail' key in: {body}"
    assert isinstance(body["error"], str), f"'error' must be str, got {type(body['error'])}"
    assert isinstance(body["detail"], str), f"'detail' must be str, got {type(body['detail'])}"


async def _register_and_login(client: AsyncClient, email: str, password: str = "pass123") -> str:
    """Register a user and return their access token."""
    await client.post(
        "/auth/register",
        json={"email": email, "full_name": "Test User", "password": password},
    )
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Property 26 — 401: unauthenticated requests
# ---------------------------------------------------------------------------

# Endpoints that require authentication
_AUTHENTICATED_ENDPOINTS = [
    "/contacts/",
    "/companies/",
    "/leads/",
    "/deals/",
    "/tickets/",
    "/activities/",
    "/users/",
    "/email/inbox",
    "/analytics/kpis",
]


@pytest.mark.asyncio
@settings(max_examples=10, suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
@given(path=st.sampled_from(_AUTHENTICATED_ENDPOINTS))
async def test_unauthenticated_request_uses_error_envelope(
    path: str,
    envelope_client: AsyncClient,
) -> None:
    """Property 26: unauthenticated GET requests return 401 with the standard envelope."""
    response = await envelope_client.get(path)
    assert response.status_code == 401, (
        f"Expected 401 for unauthenticated GET {path}, got {response.status_code}"
    )
    assert_error_envelope(response.json())


# ---------------------------------------------------------------------------
# Property 26 — 403: insufficient role (non-admin on admin-only routes)
# ---------------------------------------------------------------------------

# Admin-only routes that a sales_rep (default role) cannot access
_ADMIN_ONLY_ROUTES = [
    ("GET", "/users/", None),
]


@pytest.mark.asyncio
@settings(max_examples=5, suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
@given(route=st.sampled_from(_ADMIN_ONLY_ROUTES))
async def test_forbidden_request_uses_error_envelope(
    route: tuple,
    envelope_client: AsyncClient,
) -> None:
    """Property 26: 403 responses from role enforcement use the standard envelope."""
    method, path, body = route
    unique = uuid.uuid4().hex[:8]
    token = await _register_and_login(envelope_client, f"sales_{unique}@example.com")

    if method == "GET":
        resp = await envelope_client.get(path, headers={"Authorization": f"Bearer {token}"})
    elif method == "POST":
        resp = await envelope_client.post(path, json=body, headers={"Authorization": f"Bearer {token}"})
    elif method == "PATCH":
        resp = await envelope_client.patch(path, json=body, headers={"Authorization": f"Bearer {token}"})
    else:
        raise ValueError(f"Unsupported method: {method}")

    assert resp.status_code == 403, (
        f"Expected 403 for {method} {path} as sales_rep, got {resp.status_code}"
    )
    assert_error_envelope(resp.json())


# ---------------------------------------------------------------------------
# Property 26 — 404: nonexistent resources
# ---------------------------------------------------------------------------

_NONEXISTENT_UUIDS = [
    "/contacts/00000000-0000-0000-0000-000000000001",
    "/companies/00000000-0000-0000-0000-000000000002",
    "/leads/00000000-0000-0000-0000-000000000003",
    "/deals/00000000-0000-0000-0000-000000000004",
    "/tickets/00000000-0000-0000-0000-000000000005",
    "/activities/00000000-0000-0000-0000-000000000006",
]


@pytest.mark.asyncio
@settings(max_examples=10, suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
@given(path=st.sampled_from(_NONEXISTENT_UUIDS))
async def test_not_found_uses_error_envelope(
    path: str,
    envelope_client: AsyncClient,
) -> None:
    """Property 26: 404 responses for nonexistent resources use the standard envelope."""
    unique = uuid.uuid4().hex[:8]
    token = await _register_and_login(envelope_client, f"user404_{unique}@example.com")

    resp = await envelope_client.get(path, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404, (
        f"Expected 404 for GET {path}, got {resp.status_code}: {resp.json()}"
    )
    assert_error_envelope(resp.json())


# ---------------------------------------------------------------------------
# Property 26 — 422: validation errors on bad request bodies
# ---------------------------------------------------------------------------

# (endpoint, bad_payload) pairs that should trigger 422
_INVALID_PAYLOADS = [
    ("/auth/register", {}),                                    # missing required fields
    ("/auth/register", {"email": "not-an-email", "full_name": "X", "password": "p"}),
    ("/auth/login", {}),                                       # missing email/password
    ("/auth/login", {"email": "bad", "password": "x"}),       # invalid email format
]


@pytest.mark.asyncio
@settings(max_examples=10, suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
@given(case=st.sampled_from(_INVALID_PAYLOADS))
async def test_validation_error_uses_error_envelope(
    case: tuple,
    envelope_client: AsyncClient,
) -> None:
    """Property 26: 422 validation errors use the standard envelope."""
    path, payload = case
    resp = await envelope_client.post(path, json=payload)
    assert resp.status_code == 422, (
        f"Expected 422 for POST {path} with {payload}, got {resp.status_code}: {resp.json()}"
    )
    assert_error_envelope(resp.json())


# ---------------------------------------------------------------------------
# Property 26 — routing 404: unknown routes
# ---------------------------------------------------------------------------

_UNKNOWN_ROUTES = [
    "/nonexistent-route",
    "/api/v99/something",
    "/contacts/not-a-uuid/subresource",
]


@pytest.mark.asyncio
@settings(max_examples=5, suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
@given(path=st.sampled_from(_UNKNOWN_ROUTES))
async def test_unknown_route_uses_error_envelope(
    path: str,
    envelope_client: AsyncClient,
) -> None:
    """Property 26: requests to unknown routes return 4xx with the standard envelope."""
    resp = await envelope_client.get(path)
    assert resp.status_code >= 400, (
        f"Expected 4xx for GET {path}, got {resp.status_code}"
    )
    assert_error_envelope(resp.json())
