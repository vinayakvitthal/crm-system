"""Analytics endpoints — Requirement 23."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.activities.models import Activity
from backend.contacts.models import Contact
from backend.core.deps import get_current_user, get_db
from backend.sales.models import Deal, Pipeline, Stage
from backend.support.models import Ticket

router = APIRouter(prefix="/analytics", tags=["analytics"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_RANGE_DAYS: dict[str, int] = {"7d": 7, "30d": 30, "90d": 90}


def _resolve_date_range(
    range_preset: Optional[str],
    from_date: Optional[date],
    to_date: Optional[date],
) -> tuple[datetime, datetime]:
    """Return (start, end) as timezone-aware datetimes."""
    now = datetime.now(timezone.utc)
    if range_preset and range_preset in _RANGE_DAYS:
        end_dt = now
        start_dt = now - timedelta(days=_RANGE_DAYS[range_preset])
    elif from_date and to_date:
        start_dt = datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc)
        end_dt = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=timezone.utc)
    elif from_date:
        start_dt = datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc)
        end_dt = now
    else:
        # default: last 30 days
        end_dt = now
        start_dt = now - timedelta(days=30)
    return start_dt, end_dt


# ---------------------------------------------------------------------------
# GET /analytics/kpis — Requirement 23.1
# ---------------------------------------------------------------------------


@router.get("/kpis")
async def get_kpis(
    range: Optional[str] = Query(default=None, description="Preset: 7d, 30d, 90d"),
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return aggregated KPI metrics for the specified date range."""
    start_dt, end_dt = _resolve_date_range(range, from_date, to_date)

    # Total contacts created in range
    total_contacts_result = await db.execute(
        select(func.count(Contact.id)).where(
            Contact.created_at >= start_dt,
            Contact.created_at <= end_dt,
        )
    )
    total_contacts: int = total_contacts_result.scalar_one() or 0

    # Open deals created in range
    open_deals_result = await db.execute(
        select(func.count(Deal.id)).where(
            Deal.status == "open",
            Deal.created_at >= start_dt,
            Deal.created_at <= end_dt,
        )
    )
    open_deals: int = open_deals_result.scalar_one() or 0

    # Open tickets created in range
    open_tickets_result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.status.in_(["open", "in_progress"]),
            Ticket.created_at >= start_dt,
            Ticket.created_at <= end_dt,
        )
    )
    open_tickets: int = open_tickets_result.scalar_one() or 0

    # Total activities created in range
    total_activities_result = await db.execute(
        select(func.count(Activity.id)).where(
            Activity.created_at >= start_dt,
            Activity.created_at <= end_dt,
        )
    )
    total_activities: int = total_activities_result.scalar_one() or 0

    return {
        "total_contacts": total_contacts,
        "open_deals": open_deals,
        "open_tickets": open_tickets,
        "total_activities": total_activities,
    }


# ---------------------------------------------------------------------------
# GET /analytics/pipeline-funnel — Requirement 23.2
# ---------------------------------------------------------------------------


