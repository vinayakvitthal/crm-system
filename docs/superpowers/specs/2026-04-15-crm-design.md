# CRM System — Design Spec
**Date:** 2026-04-15

---

## Overview

A fully featured, single-company CRM covering sales pipeline management, customer support ticketing, and general contact/company management. Built for a single organization with multiple users across different roles.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| Backend | FastAPI (Python 3.12), modular monolith |
| Database | PostgreSQL, SQLAlchemy (async), Alembic migrations |
| Auth | JWT (access + refresh tokens), bcrypt |
| Email sync | APScheduler inside FastAPI process (IMAP polling + SMTP send) |

**UI theme:** Dark sidebar + metric cards layout with a light/dark theme toggle.

---

## Architecture

Single FastAPI application structured as a modular monolith — one deployed process, clearly separated Python packages per domain.

```
backend/
  app/
    contacts/       # contacts & companies
    sales/          # leads, deals, pipelines
    support/        # tickets, ticket comments
    activities/     # calls, meetings, notes, tasks
    email/          # IMAP/SMTP sync, inbox, threading
    analytics/      # dashboard metrics, reports
    users/          # auth, roles, team management
    core/           # DB session, config, JWT utils, shared deps

frontend/
  src/
    features/       # mirrors backend modules (contacts, sales, support, …)
    components/     # shared UI components (Button, Modal, Table, …)
    hooks/          # shared custom hooks
    lib/            # API client, auth helpers
```

APScheduler runs as a startup task inside the FastAPI process, polling each user's IMAP mailbox every 2 minutes. Email sync errors are caught, logged, and retried next cycle — they never crash the API.

---

## Data Model

### Entities & Relationships

```
Users ──── Roles (admin | sales_rep | support_agent | viewer)

Contacts ──── Companies          (many contacts → one company)
    │
    ├── Activities               (polymorphic: linked to contact, deal, or ticket)
    ├── Deals                    (contact → deal, company → deal)
    └── Tickets                  (contact → ticket)

Leads                            (convert → Contact + Deal)

Deals ──── Pipelines ──── Stages (ordered list)
    └── Activities

Tickets ──── Comments            (threaded)
    └── Activities

EmailThreads ──── EmailMessages  (stored separately, auto-linked to contacts by address)
    └── linked to Contact / Deal / Ticket
```

### Key Design Decisions

- **Activities are polymorphic** — they reference a Contact, Deal, or Ticket via nullable foreign keys. Type field distinguishes call / meeting / note / task / email_logged.
- **Emails are decoupled** — stored in their own `email_messages` table, linked to contacts/deals/tickets by matching the sender/recipient address to known contacts.
- **Pipeline stages are ordered** — each stage has a `position` integer; deals record a `stage_entered_at` timestamp for sales velocity reporting.
- **Roles are flat** — admin > sales_rep / support_agent > viewer. No hierarchical inheritance.
- **Email credentials encrypted at rest** — per-user IMAP/SMTP credentials stored encrypted in the database (Fernet symmetric encryption using a server-side secret).

---

## Features

### Users & Auth
- Register, login, logout, token refresh
- Admin can assign/change roles
- Password reset flow (token-based)
- Team member list view

### Contacts & Companies
- Full CRUD with search and filters (by company, tag, owner, creation date)
- Merge duplicate contacts
- Contact timeline view: all linked activities, emails, deals, and tickets in chronological order

### Leads & Sales Pipeline
- **Leads** are unqualified prospects — a lightweight record (name, email, source, status: new/contacted/qualified/disqualified) that can be converted into a Contact + Deal in one action
- **Deals** represent qualified opportunities moving through a pipeline
- Multiple named pipelines with user-defined stages
- Kanban board (drag-and-drop deal cards between stages)
- Deal detail: value, expected close date, owner, linked contacts, activities
- Won / lost tracking with reason field
- Deal history log (every status/stage change recorded)

### Support Tickets
- Create manually or auto-create from incoming email
- Assign to support agents
- Status workflow: `open → in_progress → resolved → closed`
- Priority levels: low / medium / high / urgent
- Threaded comments per ticket

### Activities
- Types: call, meeting, note, task, email_logged
- Link to any contact, deal, or ticket
- Due dates + completion tracking for tasks
- Activity feed sorted by recency across all entities

### Email (Two-Way Sync)
- Per-user IMAP + SMTP connection (credentials stored encrypted)
- APScheduler polls IMAP every 2 minutes, stores new messages in DB
- Auto-matches incoming emails to contacts by email address
- Auto-creates tickets from emails to a designated support inbox (configurable)
- Compose new emails and reply to threads from within the CRM
- Email thread view linkable to a contact, deal, or ticket

### Analytics Dashboard
- KPI cards: total contacts, open pipeline value, tickets resolved this week, emails sent today
- Deal pipeline funnel chart (deals by stage)
- Sales velocity (average days per pipeline stage)
- Ticket resolution time (average hours to close)
- Activity breakdown by type (bar chart)
- All charts use a date range filter (last 7d / 30d / 90d / custom)

---

## Roles & Permissions

| Action | admin | sales_rep | support_agent | viewer |
|---|---|---|---|---|
| Manage users & roles | ✅ | ❌ | ❌ | ❌ |
| Full contact/company CRUD | ✅ | ✅ | ✅ | read |
| Leads | ✅ | ✅ | read | read |
| Deals & pipelines | ✅ | ✅ | read | read |
| Support tickets | ✅ | read | ✅ | read |
| Activities | ✅ | ✅ | ✅ | read |
| Email (own mailbox) | ✅ | ✅ | ✅ | ❌ |
| Analytics | ✅ | ✅ | ✅ | ✅ |

Role checks are enforced via FastAPI dependencies injected on every route — not just at the router level.

---

## API Error Handling

- All errors return consistent JSON: `{ "error": "<type>", "detail": "<message>" }`
- `401` — missing or expired JWT
- `403` — insufficient role for the action
- `404` — resource not found
- `422` — validation error (FastAPI default, standardized format)
- `500` — unexpected server error (logged, generic message returned to client)

Frontend shows toast notifications for API errors and inline field-level messages for form validation errors.

---

## Testing Strategy

**Backend (pytest):**
- Async test client via `httpx.AsyncClient`
- Tests run against a real PostgreSQL test database (Docker Compose)
- Each module has its own `tests/` folder mirroring the module structure
- Fixtures for seeded users, contacts, deals, tickets

**Frontend (Vitest + React Testing Library):**
- Unit tests for shared components and custom hooks
- Integration tests for key feature flows (create contact, move deal, close ticket)

**E2E (Playwright):**
- Critical paths: login/logout, create a deal and move it through pipeline, create and close a ticket, send an email

---

## Deployment

- Docker Compose for local dev: `postgres`, `backend`, `frontend` (Vite dev server)
- `.env` file for secrets: `DATABASE_URL`, `JWT_SECRET`, `EMAIL_ENCRYPTION_KEY`
- Alembic migrations run on backend startup in development
- Single `docker-compose.yml` at the repo root
