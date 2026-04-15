
# Implementation Plan: CRM System

## Overview

Incremental implementation of the CRM modular monolith. Each task builds on the previous, starting with infrastructure and core utilities, then domain modules (backend), then the React frontend, and finally Docker/deployment wiring. Property-based tests (hypothesis) are placed immediately after the logic they validate.

## Tasks

- [x] 1. Set up project structure, core infrastructure, and shared utilities
  - Create the monorepo layout: `backend/` (FastAPI) and `frontend/` (React + Vite)
  - In `backend/core/`: implement `config.py` (pydantic-settings loading DATABASE_URL, JWT_SECRET, EMAIL_ENCRYPTION_KEY from env), `database.py` (SQLAlchemy async engine + session factory), `security.py` (bcrypt hash/verify, Fernet encrypt/decrypt helpers), `jwt_utils.py` (create/decode access & refresh tokens), and `deps.py` (get_db, get_current_user FastAPI dependencies)
  - Add `backend/main.py` mounting all domain routers and registering the global error handler that returns `{ "error": ..., "detail": ... }` for all 4xx/5xx responses
  - Set up `pytest.ini`, `conftest.py` with async test client and a test PostgreSQL session
  - _Requirements: 1.7, 1.8, 1.9, 24.1, 24.6, 26.1_

- [ ] 2. Implement User Authentication and JWT lifecycle
  - [x] 2.1 Create `users/models.py` (User SQLAlchemy model), `users/schemas.py` (Register, Login, Token Pydantic schemas), and `users/router.py` with POST `/auth/register`, POST `/auth/login`, POST `/auth/refresh`, POST `/auth/logout`
    - Register: hash password with bcrypt cost ≥ 12, store user, return 201
    - Login: verify password, issue access_token + set refresh_token httpOnly cookie
    - Refresh: validate refresh token, issue new access_token; return 401 on invalid/expired
    - Logout: invalidate refresh token (store revoked JTI in DB or delete token record)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [ ]* 2.2 Write property test: invalid credentials always produce 401
    - **Property 1: Invalid credentials always produce 401**
    - **Validates: Requirement 1.3**

  - [ ]* 2.3 Write property test: stored passwords are bcrypt-hashed with cost ≥ 12
    - **Property 2: Stored passwords are bcrypt-hashed with cost ≥ 12**
    - **Validates: Requirement 1.7**

  - [x] 2.4 Implement password reset flow in `users/router.py`
    - POST `/auth/password-reset/request`: generate signed reset token, send email (or log in dev), return success regardless of whether email exists
    - POST `/auth/password-reset/confirm`: validate token, update password hash, invalidate token; return 400 on expired/invalid
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Implement Role Management and Team endpoints
  - [x] 3.1 Add GET `/users/` (admin only — list all users with roles) and PATCH `/users/{id}/role` (admin only — update role) to `users/router.py`
    - Enforce admin-only via FastAPI dependency; return 403 for non-admin callers
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property test: non-admin role enforcement on admin-only routes
    - **Property 3: Non-admin role enforcement on admin-only routes**
    - **Validates: Requirements 3.3, 10.5**

- [x] 4. Checkpoint — Ensure all auth and role tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Contact and Company management
  - [x] 5.1 Create `contacts/models.py` (Contact, Company SQLAlchemy models), `contacts/schemas.py`, and `contacts/router.py` with full CRUD for `/contacts/` and `/companies/`
    - Enforce write-access check (viewer → 403 on mutating ops); return 404 when ID not found
    - Implement search/filter on GET `/contacts/` using query params (name, email, company_id, tags)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.2 Write property test: contact creation round-trip
    - **Property 4: Contact creation round-trip**
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 5.3 Write property test: contact update is reflected on read
    - **Property 5: Contact update is reflected on read**
    - **Validates: Requirement 4.3**

  - [ ]* 5.4 Write property test: search/filter returns only matching contacts
    - **Property 6: Search/filter returns only matching contacts**
    - **Validates: Requirement 4.7**

  - [ ]* 5.5 Write property test: viewer cannot mutate contacts, companies, leads, or deals
    - **Property 7: Viewer cannot mutate contacts, companies, leads, or deals**
    - **Validates: Requirements 4.5, 8.3, 11.3**

- [x] 6. Implement Contact Merge and Timeline
  - [x] 6.1 Add POST `/contacts/{id}/merge` to `contacts/router.py`
    - Re-link all Activities, Deals, Tickets, EmailThreads from source to target contact in a single transaction; delete source; return 404 if either ID missing
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 6.2 Write property test: contact merge preserves all associated records
    - **Property 8: Contact merge preserves all associated records**
    - **Validates: Requirements 6.1, 6.2**

  - [x] 6.3 Add GET `/contacts/{id}/timeline` to `contacts/router.py`
    - Query Activities, EmailThreads, Deals, Tickets for the contact; merge and sort by timestamp ascending; return empty list when none exist
    - _Requirements: 7.1, 7.2_

  - [ ]* 6.4 Write property test: contact timeline is chronologically ordered and complete
    - **Property 9: Contact timeline is chronologically ordered and complete**
    - **Validates: Requirement 7.1**

