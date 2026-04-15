"""
APScheduler email sync job — polls each user's IMAP every 2 minutes.

Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 18.1, 18.2
"""
import asyncio
import email as stdlib_email
import imaplib
import logging
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.core.database import AsyncSessionFactory
from backend.core.security import decrypt_value
from backend.email.models import EmailCredential, EmailMessage, EmailThread

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    """Register the sync job and start the scheduler."""
    scheduler.add_job(
        sync_all_users,
        trigger="interval",
        minutes=2,
        id="email_sync",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Email sync scheduler started (interval=2 min)")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Email sync scheduler stopped")


# ---------------------------------------------------------------------------
# Top-level sync — Req 21.4, 21.5: errors are isolated per user
# ---------------------------------------------------------------------------


async def sync_all_users() -> None:
    """Sync all users' IMAP inboxes. Errors for one user do not affect others."""
    async with AsyncSessionFactory() as db:
        result = await db.execute(select(EmailCredential))
        credentials = list(result.scalars().all())

    for cred in credentials:
        try:
            await sync_user(cred)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Email sync failed for user_id=%s at %s: %s",
                cred.user_id,
                datetime.now(timezone.utc).isoformat(),
                exc,
                exc_info=True,
            )


# ---------------------------------------------------------------------------
# Per-user sync
# ---------------------------------------------------------------------------


async def sync_user(cred: EmailCredential) -> None:
    """Fetch unseen messages for one user and persist them."""
    loop = asyncio.get_event_loop()
    raw_messages = await loop.run_in_executor(None, _fetch_imap_messages, cred)

    if not raw_messages:
        return

    async with AsyncSessionFactory() as db:
        for raw in raw_messages:
            try:
                await _process_message(db, cred, raw)
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "Failed to process message for user_id=%s: %s", cred.user_id, exc, exc_info=True
                )
        await db.commit()


# ---------------------------------------------------------------------------
# IMAP fetch (sync, run in executor)
# ---------------------------------------------------------------------------


def _fetch_imap_messages(cred: EmailCredential) -> list[bytes]:
    """Connect to IMAP and return raw RFC 2822 message bytes for unseen messages."""
    password = decrypt_value(cred.password_encrypted)
    raw_messages: list[bytes] = []

    with imaplib.IMAP4_SSL(cred.imap_host, cred.imap_port) as imap:
        imap.login(cred.username, password)
        imap.select("INBOX")
        _, data = imap.search(None, "UNSEEN")
        if not data or not data[0]:
            return raw_messages
        for num in data[0].split():
            _, msg_data = imap.fetch(num, "(RFC822)")
            if msg_data and msg_data[0]:
                raw_messages.append(msg_data[0][1])  # type: ignore[index]

    return raw_messages


# ---------------------------------------------------------------------------
# Message processing
# ---------------------------------------------------------------------------


async def _process_message(db: AsyncSession, cred: EmailCredential, raw: bytes) -> None:
    """Parse a raw email and upsert into the database."""
    msg = stdlib_email.message_from_bytes(raw)

    message_id = (msg.get("Message-ID") or "").strip()
    if not message_id:
        logger.warning("Skipping message without Message-ID for user_id=%s", cred.user_id)
        return

    # Deduplicate by Message-ID + owner_id — Req 21.2
    existing = await db.execute(
        select(EmailMessage).where(
            EmailMessage.message_id == message_id,
            EmailMessage.owner_id == cred.user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return  # already stored

    subject = _decode_header_value(msg.get("Subject", "(no subject)"))
    from_address = parseaddr(msg.get("From", ""))[1]
    to_addresses = _parse_address_list(msg.get("To", ""))
    cc_addresses = _parse_address_list(msg.get("Cc", ""))

    try:
        sent_at = parsedate_to_datetime(msg.get("Date", ""))
    except Exception:
        sent_at = datetime.now(timezone.utc)

    body_text, body_html = _extract_body(msg)

    # Find or create thread by subject — simple subject-based threading
    thread = await _find_or_create_thread(db, cred, subject, sent_at, from_address)

    email_msg = EmailMessage(
        thread_id=thread.id,
        message_id=message_id,
        from_address=from_address,
        to_addresses=to_addresses,
        cc_addresses=cc_addresses,
        body_text=body_text,
        body_html=body_html,
        sent_at=sent_at,
        direction="inbound",
        owner_id=cred.user_id,
    )
    db.add(email_msg)

    # Update thread's last_message_at
    if sent_at > thread.last_message_at:
        thread.last_message_at = sent_at

    # Auto-create ticket if message targets support inbox — Req 18.1, 18.2
    support_email = settings.SUPPORT_EMAIL.lower()
    all_recipients = [a.lower() for a in to_addresses + cc_addresses]
    if support_email in all_recipients:
        await _auto_create_ticket(db, thread, subject, from_address)


async def _find_or_create_thread(
    db: AsyncSession,
    cred: EmailCredential,
    subject: str,
    sent_at: datetime,
    from_address: str,
) -> EmailThread:
    """Find an existing thread by subject+owner or create a new one."""
    # Strip Re:/Fwd: prefixes for matching
    normalized = subject.lower().lstrip("re: ").lstrip("fwd: ").strip()

    result = await db.execute(
        select(EmailThread).where(
            EmailThread.owner_id == cred.user_id,
            EmailThread.subject.ilike(f"%{normalized}%"),
        )
    )
    thread = result.scalars().first()

    if thread is None:
        # Try to match contact by sender email — Req 21.3
        from backend.contacts.models import Contact

        contact_result = await db.execute(
            select(Contact).where(Contact.email == from_address)
        )
        contact = contact_result.scalar_one_or_none()

        thread = EmailThread(
            subject=subject,
            last_message_at=sent_at,
            owner_id=cred.user_id,
            contact_id=contact.id if contact else None,
        )
        db.add(thread)
        await db.flush()

    return thread


async def _auto_create_ticket(
    db: AsyncSession,
    thread: EmailThread,
    subject: str,
    from_address: str,
) -> None:
    """Auto-create a support Ticket for inbound support-inbox emails — Req 18.1, 18.2."""
    from backend.contacts.models import Contact
    from backend.support.models import Ticket

    # Check if a ticket already exists for this thread
    existing = await db.execute(
        select(Ticket).where(Ticket.subject == subject)
    )
    if existing.scalar_one_or_none() is not None:
        return

    # Match sender to contact — Req 18.1
    contact_result = await db.execute(
        select(Contact).where(Contact.email == from_address)
    )
    contact = contact_result.scalar_one_or_none()

    # Use thread owner as created_by
    ticket = Ticket(
        subject=subject,
        description=f"Auto-created from inbound email (from: {from_address})",
        status="open",
        priority="medium",
        contact_id=contact.id if contact else None,
        created_by=thread.owner_id,
    )
    db.add(ticket)
    await db.flush()

    # Link thread to ticket
    thread.ticket_id = ticket.id


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def _decode_header_value(value: str) -> str:
    parts = decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def _parse_address_list(header: str) -> list[str]:
    if not header:
        return []
    return [parseaddr(addr.strip())[1] for addr in header.split(",") if addr.strip()]


def _extract_body(msg: stdlib_email.message.Message) -> tuple[str, str | None]:
    body_text = ""
    body_html = None

    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain" and not body_text:
                payload = part.get_payload(decode=True)
                if payload:
                    body_text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
            elif ct == "text/html" and body_html is None:
                payload = part.get_payload(decode=True)
                if payload:
                    body_html = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            ct = msg.get_content_type()
            text = payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
            if ct == "text/html":
                body_html = text
            else:
                body_text = text

    return body_text, body_html
