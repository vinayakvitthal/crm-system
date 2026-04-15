# Requirements Document

## Introduction

A fully featured, single-company CRM system covering sales pipeline management, customer support ticketing, and general contact/company management. The system serves a single organization with multiple users across four roles: admin, sales_rep, support_agent, and viewer. The backend is a FastAPI modular monolith backed by PostgreSQL; the frontend is a React 18 + TypeScript SPA. Email sync runs as an in-process APScheduler job.

## Glossary

- **System**: The CRM application as a whole (backend API + frontend SPA)
- **API**: The FastAPI backend process
- **Frontend**: The React 18 + TypeScript SPA
- **User**: An authenticated human operator of the system
- **Admin**: A User with the `admin` role — full system access
- **Sales_Rep**: A User with the `sales_rep` role — sales-focused access
- **Support_Agent**: A User with the `support_agent` role — support-focused access
- **Viewer**: A User with the `viewer` role — read-only access
- **JWT**: JSON Web Token used for stateless authentication
- **Access_Token**: Short-lived JWT (15 min) used to authenticate API requests
- **Refresh_Token**: Longer-lived JWT (7 days) stored in an httpOnly cookie
- **Contact**: A CRM record representing an individual person
- **Company**: A CRM record representing an organization
- **Lead**: An unqualified prospect not yet converted to a Contact and Deal
- **Deal**: A sales opportunity linked to a Contact and/or Company within a Pipeline
- **Pipeline**: A named, ordered collection of Stages used to track Deal progression
- **Stage**: A single step within a Pipeline
- **DealHistory**: An immutable audit record of every field change on a Deal
- **Ticket**: A customer support request with a defined status workflow
- **TicketComment**: A threaded reply attached to a Ticket
- **Activity**: A polymorphic CRM event of type call, meeting, note, task, or email_logged
- **EmailThread**: A grouped set of EmailMessages sharing the same conversation
- **EmailMessage**: A single inbound or outbound email message stored in the system
- **EmailCredential**: Per-user encrypted IMAP/SMTP connection settings
- **Scheduler**: The APScheduler instance running inside the API process
- **Fernet**: Symmetric encryption scheme used to encrypt EmailCredentials at rest
- **Kanban_Board**: The frontend drag-and-drop view of Deals grouped by Stage

---

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a user, I want to register, log in, and manage my session securely, so that I can access the CRM with my own identity.

#### Acceptance Criteria

1. WHEN a registration request is submitted with a valid email, full name, and password, THE API SHALL create a new User record and return a success response.
2. WHEN a login request is submitted with a valid email and password, THE API SHALL return an Access_Token and set a Refresh_Token in an httpOnly cookie.
3. WHEN a login request is submitted with an invalid email or incorrect password, THE API SHALL return a 401 response with the error envelope `{ "error": "unauthorized", "detail": "..." }`.
4. WHEN a valid Refresh_Token is presented to the refresh endpoint, THE API SHALL issue a new Access_Token.
5. WHEN an expired or invalid Refresh_Token is presented to the refresh endpoint, THE API SHALL return a 401 response.
6. WHEN a logout request is received, THE API SHALL invalidate the Refresh_Token so it cannot be reused.
7. THE API SHALL hash all passwords using bcrypt with a cost factor of at least 12 before storing them.
8. THE Access_Token SHALL expire after 15 minutes.
9. THE Refresh_Token SHALL expire after 7 days.

### Requirement 2: Password Reset

**User Story:** As a user, I want to reset my password via email, so that I can regain access if I forget my credentials.

#### Acceptance Criteria

1. WHEN a password-reset request is submitted with a registered email address, THE API SHALL send a password-reset link to that address.
2. WHEN a password-reset confirmation is submitted with a valid reset token and a new password, THE API SHALL update the User's password hash and invalidate the reset token.
3. WHEN a password-reset confirmation is submitted with an expired or invalid reset token, THE API SHALL return a 400 response.
4. IF a password-reset request is submitted for an email address that does not exist in the system, THEN THE API SHALL return a success response without revealing whether the address is registered.

### Requirement 3: Role Management

**User Story:** As an admin, I want to assign and change user roles, so that I can control what each team member can do in the system.

#### Acceptance Criteria