- [x] 7. Implement Lead Management and Conversion
  - [x] 7.1 Create `sales/models.py` (Lead, Pipeline, Stage, Deal, DealHistory SQLAlchemy models) and `sales/schemas.py`
    - _Requirements: 8.1, 10.1, 10.2, 11.1, 12.1_

  - [x] 7.2 Implement `sales/router.py` — Lead CRUD: GET/POST `/leads/`, GET/PATCH/DELETE `/leads/{id}`
    - New leads always created with status `new`; enforce sales_rep/admin write access; viewer/support_agent get read-only; return 404 when missing
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 7.3 Write property test: newly created leads always have status `new`
    - **Property 10: Newly created leads always have status `new`**
    - **Validates: Requirement 8.1**

  - [x] 7.4 Implement POST `/leads/{id}/convert` in `sales/router.py`
    - Atomic transaction: INSERT contact, INSERT deal, UPDATE lead (status=qualified, converted_at, converted_contact_id, converted_deal_id); rollback all on any failure; return 400 if already converted
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 7.5 Write property test: lead conversion atomicity
    - **Property 11: Lead conversion atomicity**
    - **Validates: Requirements 9.1, 9.2**

- [x] 8. Implement Pipeline, Stage, and Deal management
  - [x] 8.1 Implement Pipeline and Stage CRUD in `sales/router.py`: GET/POST `/pipelines/`, GET/PATCH/DELETE `/pipelines/{id}`, GET/POST `/pipelines/{id}/stages`, PATCH `/stages/{id}`
    - Admin-only for create/update/delete; enforce single default pipeline invariant; order stages by position
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 8.2 Write property test: pipeline stages are ordered by position
    - **Property 12: Pipeline stages are ordered by position**
    - **Validates: Requirements 10.2, 10.3**

  - [x] 8.3 Implement Deal CRUD in `sales/router.py`: GET/POST `/deals/`, GET/PATCH/DELETE `/deals/{id}`
    - New deals always created with status `open`; enforce sales_rep/admin write access; viewer/support_agent read-only; return 404 when missing
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 8.4 Write property test: newly created deals always have status `open`
    - **Property 13: Newly created deals always have status `open`**
    - **Validates: Requirement 11.1**

  - [x] 8.5 Implement PATCH `/deals/{id}/stage` — stage transition with history recording
    - Update deal's stage_id and stage_entered_at; INSERT DealHistory row (old_stage, new_stage, changed_by, changed_at)
    - _Requirements: 12.1, 12.2_

  - [ ]* 8.6 Write property test: deal stage transition records history
    - **Property 14: Deal stage transition records history**
    - **Validates: Requirements 12.1, 12.2**

  - [x] 8.7 Implement POST `/deals/{id}/won` and POST `/deals/{id}/lost`
    - Set status to won/lost, record won_lost_reason; return 400 if deal already closed
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 9. Checkpoint — Ensure all sales domain tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Support Ticket management
  - [x] 10.1 Create `support/models.py` (Ticket, TicketComment), `support/schemas.py`, and `support/router.py` with CRUD for `/tickets/` and `/tickets/{id}`
    - New tickets always created with status `open`; enforce support_agent/admin write access; viewer/sales_rep read-only; return 404 when missing
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ]* 10.2 Write property test: newly created tickets always have status `open`
    - **Property 15: Newly created tickets always have status `open`**
    - **Validates: Requirement 14.1**

  - [ ]* 10.3 Write property test: viewer and sales_rep cannot mutate tickets
    - **Property 16: Viewer and Sales_Rep cannot mutate tickets**
    - **Validates: Requirement 14.3**

  - [x] 10.4 Implement PATCH `/tickets/{id}/status` and PATCH `/tickets/{id}/assign`
    - Status update: validate against allowed values (open, in_progress, resolved, closed); set resolved_at when status becomes `resolved`; return 422 on invalid value
    - Assignment: set assigned_to; return 404 if user ID not found
    - _Requirements: 15.1, 15.2, 15.3, 16.1, 16.2_

  - [x] 10.5 Implement GET/POST `/tickets/{id}/comments`
    - Create TicketComment linked to ticket; return all comments sorted by created_at ascending; return 404 if ticket not found
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ]* 10.6 Write property test: ticket comments are returned in chronological order
    - **Property 17: Ticket comments are returned in chronological order**
    - **Validates: Requirement 17.2**

