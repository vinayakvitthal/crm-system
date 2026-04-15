import logging
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_db
from backend.core.jwt_utils import ALGORITHM, create_access_token, create_refresh_token, decode_token
from backend.core.security import hash_password, verify_password
from backend.users.models import RevokedToken, User
from backend.users.schemas import (
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    RoleUpdate,
    TokenResponse,
    UserResponse,
)
from backend.core.config import settings
from backend.core.deps import require_admin
from jose import jwt

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role="sales_rep",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(User).where(User.email == body.email))
    user: User | None = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(str(user.id), extra={"role": user.role})
    refresh_token = create_refresh_token(str(user.id))

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,  # set True in production behind HTTPS
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return {"access_token": access_token, "token_type": "bearer"}


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if refresh_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    jti = payload.get("jti")
    if jti:
        revoked = await db.get(RevokedToken, jti)
        if revoked is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked")

    user_id: str = payload["sub"]
    result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id)))
    user: User | None = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_access_token = create_access_token(str(user.id), extra={"role": user.role})
    return {"access_token": new_access_token, "token_type": "bearer"}


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: AsyncSession = Depends(get_db),
) -> None:
    if refresh_token is not None:
        try:
            payload = decode_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                existing = await db.get(RevokedToken, jti)
                if existing is None:
                    db.add(RevokedToken(jti=jti))
                    await db.commit()
        except JWTError:
            pass  # token already invalid — still clear the cookie

    response.delete_cookie(key=REFRESH_COOKIE)


# ---------------------------------------------------------------------------
# Password Reset
# ---------------------------------------------------------------------------

RESET_TOKEN_EXPIRE_HOURS = 1


def _create_reset_token(user_id: str, jti: str) -> str:
    now = datetime.now(tz=timezone.utc)
    expire = now + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": now,
        "jti": jti,
        "type": "reset",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


@router.post("/password-reset/request", status_code=status.HTTP_200_OK)
async def password_reset_request(body: PasswordResetRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Generate a reset token and log it (dev). Always returns success to avoid email enumeration."""
    result = await db.execute(select(User).where(User.email == body.email))
    user: User | None = result.scalar_one_or_none()

    if user is not None:
        jti = str(uuid4())
        token = _create_reset_token(str(user.id), jti)
        # Store JTI so we can invalidate after use
        user.reset_token_jti = jti
        await db.commit()
        # In dev/test: log the reset link to console instead of sending email
        logger.info("Password reset link for %s: /auth/password-reset/confirm?token=%s", body.email, token)

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/password-reset/confirm", status_code=status.HTTP_200_OK)
async def password_reset_confirm(body: PasswordResetConfirm, db: AsyncSession = Depends(get_db)) -> dict:
    """Validate reset token, update password, invalidate token."""
    try:
        payload = decode_token(body.token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    if payload.get("type") != "reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token type")

    jti = payload.get("jti")
    user_id: str = payload["sub"]

    result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id)))
    user: User | None = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    # Validate JTI matches stored value (ensures single-use)
    if user.reset_token_jti is None or user.reset_token_jti != jti:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user.hashed_password = hash_password(body.new_password)
    user.reset_token_jti = None  # invalidate token
    await db.commit()

    return {"message": "Password updated successfully."}


# ---------------------------------------------------------------------------
# Users management (admin only) — Requirements 3.1, 3.2, 3.3, 3.4, 3.5
# ---------------------------------------------------------------------------

users_router = APIRouter(prefix="/users", tags=["users"])


@users_router.get("/", response_model=list[UserResponse])
async def list_users(
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    """Return all users with their roles. Admin only."""
    result = await db.execute(select(User))
    return list(result.scalars().all())


@users_router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    body: RoleUpdate,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Update a user's role. Admin only."""
    try:
        user_uuid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    result = await db.execute(select(User).where(User.id == user_uuid))
    user: User | None = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.role = body.role
    await db.commit()
    await db.refresh(user)
    return user