@router.get("/pipeline-funnel")
async def get_pipeline_funnel(
    pipeline_id: uuid.UUID = Query(..., description="Pipeline UUID"),
    range: Optional[str] = Query(default=None, description="Preset: 7d, 30d, 90d"),
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return deal counts and values grouped by stage for a pipeline and date range.

    Includes stages with zero deals (Req 23.2).
    """
    start_dt, end_dt = _resolve_date_range(range, from_date, to_date)

    # Fetch all stages for the pipeline ordered by position
    stages_result = await db.execute(
        select(Stage)
        .where(Stage.pipeline_id == pipeline_id)
        .order_by(Stage.position.asc())
    )
    stages = list(stages_result.scalars().all())

    # Aggregate deals per stage in the date range
    deals_result = await db.execute(
        select(Deal.stage_id, func.count(Deal.id), func.sum(Deal.value)).where(
            Deal.pipeline_id == pipeline_id,
            Deal.created_at >= start_dt,
            Deal.created_at <= end_dt,
        ).group_by(Deal.stage_id)
    )
    stage_data: dict[uuid.UUID, tuple[int, float]] = {
        row[0]: (row[1], float(row[2] or 0)) for row in deals_result.all()
    }

    return [
        {
            "stage_id": str(stage.id),
            "stage_name": stage.name,
            "position": stage.position,
            "deal_count": stage_data.get(stage.id, (0, 0.0))[0],
            "total_value": stage_data.get(stage.id, (0, 0.0))[1],
        }
        for stage in stages
    ]


# ---------------------------------------------------------------------------
# GET /analytics/sales-velocity — Requirement 23.3
# ---------------------------------------------------------------------------


@router.get("/sales-velocity")
async def get_sales_velocity(
    pipeline_id: uuid.UUID = Query(..., description="Pipeline UUID"),
    range: Optional[str] = Query(default=None, description="Preset: 7d, 30d, 90d"),
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return average days deals spend in each stage for a pipeline and date range.

    Uses stage_entered_at vs now (or next stage transition) as a proxy.
    For currently-open deals, measures time from stage_entered_at to now.
    """
    start_dt, end_dt = _resolve_date_range(range, from_date, to_date)

    # Fetch all stages for the pipeline ordered by position
    stages_result = await db.execute(
        select(Stage)
        .where(Stage.pipeline_id == pipeline_id)
        .order_by(Stage.position.asc())
    )
    stages = list(stages_result.scalars().all())

    # Fetch deals in the pipeline and date range
    deals_result = await db.execute(
        select(Deal).where(
            Deal.pipeline_id == pipeline_id,
            Deal.created_at >= start_dt,
            Deal.created_at <= end_dt,
        )
    )
    deals = list(deals_result.scalars().all())

    now = datetime.now(timezone.utc)

    # Group time-in-stage per stage_id
    stage_durations: dict[uuid.UUID, list[float]] = {stage.id: [] for stage in stages}
    for deal in deals:
        if deal.stage_id in stage_durations:
            entered = deal.stage_entered_at
            if entered is not None:
                if entered.tzinfo is None:
                    entered = entered.replace(tzinfo=timezone.utc)
                duration_days = (now - entered).total_seconds() / 86400
                stage_durations[deal.stage_id].append(duration_days)

    return [
        {
            "stage_id": str(stage.id),
            "stage_name": stage.name,
            "position": stage.position,
            "avg_days_in_stage": (
                round(sum(stage_durations[stage.id]) / len(stage_durations[stage.id]), 2)
                if stage_durations[stage.id]
                else None
            ),
            "deal_count": len(stage_durations[stage.id]),
        }
        for stage in stages
    ]


# ---------------------------------------------------------------------------
# GET /analytics/ticket-resolution — Requirement 23.4
# ---------------------------------------------------------------------------


@router.get("/ticket-resolution")
async def get_ticket_resolution(
    range: Optional[str] = Query(default=None, description="Preset: 7d, 30d, 90d"),
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return average resolution time (hours) between ticket creation and resolved_at."""
    start_dt, end_dt = _resolve_date_range(range, from_date, to_date)

    # Only resolved tickets with both timestamps
    tickets_result = await db.execute(
        select(Ticket).where(
            Ticket.created_at >= start_dt,
            Ticket.created_at <= end_dt,
            Ticket.resolved_at.is_not(None),
        )
    )
    tickets = list(tickets_result.scalars().all())

    if not tickets:
        return {
            "resolved_ticket_count": 0,
            "avg_resolution_hours": None,
            "avg_resolution_days": None,
        }

    total_seconds = 0.0
    for ticket in tickets:
        created = ticket.created_at
        resolved = ticket.resolved_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if resolved.tzinfo is None:
            resolved = resolved.replace(tzinfo=timezone.utc)
        total_seconds += (resolved - created).total_seconds()

    avg_hours = round(total_seconds / len(tickets) / 3600, 2)
    avg_days = round(avg_hours / 24, 2)

    return {
        "resolved_ticket_count": len(tickets),
        "avg_resolution_hours": avg_hours,
        "avg_resolution_days": avg_days,
    }


# ---------------------------------------------------------------------------
# GET /analytics/activity-breakdown — Requirement 23.5
# ---------------------------------------------------------------------------


@router.get("/activity-breakdown")
async def get_activity_breakdown(
    range: Optional[str] = Query(default=None, description="Preset: 7d, 30d, 90d"),
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return counts of each activity type for the specified date range."""
    start_dt, end_dt = _resolve_date_range(range, from_date, to_date)

    result = await db.execute(
        select(Activity.type, func.count(Activity.id)).where(
            Activity.created_at >= start_dt,
            Activity.created_at <= end_dt,
        ).group_by(Activity.type)
    )
    rows = result.all()

    breakdown = {row[0]: row[1] for row in rows}
    total = sum(breakdown.values())

    return {
        "total": total,
        "breakdown": breakdown,
    }
