import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# EmailCredential schemas
# ---------------------------------------------------------------------------


class EmailCredentialSave(BaseModel):
    imap_host: str
    imap_port: int
    smtp_host: str
    smtp_port: int
    username: str
    password: str  # plaintext — will be encrypted before storage


class EmailCredentialOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    imap_host: str
    imap_port: int
    smtp_host: str
    smtp_port: int
    username: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# EmailThread schemas
# ---------------------------------------------------------------------------


class EmailThreadOut(BaseModel):
    id: uuid.UUID
    subject: str
    last_message_at: datetime
    owner_id: uuid.UUID
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    ticket_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class EmailThreadLink(BaseModel):
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    ticket_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# EmailMessage schemas
# ---------------------------------------------------------------------------


class EmailMessageOut(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    message_id: str
    from_address: str
    to_addresses: list[str]
    cc_addresses: list[str]
    body_text: str
    body_html: Optional[str] = None
    sent_at: datetime
    direction: Literal["inbound", "outbound"]
    owner_id: uuid.UUID

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Send / Reply schemas
# ---------------------------------------------------------------------------


class EmailSend(BaseModel):
    to_addresses: list[str]
    cc_addresses: list[str] = []
    subject: str
    body_text: str
    body_html: Optional[str] = None


class EmailReply(BaseModel):
    body_text: str
    body_html: Optional[str] = None
    cc_addresses: list[str] = []