1. WHEN an Admin requests the team member list, THE API SHALL return all Users with their current roles.
2. WHEN an Admin submits a role-change request for a User, THE API SHALL update that User's role to the specified value.
3. WHEN a non-Admin User requests the team member list or submits a role-change request, THE API SHALL return a 403 response.
4. THE API SHALL enforce role-based access control via dependency injection on every route handler.
5. THE System SHALL support exactly four roles: admin, sales_rep, support_agent, and viewer.

### Requirement 4: Contact Management

**User Story:** As a sales rep or support agent, I want to create, view, update, and delete contact records, so that I can maintain accurate information about the people I work with.

#### Acceptance Criteria

1. WHEN an authenticated User with write access submits a create-contact request with a first name, last name, and email, THE API SHALL create and return the new Contact record.
2. WHEN an authenticated User requests a Contact by ID, THE API SHALL return the Contact record if it exists.
3. WHEN an authenticated User with write access submits an update-contact request, THE API SHALL apply the changes and return the updated Contact.
4. WHEN an Admin or the owning User submits a delete-contact request, THE API SHALL remove the Contact record.
5. WHEN a Viewer requests a Contact, THE API SHALL return the Contact in read-only form and SHALL NOT permit create, update, or delete operations.
6. IF a requested Contact ID does not exist, THEN THE API SHALL return a 404 response.
7. WHEN a search or filter request is submitted against contacts, THE API SHALL return only Contacts matching all supplied filter criteria.

### Requirement 5: Company Management

**User Story:** As a sales rep, I want to manage company records and associate contacts with them, so that I can track organizational relationships.

#### Acceptance Criteria

1. WHEN an authenticated User with write access submits a create-company request with a name, THE API SHALL create and return the new Company record.
2. WHEN an authenticated User requests a Company by ID, THE API SHALL return the Company record if it exists.
3. WHEN an authenticated User with write access submits an update-company request, THE API SHALL apply the changes and return the updated Company.
4. WHEN an Admin or the owning User submits a delete-company request, THE API SHALL remove the Company record.
5. IF a requested Company ID does not exist, THEN THE API SHALL return a 404 response.

### Requirement 6: Contact Merge

**User Story:** As a sales rep, I want to merge duplicate contact records, so that I can keep the CRM data clean and avoid duplicates.

#### Acceptance Criteria

1. WHEN a merge request is submitted identifying a source Contact and a target Contact, THE API SHALL combine the records into a single Contact, preserving all associated Activities, Deals, Tickets, and EmailThreads from both records.
2. WHEN a merge is completed, THE API SHALL delete the source Contact record.
3. WHEN a merge request references a Contact ID that does not exist, THE API SHALL return a 404 response.

### Requirement 7: Contact Timeline

**User Story:** As a sales rep or support agent, I want to view a chronological timeline for a contact, so that I can understand the full history of interactions.

#### Acceptance Criteria

1. WHEN a timeline request is submitted for a Contact, THE API SHALL return a chronologically ordered list of all Activities, EmailThreads, Deals, and Tickets associated with that Contact.
2. WHEN a timeline request is submitted for a Contact with no associated records, THE API SHALL return an empty list.

### Requirement 8: Lead Management

**User Story:** As a sales rep, I want to capture and manage leads, so that I can track prospects before they become qualified opportunities.

#### Acceptance Criteria

1. WHEN an authenticated Sales_Rep or Admin submits a create-lead request with a name and email, THE API SHALL create and return the new Lead record with status `new`.
2. WHEN an authenticated User with lead-write access updates a Lead's status, THE API SHALL persist the new status value.
3. WHEN a Viewer or Support_Agent requests a Lead, THE API SHALL return the Lead in read-only form and SHALL NOT permit create, update, or delete operations.
4. IF a requested Lead ID does not exist, THEN THE API SHALL return a 404 response.

### Requirement 9: Lead Conversion

**User Story:** As a sales rep, I want to convert a qualified lead into a contact and deal in a single action, so that I don't lose data and the transition is seamless.

#### Acceptance Criteria

1. WHEN a lead-conversion request is submitted with a valid Lead ID, pipeline_id, stage_id, and deal_value, THE API SHALL atomically create a Contact from the Lead data, create a Deal linked to that Contact, and update the Lead's status to `qualified` with `converted_at`, `converted_contact_id`, and `converted_deal_id` populated.
2. IF any step of the lead conversion fails, THEN THE API SHALL roll back the entire transaction so that no partial records are created.
3. WHEN a lead-conversion request is submitted for a Lead that has already been converted, THE API SHALL return a 400 response.

