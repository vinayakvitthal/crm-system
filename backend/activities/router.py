import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.activities.models import Activity
from backend.activities.schemas import ActivityCreate, ActivityResponse, ActivityUpdate
from backend.core.deps import get_current_user, get_db

router = APIRouter(prefix="/activities", tags=["activities"])

WRITE_ROLES = {"admin", "sales_rep", "support_agent"}


def _require_write(current_user: dict) -> None:
    if current_user.get("role") not in WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write access required",
        )


def _require_owner_or_admin(activity: Activity, current_user: dict) -> None:
    user_id = uuid.UUID(current_user["sub"])
    if current_user.get("role") != "admin" and activity.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner or admin can delete this activity",
        )


# ---------------------------------------------------------------------------
# Activities CRUD
# ---------------------------------------------------------------------------


@router.get("/feed", response_model=list[ActivityResponse])
async def activity_feed(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Activity]:
    """Return all activities sorted by created_at descending (Req 19.4)."""
    result = await db.execute(
        select(Activity).order_by(Activity.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/", response_model=list[ActivityResponse])
async def list_activities(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Activity]:
    result = await db.execute(select(Activity))
    return list(result.scalars().all())


@router.post("/", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    body: ActivityCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Activity:
    """Create an activity; requires at least one entity link (Req 19.1, 19.6)."""
    data = body.model_dump()
    data["owner_id"] = uuid.UUID(current_user["sub"])
    activity = Activity(**data)
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Activity:
    """Return an activity by ID (Req 19.2)."""
    activity = await db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Activity {activity_id} not found")
    return activity


@router.patch("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: uuid.UUID,
    body: ActivityUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Activity:
    """Update an activity (Req 19.3)."""
    _require_write(current_user)
    activity = await db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Activity {activity_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(activity, field, value)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    activity = await db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Activity {activity_id} not found")
    _require_owner_or_admin(activity, current_user)
    await db.delete(activity)
    await db.commit()
