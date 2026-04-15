import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, model_validator

ActivityType = Literal["call", "meeting", "note", "task", "email_logged"]


class ActivityCreate(BaseModel):
    type: ActivityType
    subject: str
    body: Optional[str] = None
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    ticket_id: Optional[uuid.UUID] = None

    @model_validator(mode="after")
    def require_at_least_one_entity_link(self) -> "ActivityCreate":
        if self.contact_id is None and self.deal_id is None and self.ticket_id is None:
            raise ValueError("At least one entity link (contact_id, deal_id, or ticket_id) is required")
        return self


class ActivityUpdate(BaseModel):
    type: Optional[ActivityType] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    ticket_id: Optional[uuid.UUID] = None


class ActivityResponse(BaseModel):
    id: uuid.UUID
    type: str
    subject: str
    body: Optional[str] = None
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    owner_id: uuid.UUID
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    ticket_id: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}