- [x] 11. Implement Activity management
  - [x] 11.1 Create `activities/models.py` (Activity), `activities/schemas.py`, and `activities/router.py` with CRUD for `/activities/` and GET `/activities/feed`
    - Require at least one entity link (contact_id, deal_id, or ticket_id); return 422 if none provided
    - Feed endpoint: return all activities sorted by created_at descending
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

- [x] 12. Implement Email Credential management and IMAP/SMTP sync
  - [x] 12.1 Create `email/models.py` (EmailCredential, EmailThread, EmailMessage), `email/schemas.py`, and POST `/email/credentials` endpoint
    - Encrypt password with Fernet before storing; re-encrypt on update; load key from EMAIL_ENCRYPTION_KEY env var only
    - _Requirements: 20.1, 20.2, 20.3, 26.5_

  - [ ]* 12.2 Write property test: email credential passwords are always encrypted at rest
    - **Property 27: Email credential passwords are always encrypted at rest**
    - **Validates: Requirements 20.1, 26.5**

  - [x] 12.3 Implement APScheduler email sync job in `email/scheduler.py`
    - Poll each user's IMAP every 2 minutes; deduplicate by RFC 2822 Message-ID (upsert/ignore on conflict); match sender to Contact by email; auto-create Ticket if message targets support inbox address; catch and log per-user exceptions without interrupting other users
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 18.1, 18.2_

  - [ ]* 12.4 Write property test: email deduplication by Message-ID (idempotence)
    - **Property 18: Email deduplication by Message-ID**
    - **Validates: Requirement 21.2**

  - [ ]* 12.5 Write property test: inbound email auto-links to matching contact
    - **Property 19: Inbound email auto-links to matching contact**
    - **Validates: Requirement 21.3**

  - [ ]* 12.6 Write property test: sync error isolation
    - **Property 20: Sync error isolation**
    - **Validates: Requirements 21.4, 21.5**

  - [x] 12.7 Implement email inbox and thread endpoints in `email/router.py`
    - GET `/email/inbox`: paginated EmailThreads sorted by last_message_at descending
    - GET `/email/threads/{id}`: all messages in thread sorted by sent_at ascending
    - POST `/email/send` and POST `/email/reply/{thread_id}`: transmit via SMTP, store outbound EmailMessage
    - PATCH `/email/threads/{id}/link`: update thread's contact_id/deal_id/ticket_id
    - Viewer → 403 on all email endpoints
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_

  - [ ]* 12.8 Write property test: inbox threads sorted by last_message_at descending
    - **Property 21: Inbox threads sorted by last_message_at descending**
    - **Validates: Requirement 22.1**

  - [ ]* 12.9 Write property test: email thread messages in chronological order
    - **Property 22: Email thread messages in chronological order**
    - **Validates: Requirement 22.2**

  - [ ]* 12.10 Write property test: viewer cannot access email features
    - **Property 23: Viewer cannot access email features**
    - **Validates: Requirement 22.6**

- [x] 13. Checkpoint — Ensure all backend domain tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement Analytics endpoints
  - [x] 14.1 Create `analytics/router.py` with all five analytics endpoints
    - GET `/analytics/kpis`: aggregate total contacts, open deals, open tickets, activities for date range
    - GET `/analytics/pipeline-funnel`: deal counts and values grouped by stage for a pipeline and date range (include stages with zero deals)
    - GET `/analytics/sales-velocity`: average time deals spend per stage for a pipeline and date range
    - GET `/analytics/ticket-resolution`: average time between created_at and resolved_at for date range
    - GET `/analytics/activity-breakdown`: count per activity type for date range
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

  - [ ]* 14.2 Write property test: activity breakdown counts sum to total
    - **Property 24: Activity breakdown counts sum to total**
    - **Validates: Requirement 23.5**

  - [ ]* 14.3 Write property test: pipeline funnel covers all stages
    - **Property 25: Pipeline funnel covers all stages**
    - **Validates: Requirement 23.2**

- [x] 15. Write property test: all API error responses use the standard envelope
  - [ ]* 15.1 Write property test: all API error responses use the standard envelope
    - **Property 26: All API error responses use the standard envelope**
    - **Validates: Requirement 24.1**

