import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

TicketStatus = Literal["open", "in_progress", "resolved", "closed"]
TicketPriority = Literal["low", "medium", "high", "urgent"]

ALLOWED_STATUSES = {"open", "in_progress", "resolved", "closed"}


# ---------------------------------------------------------------------------
# Ticket schemas
# ---------------------------------------------------------------------------


class TicketCreate(BaseModel):
    subject: str
    description: str
    priority: TicketPriority = "medium"
    contact_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None


class TicketUpdate(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TicketPriority] = None
    contact_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None


class TicketOut(BaseModel):
    id: uuid.UUID
    subject: str
    description: str
    status: str
    priority: str
    contact_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    created_by: uuid.UUID
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TicketStatusUpdate(BaseModel):
    status: TicketStatus


class TicketAssignUpdate(BaseModel):
    assigned_to: uuid.UUID


# ---------------------------------------------------------------------------
# TicketComment schemas
# ---------------------------------------------------------------------------


class TicketCommentCreate(BaseModel):
    body: str


class TicketCommentOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    author_id: uuid.UUID
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}