### Requirement 10: Pipeline and Stage Management

**User Story:** As an admin, I want to configure sales pipelines and their stages, so that I can model our sales process accurately.

#### Acceptance Criteria

1. WHEN an Admin submits a create-pipeline request with a name, THE API SHALL create and return the new Pipeline record.
2. WHEN an Admin submits a create-stage request for a Pipeline with a name and position, THE API SHALL create and return the new Stage record ordered by position.
3. WHEN an Admin updates a Stage's position, THE API SHALL reorder stages within the Pipeline accordingly.
4. THE System SHALL support exactly one default Pipeline at any time.
5. WHEN a non-Admin attempts to create, update, or delete a Pipeline or Stage, THE API SHALL return a 403 response.

### Requirement 11: Deal Management

**User Story:** As a sales rep, I want to create and manage deals within a pipeline, so that I can track the value and progress of each sales opportunity.

#### Acceptance Criteria

1. WHEN an authenticated Sales_Rep or Admin submits a create-deal request with a title, value, currency, pipeline_id, and stage_id, THE API SHALL create and return the new Deal with status `open`.
2. WHEN an authenticated User with deal-write access updates a Deal's fields, THE API SHALL persist the changes and return the updated Deal.
3. WHEN a Viewer or Support_Agent requests a Deal, THE API SHALL return the Deal in read-only form.
4. IF a requested Deal ID does not exist, THEN THE API SHALL return a 404 response.

### Requirement 12: Deal Stage Transitions

**User Story:** As a sales rep, I want to move deals between pipeline stages (including via drag-and-drop on the Kanban board), so that I can reflect the current state of each opportunity.

#### Acceptance Criteria

1. WHEN a stage-move request is submitted for a Deal with a valid stage_id, THE API SHALL update the Deal's `stage_id` and set `stage_entered_at` to the current timestamp.
2. WHEN a Deal's stage is changed, THE API SHALL insert a DealHistory record capturing the previous stage, the new stage, the User who made the change, and the timestamp.
3. THE Kanban_Board SHALL display all open Deals for a Pipeline grouped by Stage.
4. WHEN a user drags a Deal card to a different Stage column on the Kanban_Board, THE Frontend SHALL issue a stage-move request to the API and re-render the board upon success.

### Requirement 13: Deal Won/Lost

**User Story:** As a sales rep, I want to mark deals as won or lost with a reason, so that I can track outcomes and improve forecasting.

#### Acceptance Criteria

1. WHEN a won request is submitted for an open Deal, THE API SHALL set the Deal's status to `won` and record the `won_lost_reason` if provided.
2. WHEN a lost request is submitted for an open Deal, THE API SHALL set the Deal's status to `lost` and record the `won_lost_reason` if provided.
3. WHEN a won or lost request is submitted for a Deal that is already closed, THE API SHALL return a 400 response.

### Requirement 14: Support Ticket Management

**User Story:** As a support agent, I want to create, view, update, and close support tickets, so that I can track and resolve customer issues.

#### Acceptance Criteria

1. WHEN an authenticated Support_Agent or Admin submits a create-ticket request with a subject, description, and priority, THE API SHALL create and return the new Ticket with status `open`.
2. WHEN an authenticated User with ticket-write access updates a Ticket's fields, THE API SHALL persist the changes and return the updated Ticket.
3. WHEN a Viewer or Sales_Rep requests a Ticket, THE API SHALL return the Ticket in read-only form.
4. IF a requested Ticket ID does not exist, THEN THE API SHALL return a 404 response.
5. THE Ticket SHALL support the following status values: open, in_progress, resolved, closed.
6. THE Ticket SHALL support the following priority values: low, medium, high, urgent.

### Requirement 15: Ticket Status Workflow

**User Story:** As a support agent, I want to transition tickets through a defined status workflow, so that the team always knows where each issue stands.

#### Acceptance Criteria

1. WHEN a status-update request is submitted for a Ticket with a valid status value, THE API SHALL update the Ticket's status.
2. WHEN a Ticket's status is set to `resolved`, THE API SHALL record the `resolved_at` timestamp.
3. WHEN a status-update request is submitted with an invalid status value, THE API SHALL return a 422 response.

### Requirement 16: Ticket Assignment