- [x] 16. Write Alembic migrations and Docker Compose configuration
  - [x] 16.1 Create Alembic migration for all models (users, contacts, companies, leads, pipelines, stages, deals, deal_history, tickets, ticket_comments, activities, email_credentials, email_threads, email_messages)
    - Add indexes on created_at, stage_entered_at, resolved_at, message_id (unique)
    - _Requirements: 27.1, 27.2_

  - [x] 16.2 Create `docker-compose.yml` with three services: postgres (PostgreSQL 16), backend (FastAPI with Alembic migrate entrypoint), frontend (Vite build served by nginx or vite preview)
    - Backend entrypoint: `alembic upgrade head && uvicorn main:app`
    - Reference `.env` for DATABASE_URL, JWT_SECRET, EMAIL_ENCRYPTION_KEY
    - _Requirements: 27.1, 27.2, 27.3, 26.1, 26.2_

- [x] 17. Implement React frontend — App shell and Auth flows
  - [x] 17.1 Scaffold `frontend/` with Vite + React 18 + TypeScript + Tailwind + shadcn/ui; configure react-router-dom v6, TanStack Query, react-hook-form + zod
    - Create `AppShell` component: dark sidebar with nav links, theme toggle, user menu
    - _Requirements: 27.1_

  - [x] 17.2 Implement `features/auth`: Login page, Register page, Password Reset request + confirm pages
    - Use react-hook-form + zod for validation; store access token in memory, refresh token in httpOnly cookie (set by API); redirect to dashboard on success
    - Display inline field errors on validation failure; toast on API errors
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 25.1, 25.2, 26.3_

- [x] 18. Implement React frontend — Contacts and Companies
  - [x] 18.1 Implement `features/contacts`: Contact list with search/filter, Contact detail page with timeline, Create/Edit contact form, Company list and detail
    - Use TanStack Query for data fetching; show toast on API errors; inline errors on form validation failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 5.1, 5.2, 5.3, 7.1, 25.1, 25.2_

  - [x] 18.2 Implement `LeadConvertModal` component: form with pipeline, stage, and deal value fields; submit calls POST `/leads/{id}/convert`; navigate to new deal on success
    - _Requirements: 9.1_

- [x] 19. Implement React frontend — Sales Pipeline and Kanban
  - [x] 19.1 Implement `features/sales`: Lead list page, Pipeline/Stage management page (admin only), Deal list page
    - _Requirements: 8.1, 8.2, 10.1, 10.2, 11.1, 11.2_

  - [x] 19.2 Implement `KanbanBoard` component using dnd-kit: render deal cards grouped by stage column; on drag end call PATCH `/deals/{id}/stage`; re-render board on success
    - _Requirements: 12.3, 12.4_

- [ ] 20. Implement React frontend — Support Tickets
  - [ ] 20.1 Implement `features/support`: Ticket list page, `TicketDetail` component with status workflow controls (dropdown for status transitions), assignment selector, and threaded comment list + add comment form
    - _Requirements: 14.1, 14.2, 15.1, 16.1, 17.1, 17.2, 25.1, 25.2_

- [ ] 21. Implement React frontend — Activities and Email
  - [ ] 21.1 Implement `features/activities`: Activity feed page, Create activity form (type selector, entity link fields)
    - _Requirements: 19.1, 19.4_

  - [ ] 21.2 Implement `features/email`: `EmailInbox` component (thread list + thread detail panel), Compose/Reply panel; Email credential settings form
    - _Requirements: 20.1, 22.1, 22.2, 22.3, 22.4, 22.5_

- [ ] 22. Implement React frontend — Analytics Dashboard
  - [ ] 22.1 Implement `features/analytics`: `AnalyticsDashboard` with KPI cards, pipeline funnel chart, sales velocity chart, ticket resolution time, activity breakdown chart; date range picker with 7d/30d/90d presets and custom range
    - Use a charting library (e.g., recharts) for funnel and velocity charts
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

- [ ] 23. Write frontend unit and integration tests
  - [ ]* 23.1 Write Vitest + React Testing Library unit tests for shared components (Button, Modal, Table, KanbanCard) and custom hooks (useAuth, useDeals, useContacts)
    - _Requirements: 25.1, 25.2, 25.3_

  - [ ]* 23.2 Write Vitest integration tests for key flows: create contact, move deal between stages, close ticket with comment, compose email
    - _Requirements: 4.1, 12.4, 17.1, 22.3_

- [ ] 24. Write Playwright E2E tests for critical paths
  - [ ]* 24.1 Write Playwright tests for: login/logout, create a deal and drag through all pipeline stages, create and close a support ticket with comments, send an email from within the CRM
    - _Requirements: 1.2, 1.6, 12.3, 12.4, 14.1, 15.1, 17.1, 22.3_

- [ ] 25. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use the `hypothesis` library (Python) and map 1-to-1 to the 27 correctness properties in the design document
- Frontend tests use Vitest + React Testing Library; E2E tests use Playwright
- Checkpoints at tasks 4, 9, 13, and 25 ensure incremental validation before moving to the next domain
