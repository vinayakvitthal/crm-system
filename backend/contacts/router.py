import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.contacts.models import Company, Contact
from backend.contacts.schemas import (
    CompanyCreate,
    CompanyOut,
    CompanyUpdate,
    ContactCreate,
    ContactOut,
    ContactUpdate,
    MergeRequest,
    TimelineItem,
)
from backend.core.deps import get_current_user, get_db

# ---------------------------------------------------------------------------
# Optional domain model imports — modules may not exist yet
# ---------------------------------------------------------------------------
try:
    from backend.activities.models import Activity  # type: ignore[import]
    _HAS_ACTIVITY = True
except ImportError:
    Activity = None  # type: ignore[assignment,misc]
    _HAS_ACTIVITY = False

try:
    from backend.sales.models import Deal  # type: ignore[import]
    _HAS_DEAL = True
except ImportError:
    Deal = None  # type: ignore[assignment,misc]
    _HAS_DEAL = False

try:
    from backend.support.models import Ticket  # type: ignore[import]
    _HAS_TICKET = True
except ImportError:
    Ticket = None  # type: ignore[assignment,misc]
    _HAS_TICKET = False

try:
    from backend.email.models import EmailThread  # type: ignore[import]
    _HAS_EMAIL_THREAD = True
except ImportError:
    EmailThread = None  # type: ignore[assignment,misc]
    _HAS_EMAIL_THREAD = False

router = APIRouter(tags=["contacts"])

WRITE_ROLES = {"admin", "sales_rep", "support_agent"}


def _require_write(current_user: dict) -> None:
    """Raise 403 if the user is a viewer."""
    if current_user.get("role") not in WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers cannot perform write operations",
        )


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------