**User Story:** As an admin or support agent, I want to assign tickets to specific agents, so that responsibility is clear.

#### Acceptance Criteria

1. WHEN an assignment request is submitted for a Ticket with a valid User ID, THE API SHALL set the Ticket's `assigned_to` field to that User.
2. WHEN an assignment request references a User ID that does not exist, THE API SHALL return a 404 response.

### Requirement 17: Ticket Comments

**User Story:** As a support agent, I want to add threaded comments to a ticket, so that the full conversation history is captured in one place.

#### Acceptance Criteria

1. WHEN an authenticated User with ticket-write access submits a comment on a Ticket, THE API SHALL create and return the new TicketComment linked to that Ticket.
2. WHEN a comment list request is submitted for a Ticket, THE API SHALL return all TicketComments for that Ticket in chronological order.
3. IF a comment is submitted for a Ticket ID that does not exist, THEN THE API SHALL return a 404 response.

### Requirement 18: Auto-Create Ticket from Email

**User Story:** As a support agent, I want inbound emails to a support inbox to automatically create tickets, so that no customer request is missed.

#### Acceptance Criteria

1. WHEN the Scheduler processes an inbound EmailMessage that matches a designated support inbox address, THE API SHALL automatically create a Ticket linked to the matching Contact (if one exists) with the email subject as the ticket subject.
2. WHEN an auto-created Ticket's Contact cannot be matched by email address, THE API SHALL create the Ticket without a Contact link.

### Requirement 19: Activity Management

**User Story:** As a sales rep or support agent, I want to log activities (calls, meetings, notes, tasks, and emails) against contacts, deals, or tickets, so that all interactions are recorded in one place.

#### Acceptance Criteria

1. WHEN an authenticated User submits a create-activity request with a type, subject, and at least one entity link (contact_id, deal_id, or ticket_id), THE API SHALL create and return the new Activity record.
2. WHEN an authenticated User requests an Activity by ID, THE API SHALL return the Activity record.
3. WHEN an authenticated User with write access updates an Activity, THE API SHALL persist the changes.
4. WHEN an authenticated User requests the activity feed, THE API SHALL return Activities sorted by `created_at` descending across all linked entities.
5. THE Activity type SHALL be one of: call, meeting, note, task, email_logged.
6. IF a create-activity request is submitted without any entity link, THEN THE API SHALL return a 422 response.

### Requirement 20: Email Credential Management

**User Story:** As a user, I want to save my IMAP and SMTP credentials so that the system can sync my email automatically.

#### Acceptance Criteria

1. WHEN an authenticated User submits an email-credential save request with IMAP host, IMAP port, SMTP host, SMTP port, username, and password, THE API SHALL encrypt the password using Fernet encryption and store the EmailCredential record.
2. THE API SHALL store the Fernet encryption key exclusively in the `EMAIL_ENCRYPTION_KEY` environment variable and SHALL NOT persist it in the database.
3. WHEN an authenticated User's EmailCredential is updated, THE API SHALL re-encrypt the new password before storing it.

### Requirement 21: Email Inbox Sync

**User Story:** As a user, I want my email inbox to be synced automatically every 2 minutes, so that I can see recent messages without manual refresh.

#### Acceptance Criteria

1. THE Scheduler SHALL poll each User's IMAP server every 2 minutes for unseen messages.
2. WHEN the Scheduler fetches a new EmailMessage, THE API SHALL deduplicate by RFC 2822 Message-ID so that inserting the same message twice results in exactly one EmailMessage record.
3. WHEN the Scheduler matches an inbound EmailMessage sender address to a Contact's email, THE API SHALL link the EmailMessage's thread to that Contact.
4. IF the Scheduler encounters an error syncing a User's mailbox, THEN THE API SHALL log the error with the User ID and timestamp and continue syncing the remaining Users without interruption.
5. WHILE the Scheduler is running, THE API SHALL process sync errors in isolation so that a failure for one User does not affect other Users' sync cycles.

### Requirement 22: Email Thread View and Compose

**User Story:** As a user, I want to read email threads and send or reply to emails from within the CRM, so that I don't need to switch to an external mail client.

#### Acceptance Criteria

