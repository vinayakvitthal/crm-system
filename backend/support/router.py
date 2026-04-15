import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, get_db
from backend.support.models import Ticket, TicketComment
from backend.support.schemas import (
    TicketAssignUpdate,
    TicketCommentCreate,
    TicketCommentOut,
    TicketCreate,
    TicketOut,
    TicketStatusUpdate,
    TicketUpdate,
)
from backend.users.models import User

router = APIRouter(tags=["support"])

WRITE_ROLES = {"admin", "support_agent"}


def _require_write(current_user: dict) -> None:
    """Raise 403 if the user is not admin or support_agent (Req 14.4)."""
    if current_user.get("role") not in WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only support_agent or admin can perform write operations",
        )


def _require_admin(current_user: dict) -> None:
    """Raise 403 if the user is not admin."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin can delete tickets",
        )


# ---------------------------------------------------------------------------
# Tickets CRUD
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[TicketOut])
async def list_tickets(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Ticket]:
    result = await db.execute(select(Ticket))
    return list(result.scalars().all())


@router.post("/", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    body: TicketCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    _require_write(current_user)
    data = body.model_dump()
    # Req 14.3: always force status to "open"
    data["status"] = "open"
    data["created_by"] = uuid.UUID(current_user["sub"])
    ticket = Ticket(**data)
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    ticket_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket {ticket_id} not found")
    return ticket


@router.patch("/{ticket_id}", response_model=TicketOut)
async def update_ticket(
    ticket_id: uuid.UUID,
    body: TicketUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    _require_write(current_user)
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket {ticket_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ticket, field, value)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(
    ticket_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_admin(current_user)
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket {ticket_id} not found")
    await db.delete(ticket)
    await db.commit()


# ---------------------------------------------------------------------------
# Status update (Req 15.1, 15.2, 15.3)
# ---------------------------------------------------------------------------

ALLOWED_STATUSES = {"open", "in_progress", "resolved", "closed"}


@router.patch("/{ticket_id}/status", response_model=TicketOut)
async def update_ticket_status(
    ticket_id: uuid.UUID,
    body: TicketStatusUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    _require_write(current_user)
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket {ticket_id} not found")
    # Req 15.1: validate against allowed values (Pydantic Literal handles this — 422 on invalid)
    ticket.status = body.status
    # Req 15.2: set resolved_at when status becomes "resolved"
    if body.status == "resolved" and ticket.resolved_at is None:
        ticket.resolved_at = datetime.now(timezone.utc)
    elif body.status != "resolved":
        ticket.resolved_at = None
    await db.commit()
    await db.refresh(ticket)
    return ticket


# ---------------------------------------------------------------------------
# Assignment (Req 16.1, 16.2)
# ---------------------------------------------------------------------------


@router.patch("/{ticket_id}/assign", response_model=TicketOut)
async def assign_ticket(
    ticket_id: uuid.UUID,
    body: TicketAssignUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    _require_write(current_user)
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket {ticket_id} not found")
    # Req 16.2: return 404 if user ID not found
    user = await db.get(User, body.assigned_to)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {body.assigned_to} not found")
    ticket.assigned_to = body.assigned_to
    await db.commit()
    await db.refresh(ticket)
    return ticket


# ---------------------------------------------------------------------------
# Comments (Req 17.1, 17.2, 17.3)
# ---------------------------------------------------------------------------


@router.get("/{ticket_id}/comments", response_model=list[TicketCommentOut])
async def list_comments(
    ticket_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TicketComment]:
    # Req 17.3: return 404 if ticket not found
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket {ticket_id} not found")
    result = await db.execute(
        select(TicketComment)
        .where(TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at.asc())
    )
    return list(result.scalars().all())


@router.post("/{ticket_id}/comments", response_model=TicketCommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
    ticket_id: uuid.UUID,
    body: TicketCommentCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketComment:
    _require_write(current_user)
    # Req 17.3: return 404 if ticket not found
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket {ticket_id} not found")
    comment = TicketComment(
        ticket_id=ticket_id,
        author_id=uuid.UUID(current_user["sub"]),
        body=body.body,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment
