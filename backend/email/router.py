import email as stdlib_email
import logging
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, get_db
from backend.core.security import decrypt_value, encrypt_value
from backend.email.models import EmailCredential, EmailMessage, EmailThread
from backend.email.schemas import (
    EmailCredentialOut,
    EmailCredentialSave,
    EmailMessageOut,
    EmailReply,
    EmailSend,
    EmailThreadLink,
    EmailThreadOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])

NON_VIEWER_ROLES = {"admin", "sales_rep", "support_agent"}


def _require_non_viewer(current_user: dict) -> None:
    """Raise 403 for viewer role — Req 22.6."""
    if current_user.get("role") not in NON_VIEWER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers cannot access email features",
        )


# ---------------------------------------------------------------------------
# Credentials — Req 20.1, 20.2, 20.3, 26.5
# ---------------------------------------------------------------------------


@router.post("/credentials", response_model=EmailCredentialOut, status_code=status.HTTP_200_OK)
async def save_credentials(
    body: EmailCredentialSave,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmailCredential:
    _require_non_viewer(current_user)
    user_id = uuid.UUID(current_user["sub"])

    result = await db.execute(
        select(EmailCredential).where(EmailCredential.user_id == user_id)
    )
    cred = result.scalar_one_or_none()

    encrypted = encrypt_value(body.password)

    if cred is None:
        cred = EmailCredential(
            user_id=user_id,
            imap_host=body.imap_host,
            imap_port=body.imap_port,
            smtp_host=body.smtp_host,
            smtp_port=body.smtp_port,
            username=body.username,
            password_encrypted=encrypted,
        )
        db.add(cred)
    else:
        cred.imap_host = body.imap_host
        cred.imap_port = body.imap_port
        cred.smtp_host = body.smtp_host
        cred.smtp_port = body.smtp_port
        cred.username = body.username
        cred.password_encrypted = encrypted  # re-encrypt on update — Req 20.3

    await db.commit()
    await db.refresh(cred)
    return cred


# ---------------------------------------------------------------------------
# Inbox — Req 22.1
# ---------------------------------------------------------------------------


@router.get("/inbox", response_model=list[EmailThreadOut])
async def get_inbox(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EmailThread]:
    _require_non_viewer(current_user)
    user_id = uuid.UUID(current_user["sub"])
    offset = (page - 1) * page_size

    result = await db.execute(
        select(EmailThread)
        .where(EmailThread.owner_id == user_id)
        .order_by(EmailThread.last_message_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Thread detail — Req 22.2
# ---------------------------------------------------------------------------


@router.get("/threads/{thread_id}", response_model=list[EmailMessageOut])
async def get_thread(
    thread_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EmailMessage]:
    _require_non_viewer(current_user)
    user_id = uuid.UUID(current_user["sub"])

    thread = await db.get(EmailThread, thread_id)
    if thread is None or thread.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Thread {thread_id} not found")

    result = await db.execute(
        select(EmailMessage)
        .where(EmailMessage.thread_id == thread_id)
        .order_by(EmailMessage.sent_at.asc())
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Send — Req 22.3
# ---------------------------------------------------------------------------


@router.post("/send", response_model=EmailMessageOut, status_code=status.HTTP_201_CREATED)
async def send_email(
    body: EmailSend,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmailMessage:
    _require_non_viewer(current_user)
    user_id = uuid.UUID(current_user["sub"])

    cred = await _get_credential_or_404(user_id, db)
    msg_id = _transmit_smtp(cred, body.to_addresses, body.cc_addresses, body.subject, body.body_text, body.body_html)

    now = datetime.now(timezone.utc)
    thread = EmailThread(
        subject=body.subject,
        last_message_at=now,
        owner_id=user_id,
    )
    db.add(thread)
    await db.flush()

    message = EmailMessage(
        thread_id=thread.id,
        message_id=msg_id,
        from_address=cred.username,
        to_addresses=body.to_addresses,
        cc_addresses=body.cc_addresses,
        body_text=body.body_text,
        body_html=body.body_html,
        sent_at=now,
        direction="outbound",
        owner_id=user_id,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


# ---------------------------------------------------------------------------
# Reply — Req 22.4
# ---------------------------------------------------------------------------


@router.post("/reply/{thread_id}", response_model=EmailMessageOut, status_code=status.HTTP_201_CREATED)
async def reply_to_thread(
    thread_id: uuid.UUID,
    body: EmailReply,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmailMessage:
    _require_non_viewer(current_user)
    user_id = uuid.UUID(current_user["sub"])

    thread = await db.get(EmailThread, thread_id)
    if thread is None or thread.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Thread {thread_id} not found")

    cred = await _get_credential_or_404(user_id, db)

    # Fetch the first message to get original recipients
    result = await db.execute(
        select(EmailMessage)
        .where(EmailMessage.thread_id == thread_id)
        .order_by(EmailMessage.sent_at.asc())
        .limit(1)
    )
    first_msg = result.scalar_one_or_none()
    to_addresses = [first_msg.from_address] if first_msg else []

    msg_id = _transmit_smtp(
        cred, to_addresses, body.cc_addresses, f"Re: {thread.subject}", body.body_text, body.body_html
    )

    now = datetime.now(timezone.utc)
    thread.last_message_at = now

    message = EmailMessage(
        thread_id=thread_id,
        message_id=msg_id,
        from_address=cred.username,
        to_addresses=to_addresses,
        cc_addresses=body.cc_addresses,
        body_text=body.body_text,
        body_html=body.body_html,
        sent_at=now,
        direction="outbound",
        owner_id=user_id,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


# ---------------------------------------------------------------------------
# Link thread — Req 22.5
# ---------------------------------------------------------------------------


@router.patch("/threads/{thread_id}/link", response_model=EmailThreadOut)
async def link_thread(
    thread_id: uuid.UUID,
    body: EmailThreadLink,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmailThread:
    _require_non_viewer(current_user)
    user_id = uuid.UUID(current_user["sub"])

    thread = await db.get(EmailThread, thread_id)
    if thread is None or thread.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Thread {thread_id} not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(thread, field, value)

    await db.commit()
    await db.refresh(thread)
    return thread


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_credential_or_404(user_id: uuid.UUID, db: AsyncSession) -> EmailCredential:
    result = await db.execute(
        select(EmailCredential).where(EmailCredential.user_id == user_id)
    )
    cred = result.scalar_one_or_none()
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No email credentials configured",
        )
    return cred


def _transmit_smtp(
    cred: EmailCredential,
    to_addresses: list[str],
    cc_addresses: list[str],
    subject: str,
    body_text: str,
    body_html: str | None,
) -> str:
    """Send email via SMTP and return the generated Message-ID."""
    msg = MIMEMultipart("alternative") if body_html else MIMEText(body_text, "plain")
    if body_html:
        msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

    msg["From"] = cred.username
    msg["To"] = ", ".join(to_addresses)
    if cc_addresses:
        msg["Cc"] = ", ".join(cc_addresses)
    msg["Subject"] = subject

    import email.utils as email_utils
    generated_id = email_utils.make_msgid()
    msg["Message-ID"] = generated_id

    password = decrypt_value(cred.password_encrypted)
    all_recipients = to_addresses + cc_addresses

    with smtplib.SMTP(cred.smtp_host, cred.smtp_port) as server:
        server.starttls()
        server.login(cred.username, password)
        server.sendmail(cred.username, all_recipients, msg.as_string())

    return generated_id