1. WHEN an authenticated User requests the inbox, THE API SHALL return a paginated list of EmailThreads sorted by `last_message_at` descending.
2. WHEN an authenticated User requests an EmailThread by ID, THE API SHALL return all EmailMessages in that thread in chronological order.
3. WHEN an authenticated User submits a send-email request, THE API SHALL transmit the message via the User's configured SMTP server and store the outbound EmailMessage.
4. WHEN an authenticated User submits a reply to an EmailThread, THE API SHALL send the reply via SMTP and append the outbound EmailMessage to the thread.
5. WHEN an authenticated User links an EmailThread to a Contact, Deal, or Ticket, THE API SHALL update the thread's link fields accordingly.
6. WHEN a Viewer attempts to access email features, THE API SHALL return a 403 response.

### Requirement 23: Analytics Dashboard

**User Story:** As a user, I want to view KPI metrics and charts for a selected date range, so that I can understand sales and support performance at a glance.

#### Acceptance Criteria

1. WHEN an authenticated User requests KPI metrics with a date range, THE API SHALL return aggregated values for the specified range.
2. WHEN an authenticated User requests the pipeline funnel chart data for a Pipeline and date range, THE API SHALL return deal counts and values grouped by Stage.
3. WHEN an authenticated User requests sales velocity data, THE API SHALL return the average time deals spend in each Stage for the specified Pipeline and date range.
4. WHEN an authenticated User requests ticket resolution time data, THE API SHALL return the average time between Ticket creation and `resolved_at` for the specified date range.
5. WHEN an authenticated User requests the activity breakdown, THE API SHALL return counts of each Activity type for the specified date range.
6. THE Analytics_Dashboard SHALL display KPI cards, a pipeline funnel chart, sales velocity data, ticket resolution time, and an activity breakdown.
7. THE Analytics_Dashboard SHALL provide a date range picker supporting presets of 7d, 30d, and 90d as well as a custom date range.

### Requirement 24: API Error Handling

**User Story:** As a frontend developer, I want all API errors to follow a consistent format, so that I can handle them uniformly in the UI.

#### Acceptance Criteria

1. WHEN the API returns any error response, THE API SHALL use the JSON envelope `{ "error": "<type>", "detail": "<human-readable message>" }`.
2. WHEN an unauthenticated or expired-token request is received, THE API SHALL return a 401 response.
3. WHEN a request is made by a User whose role does not permit the action, THE API SHALL return a 403 response.
4. WHEN a request references a resource that does not exist, THE API SHALL return a 404 response.
5. WHEN a request body fails validation, THE API SHALL return a 422 response.
6. WHEN an unexpected server error occurs, THE API SHALL return a 500 response with detail "Internal server error" and SHALL log the full error server-side.

### Requirement 25: Frontend Error Handling

**User Story:** As a user, I want clear feedback when something goes wrong in the UI, so that I know what happened and what to do next.

#### Acceptance Criteria

1. WHEN the Frontend receives an API error response, THE Frontend SHALL display a toast notification with the error detail.
2. WHEN a form submission fails validation, THE Frontend SHALL display inline error messages at the field level.
3. WHEN a network failure occurs, THE Frontend SHALL display a retry prompt or offline indicator.

### Requirement 26: Security

**User Story:** As a system administrator, I want the CRM to follow security best practices, so that user data and credentials are protected.

#### Acceptance Criteria

1. THE API SHALL load all secrets (DATABASE_URL, JWT_SECRET, EMAIL_ENCRYPTION_KEY) exclusively from environment variables and SHALL NOT hardcode them.
2. THE API SHALL configure CORS to allow only the frontend origin in production.
3. THE Frontend SHALL store the Refresh_Token exclusively in an httpOnly cookie and SHALL NOT expose it to JavaScript.
4. THE API SHALL enforce role-based access control server-side on every route handler, independent of any frontend role gating.
5. WHEN an EmailCredential password is stored or updated, THE API SHALL encrypt it with Fernet before writing it to the database.

### Requirement 27: Deployment

**User Story:** As a developer, I want the system to run locally via Docker Compose, so that I can set up the full stack with a single command.

#### Acceptance Criteria

1. THE System SHALL provide a Docker Compose configuration that starts PostgreSQL, the FastAPI backend, and the React frontend as separate services.
2. WHEN the Docker Compose stack starts, THE System SHALL apply all pending Alembic database migrations automatically before the API begins serving requests.
3. THE System SHALL load all runtime secrets from a `.env` file referenced by the Docker Compose configuration.
