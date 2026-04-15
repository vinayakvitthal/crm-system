import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr


# ---------------------------------------------------------------------------
# Company schemas
# ---------------------------------------------------------------------------


class CompanyCreate(BaseModel):
    name: str
    website: Optional[str] = None
    industry: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None


class CompanyOut(BaseModel):
    id: uuid.UUID
    name: str
    website: Optional[str] = None
    industry: Optional[str] = None
    owner_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Contact schemas
# ---------------------------------------------------------------------------


class ContactCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    company_id: Optional[uuid.UUID] = None
    tags: list[str] = []


class ContactUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company_id: Optional[uuid.UUID] = None
    tags: Optional[list[str]] = None


class ContactOut(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    company_id: Optional[uuid.UUID] = None
    owner_id: uuid.UUID
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Merge schemas
# ---------------------------------------------------------------------------


class MergeRequest(BaseModel):
    source_contact_id: uuid.UUID


# ---------------------------------------------------------------------------
# Timeline schemas
# ---------------------------------------------------------------------------


class TimelineItem(BaseModel):
    id: uuid.UUID
    type: str  # "activity", "deal", "ticket", "email_thread"
    timestamp: datetime
    data: dict[str, Any]

    model_config = {"from_attributes": True}
