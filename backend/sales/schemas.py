import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr


# ---------------------------------------------------------------------------
# Lead schemas
# ---------------------------------------------------------------------------

LeadStatus = Literal["new", "contacted", "qualified", "disqualified"]


class LeadCreate(BaseModel):
    name: str
    email: EmailStr
    source: Optional[str] = None
    status: LeadStatus = "new"
    owner_id: uuid.UUID


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    source: Optional[str] = None
    status: Optional[LeadStatus] = None
    owner_id: Optional[uuid.UUID] = None


class LeadOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    source: Optional[str] = None
    status: str
    owner_id: uuid.UUID
    created_at: datetime
    converted_at: Optional[datetime] = None
    converted_contact_id: Optional[uuid.UUID] = None
    converted_deal_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class LeadConvertRequest(BaseModel):
    """Payload for converting a lead into a contact and a deal (Req 9.1)."""
    deal_title: Optional[str] = None
    deal_value: Decimal = Decimal("0")
    pipeline_id: uuid.UUID
    stage_id: uuid.UUID


class LeadConvertResponse(BaseModel):
    contact_id: uuid.UUID
    deal_id: uuid.UUID


# ---------------------------------------------------------------------------
# Pipeline schemas
# ---------------------------------------------------------------------------


class PipelineCreate(BaseModel):
    name: str
    is_default: bool = False


class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None


class PipelineOut(BaseModel):
    id: uuid.UUID
    name: str
    is_default: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Stage schemas
# ---------------------------------------------------------------------------


class StageCreate(BaseModel):
    pipeline_id: uuid.UUID
    name: str
    position: int = 0


class StageCreateBody(BaseModel):
    """Body for POST /pipelines/{id}/stages — pipeline_id comes from path."""
    name: str
    position: int = 0


class StageUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None


class StageOut(BaseModel):
    id: uuid.UUID
    pipeline_id: uuid.UUID
    name: str
    position: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Deal schemas
# ---------------------------------------------------------------------------

DealStatus = Literal["open", "won", "lost"]


class DealCreate(BaseModel):
    title: str
    value: Decimal = Decimal("0")
    currency: str = "USD"
    pipeline_id: uuid.UUID
    stage_id: uuid.UUID
    expected_close_date: Optional[date] = None
    status: DealStatus = "open"
    won_lost_reason: Optional[str] = None
    contact_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    owner_id: uuid.UUID


class DealUpdate(BaseModel):
    title: Optional[str] = None
    value: Optional[Decimal] = None
    currency: Optional[str] = None
    pipeline_id: Optional[uuid.UUID] = None
    stage_id: Optional[uuid.UUID] = None
    expected_close_date: Optional[date] = None
    status: Optional[DealStatus] = None
    won_lost_reason: Optional[str] = None
    contact_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    owner_id: Optional[uuid.UUID] = None


class DealOut(BaseModel):
    id: uuid.UUID
    title: str
    value: Decimal
    currency: str
    pipeline_id: uuid.UUID
    stage_id: uuid.UUID
    stage_entered_at: datetime
    expected_close_date: Optional[date] = None
    status: str
    won_lost_reason: Optional[str] = None
    contact_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    owner_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# DealHistory schemas
# ---------------------------------------------------------------------------


class DealHistoryOut(BaseModel):
    id: uuid.UUID
    deal_id: uuid.UUID
    changed_by: uuid.UUID
    field: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    changed_at: datetime

    model_config = {"from_attributes": True}