@router.get("/contacts/", response_model=list[ContactOut])
async def list_contacts(
    name: Optional[str] = Query(default=None),
    email: Optional[str] = Query(default=None),
    company_id: Optional[uuid.UUID] = Query(default=None),
    tags: Optional[list[str]] = Query(default=None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Contact]:
    stmt = select(Contact)

    if name:
        stmt = stmt.where(
            (Contact.first_name.ilike(f"%{name}%")) | (Contact.last_name.ilike(f"%{name}%"))
        )
    if email:
        stmt = stmt.where(Contact.email.ilike(f"%{email}%"))
    if company_id:
        stmt = stmt.where(Contact.company_id == company_id)

    result = await db.execute(stmt)
    contacts = list(result.scalars().all())

    # Filter by tags in Python (JSON array — any tag match)
    if tags:
        contacts = [c for c in contacts if any(t in (c.tags or []) for t in tags)]

    return contacts


@router.post("/contacts/", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    body: ContactCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Contact:
    _require_write(current_user)
    contact = Contact(
        **body.model_dump(),
        owner_id=uuid.UUID(current_user["sub"]),
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.get("/contacts/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Contact:
    contact = await db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contact {contact_id} not found")
    return contact


@router.patch("/contacts/{contact_id}", response_model=ContactOut)
async def update_contact(
    contact_id: uuid.UUID,
    body: ContactUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Contact:
    _require_write(current_user)
    contact = await db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contact {contact_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_write(current_user)
    contact = await db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contact {contact_id} not found")
    await db.delete(contact)
    await db.commit()


@router.post("/contacts/{contact_id}/merge", response_model=ContactOut)
async def merge_contacts(
    contact_id: uuid.UUID,
    body: MergeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Contact:
    """Merge source contact into target contact (contact_id).

    Re-links all Activities, Deals, Tickets, and EmailThreads from the source
    to the target in a single transaction, then deletes the source contact.
    Returns 404 if either contact ID does not exist.
    """
    _require_write(current_user)

    target = await db.get(Contact, contact_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contact {contact_id} not found")

    source_id = body.source_contact_id
    source = await db.get(Contact, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contact {source_id} not found")

    # Re-link all associated records in a single transaction
    async with db.begin_nested():
        if _HAS_ACTIVITY and Activity is not None:
            await db.execute(
                update(Activity).where(Activity.contact_id == source_id).values(contact_id=contact_id)
            )
        if _HAS_DEAL and Deal is not None:
            await db.execute(
                update(Deal).where(Deal.contact_id == source_id).values(contact_id=contact_id)
            )
        if _HAS_TICKET and Ticket is not None:
            await db.execute(
                update(Ticket).where(Ticket.contact_id == source_id).values(contact_id=contact_id)
            )
        if _HAS_EMAIL_THREAD and EmailThread is not None:
            await db.execute(
                update(EmailThread).where(EmailThread.contact_id == source_id).values(contact_id=contact_id)
            )
        await db.delete(source)

    await db.commit()
    await db.refresh(target)
    return target


@router.get("/contacts/{contact_id}/timeline", response_model=list[TimelineItem])
async def get_contact_timeline(
    contact_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return a chronologically ordered timeline of all records for a contact.

    Includes Activities, EmailThreads, Deals, and Tickets sorted by timestamp
    ascending. Returns an empty list when no records exist.
    """
    contact = await db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contact {contact_id} not found")

    items: list[dict[str, Any]] = []

    if _HAS_ACTIVITY and Activity is not None:
        result = await db.execute(select(Activity).where(Activity.contact_id == contact_id))
        for row in result.scalars().all():
            ts = getattr(row, "created_at", None) or getattr(row, "timestamp", None)
            if ts is None:
                ts = datetime.utcnow()
            items.append({
                "id": row.id,
                "type": "activity",
                "timestamp": ts,
                "data": {
                    "type": getattr(row, "type", None),
                    "subject": getattr(row, "subject", None),
                },
            })

    if _HAS_DEAL and Deal is not None:
        result = await db.execute(select(Deal).where(Deal.contact_id == contact_id))
        for row in result.scalars().all():
            ts = getattr(row, "created_at", None) or getattr(row, "stage_entered_at", None)
            if ts is None:
                ts = datetime.utcnow()
            items.append({
                "id": row.id,
                "type": "deal",
                "timestamp": ts,
                "data": {
                    "title": getattr(row, "title", None),
                    "status": getattr(row, "status", None),
                    "value": getattr(row, "value", None),
                },
            })

    if _HAS_TICKET and Ticket is not None:
        result = await db.execute(select(Ticket).where(Ticket.contact_id == contact_id))
        for row in result.scalars().all():
            ts = getattr(row, "created_at", None)
            if ts is None:
                ts = datetime.utcnow()
            items.append({
                "id": row.id,
                "type": "ticket",
                "timestamp": ts,
                "data": {
                    "subject": getattr(row, "subject", None),
                    "status": getattr(row, "status", None),
                    "priority": getattr(row, "priority", None),
                },
            })

    if _HAS_EMAIL_THREAD and EmailThread is not None:
        result = await db.execute(select(EmailThread).where(EmailThread.contact_id == contact_id))
        for row in result.scalars().all():
            ts = getattr(row, "last_message_at", None) or getattr(row, "created_at", None)
            if ts is None:
                ts = datetime.utcnow()
            items.append({
                "id": row.id,
                "type": "email_thread",
                "timestamp": ts,
                "data": {
                    "subject": getattr(row, "subject", None),
                },
            })

    items.sort(key=lambda x: x["timestamp"])
    return items


# ---------------------------------------------------------------------------
# Companies
# ---------------------------------------------------------------------------


@router.get("/companies/", response_model=list[CompanyOut])
async def list_companies(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Company]:
    result = await db.execute(select(Company))
    return list(result.scalars().all())


@router.post("/companies/", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Company:
    _require_write(current_user)
    company = Company(
        **body.model_dump(),
        owner_id=uuid.UUID(current_user["sub"]),
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.get("/companies/{company_id}", response_model=CompanyOut)
async def get_company(
    company_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Company:
    company = await db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Company {company_id} not found")
    return company


@router.patch("/companies/{company_id}", response_model=CompanyOut)
async def update_company(
    company_id: uuid.UUID,
    body: CompanyUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Company:
    _require_write(current_user)
    company = await db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Company {company_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    await db.commit()
    await db.refresh(company)
    return company


@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_write(current_user)
    company = await db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Company {company_id} not found")
    await db.delete(company)
    await db.commit()
