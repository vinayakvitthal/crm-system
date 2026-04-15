# CRM System

A fully featured, single-company CRM covering sales pipeline management, customer support ticketing, and contact/company management.

- **Backend**: FastAPI + PostgreSQL (SQLAlchemy async, Alembic migrations)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Email sync**: In-process APScheduler polling IMAP every 2 minutes

## Roles

| Role | Access |
|---|---|
| `admin` | Full access |
| `sales_rep` | Contacts, leads, deals, activities, email |
| `support_agent` | Contacts, tickets, activities, email |
| `viewer` | Read-only (no email) |

## Quick Start (Docker Compose)

```bash
cp .env.example .env   # fill in secrets (see below)
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Local Development

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Apply migrations
alembic upgrade head

# Run dev server
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Random secret for signing JWTs — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `EMAIL_ENCRYPTION_KEY` | Fernet key for encrypting email credentials — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `CORS_ORIGINS` | Allowed frontend origins (JSON array) |

## Running Tests

```bash
# Backend (from workspace root)
python -m pytest backend/tests/

# Frontend
cd frontend && npx vitest run
```

## Features

- **Auth**: JWT access tokens (15 min) + httpOnly refresh tokens (7 days), bcrypt passwords, password reset via email
- **Contacts & Companies**: Full CRUD, search/filter, merge duplicates, chronological timeline
- **Leads**: Capture and convert leads atomically into a Contact + Deal in one action
- **Sales Pipeline**: Configurable pipelines and stages, Kanban drag-and-drop board, deal history tracking, won/lost outcomes
- **Support Tickets**: Status workflow (open → in_progress → resolved → closed), assignment, threaded comments
- **Activities**: Log calls, meetings, notes, tasks, and emails against any entity
- **Email**: Per-user IMAP/SMTP sync, inbox view, compose and reply, auto-link threads to contacts/deals/tickets
- **Analytics**: KPI dashboard with pipeline funnel, sales velocity, ticket resolution time, and activity breakdown charts
