import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel as _BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.contacts.models import Contact
from backend.core.deps import get_current_user, get_db
from backend.sales.models import Deal, DealHistory, Lead, Pipeline, Stage
from backend.sales.schemas import (
    DealCreate,
    DealOut,
    DealUpdate,
    LeadConvertRequest,
    LeadConvertResponse,
    LeadCreate,
    LeadOut,
    LeadUpdate,
    PipelineCreate,
    PipelineOut,
    PipelineUpdate,
    StageCreate,
    StageCreateBody,
    StageOut,
    StageUpdate,
)

router = APIRouter(tags=["sales"])

WRITE_ROLES = {"admin", "sales_rep"}


def _require_write(current_user: dict) -> None:
    """Raise 403 if the user is not admin or sales_rep (Req 8.3)."""
    if current_user.get("role") not in WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only sales_rep or admin can perform write operations",
        )


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------


@router.get("/leads/", response_model=list[LeadOut])
async def list_leads(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Lead]:
    result = await db.execute(select(Lead))
    return list(result.scalars().all())


@router.post("/leads/", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
async def create_lead(
    body: LeadCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Lead:
    _require_write(current_user)
    data = body.model_dump()
    # Req 8.1: always force status to "new" regardless of payload
    data["status"] = "new"
    lead = Lead(**data)
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead


@router.get("/leads/{lead_id}", response_model=LeadOut)
async def get_lead(
    lead_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Lead:
    lead = await db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lead {lead_id} not found")
    return lead


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_lead(
    lead_id: uuid.UUID,
    body: LeadUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Lead:
    _require_write(current_user)
    lead = await db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lead {lead_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
    await db.commit()
    await db.refresh(lead)
    return lead


@router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_write(current_user)
    lead = await db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lead {lead_id} not found")
    await db.delete(lead)
    await db.commit()


@router.post("/leads/{lead_id}/convert", response_model=LeadConvertResponse, status_code=status.HTTP_200_OK)
async def convert_lead(
    lead_id: uuid.UUID,
    body: LeadConvertRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LeadConvertResponse:
    """Convert a lead into a Contact and a Deal atomically (Req 9.1, 9.2, 9.3)."""
    # 1. Check lead exists
    lead = await db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lead {lead_id} not found")

    # 2. Check not already converted (Req 9.3)
    if lead.status == "qualified":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lead is already converted")

    # 3. Check role
    _require_write(current_user)

    # 4. Atomic transaction (Req 9.2)
    try:
        # a. INSERT Contact
        name_parts = lead.name.split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""
        contact = Contact(
            first_name=first_name,
            last_name=last_name,
            email=lead.email,
            owner_id=current_user["sub"],
        )
        db.add(contact)
        await db.flush()  # get contact.id without committing

        # b. INSERT Deal
        deal_title = body.deal_title or lead.name
        deal = Deal(
            title=deal_title,
            value=body.deal_value,
            pipeline_id=body.pipeline_id,
            stage_id=body.stage_id,
            contact_id=contact.id,
            owner_id=current_user["sub"],
            status="open",
        )
        db.add(deal)
        await db.flush()  # get deal.id without committing

        # c. UPDATE Lead
        lead.status = "qualified"
        lead.converted_at = datetime.now(timezone.utc)
        lead.converted_contact_id = contact.id
        lead.converted_deal_id = deal.id

        # 5. COMMIT
        await db.commit()
        await db.refresh(contact)
        await db.refresh(deal)

        return LeadConvertResponse(contact_id=contact.id, deal_id=deal.id)

    except Exception:
        await db.rollback()
        raise


# ---------------------------------------------------------------------------
# Pipelines (Req 10.1 – 10.5)
# ---------------------------------------------------------------------------


def _require_admin(current_user: dict) -> None:
    """Raise 403 if the user is not admin (Req 10.5)."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin can manage pipelines and stages",
        )


@router.get("/pipelines/", response_model=list[PipelineOut])
async def list_pipelines(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Pipeline]:
    result = await db.execute(select(Pipeline))
    return list(result.scalars().all())


@router.post("/pipelines/", response_model=PipelineOut, status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    body: PipelineCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Pipeline:
    _require_admin(current_user)
    # Enforce single default pipeline invariant (Req 10.4)
    if body.is_default:
        await db.execute(
            Pipeline.__table__.update().values(is_default=False)
        )
    pipeline = Pipeline(name=body.name, is_default=body.is_default)
    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)
    return pipeline


@router.get("/pipelines/{pipeline_id}", response_model=PipelineOut)
async def get_pipeline(
    pipeline_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Pipeline:
    pipeline = await db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pipeline {pipeline_id} not found")
    return pipeline


@router.patch("/pipelines/{pipeline_id}", response_model=PipelineOut)
async def update_pipeline(
    pipeline_id: uuid.UUID,
    body: PipelineUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Pipeline:
    _require_admin(current_user)
    pipeline = await db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pipeline {pipeline_id} not found")
    updates = body.model_dump(exclude_unset=True)
    # Enforce single default pipeline invariant (Req 10.4)
    if updates.get("is_default"):
        await db.execute(
            Pipeline.__table__.update().values(is_default=False)
        )
    for field, value in updates.items():
        setattr(pipeline, field, value)
    await db.commit()
    await db.refresh(pipeline)
    return pipeline


@router.delete("/pipelines/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pipeline(
    pipeline_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_admin(current_user)
    pipeline = await db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pipeline {pipeline_id} not found")
    await db.delete(pipeline)
    await db.commit()


# ---------------------------------------------------------------------------
# Stages (Req 10.2, 10.3, 10.5)
# ---------------------------------------------------------------------------


@router.get("/pipelines/{pipeline_id}/stages", response_model=list[StageOut])
async def list_stages(
    pipeline_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Stage]:
    pipeline = await db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pipeline {pipeline_id} not found")
    result = await db.execute(
        select(Stage).where(Stage.pipeline_id == pipeline_id).order_by(Stage.position)
    )
    return list(result.scalars().all())


@router.post("/pipelines/{pipeline_id}/stages", response_model=StageOut, status_code=status.HTTP_201_CREATED)
async def create_stage(
    pipeline_id: uuid.UUID,
    body: StageCreateBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Stage:
    _require_admin(current_user)
    pipeline = await db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pipeline {pipeline_id} not found")
    stage = Stage(pipeline_id=pipeline_id, name=body.name, position=body.position)
    db.add(stage)
    await db.commit()
    await db.refresh(stage)
    return stage


@router.patch("/stages/{stage_id}", response_model=StageOut)
async def update_stage(
    stage_id: uuid.UUID,
    body: StageUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Stage:
    _require_admin(current_user)
    stage = await db.get(Stage, stage_id)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Stage {stage_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(stage, field, value)
    await db.commit()
    await db.refresh(stage)
    return stage


# ---------------------------------------------------------------------------
# Deals (Req 11.1 – 11.4)
# ---------------------------------------------------------------------------


@router.get("/deals/", response_model=list[DealOut])
async def list_deals(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Deal]:
    result = await db.execute(select(Deal))
    return list(result.scalars().all())


@router.post("/deals/", response_model=DealOut, status_code=status.HTTP_201_CREATED)
async def create_deal(
    body: DealCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deal:
    _require_write(current_user)
    data = body.model_dump()
    # Req 11.1: always force status to "open"
    data["status"] = "open"
    deal = Deal(**data)
    db.add(deal)
    await db.commit()
    await db.refresh(deal)
    return deal


@router.get("/deals/{deal_id}", response_model=DealOut)
async def get_deal(
    deal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deal:
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Deal {deal_id} not found")
    return deal


@router.patch("/deals/{deal_id}", response_model=DealOut)
async def update_deal(
    deal_id: uuid.UUID,
    body: DealUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deal:
    _require_write(current_user)
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Deal {deal_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(deal, field, value)
    await db.commit()
    await db.refresh(deal)
    return deal


@router.delete("/deals/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_write(current_user)
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Deal {deal_id} not found")
    await db.delete(deal)
    await db.commit()


# ---------------------------------------------------------------------------
# Deal stage transition (Req 12.1, 12.2)
# ---------------------------------------------------------------------------


class _StageMoveBody(_BaseModel):
    stage_id: uuid.UUID


@router.patch("/deals/{deal_id}/stage", response_model=DealOut)
async def move_deal_stage(
    deal_id: uuid.UUID,
    body: _StageMoveBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deal:
    """Move a deal to a new stage and record history (Req 12.1, 12.2)."""
    _require_write(current_user)
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Deal {deal_id} not found")

    old_stage_id = deal.stage_id
    new_stage_id = body.stage_id

    # Update deal
    deal.stage_id = new_stage_id
    deal.stage_entered_at = datetime.now(timezone.utc)

    # Insert DealHistory row (Req 12.2)
    history = DealHistory(
        deal_id=deal.id,
        changed_by=uuid.UUID(current_user["sub"]),
        field="stage_id",
        old_value=str(old_stage_id),
        new_value=str(new_stage_id),
    )
    db.add(history)

    await db.commit()
    await db.refresh(deal)
    return deal


# ---------------------------------------------------------------------------
# Deal won / lost (Req 13.1, 13.2, 13.3)
# ---------------------------------------------------------------------------


class _WonLostBody(_BaseModel):
    won_lost_reason: str | None = None


@router.post("/deals/{deal_id}/won", response_model=DealOut)
async def mark_deal_won(
    deal_id: uuid.UUID,
    body: _WonLostBody = _WonLostBody(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deal:
    """Mark a deal as won (Req 13.1, 13.3)."""
    _require_write(current_user)
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Deal {deal_id} not found")
    if deal.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal is already closed")
    deal.status = "won"
    deal.won_lost_reason = body.won_lost_reason
    await db.commit()
    await db.refresh(deal)
    return deal


@router.post("/deals/{deal_id}/lost", response_model=DealOut)
async def mark_deal_lost(
    deal_id: uuid.UUID,
    body: _WonLostBody = _WonLostBody(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deal:
    """Mark a deal as lost (Req 13.2, 13.3)."""
    _require_write(current_user)
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Deal {deal_id} not found")
    if deal.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal is already closed")
    deal.status = "lost"
    deal.won_lost_reason = body.won_lost_reason
    await db.commit()
    await db.refresh(deal)
    return deal
