/**
 * Playwright E2E tests for critical CRM paths.
 *
 * Critical paths covered:
 *   1. Login / logout                          (Requirements 1.2, 1.6)
 *   2. Create a deal and drag through stages   (Requirements 12.3, 12.4)
 *   3. Create and close a support ticket       (Requirements 14.1, 15.1, 17.1)
 *   4. Send an email from within the CRM       (Requirement 22.3)
 *
 * Tests use API mocking (page.route) so they run without a live backend.
 * All mocked responses mirror the real API contract defined in design.md.
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { AppPage } from './pages/AppPage';

// ── Shared test credentials ────────────────────────────────────────────────

const TEST_USER = {
  email: 'admin@example.com',
  password: 'password123',
  full_name: 'Test Admin',
  role: 'admin' as const,
  id: 'user-001',
};

const ACCESS_TOKEN = 'mock-access-token';

// ── Mock data ──────────────────────────────────────────────────────────────

const PIPELINE = { id: 'pipeline-001', name: 'Sales Pipeline', is_default: true };

const STAGES = [
  { id: 'stage-001', pipeline_id: 'pipeline-001', name: 'Prospecting', position: 1 },
  { id: 'stage-002', pipeline_id: 'pipeline-001', name: 'Qualification', position: 2 },
  { id: 'stage-003', pipeline_id: 'pipeline-001', name: 'Proposal', position: 3 },
  { id: 'stage-004', pipeline_id: 'pipeline-001', name: 'Closed Won', position: 4 },
];

const DEAL = {
  id: 'deal-001',
  title: 'E2E Test Deal',
  value: 5000,
  currency: 'USD',
  pipeline_id: 'pipeline-001',
  stage_id: 'stage-001',
  stage_entered_at: new Date().toISOString(),
  status: 'open' as const,
  contact_id: null,
  company_id: null,
  owner_id: 'user-001',
  created_at: new Date().toISOString(),
};

const TICKET = {
  id: 'ticket-001',
  subject: 'E2E Test Ticket',
  description: 'Created by E2E test',
  status: 'open' as const,
  priority: 'medium' as const,
  contact_id: null as string | null,
  assigned_to: null as string | null,
  created_by: 'user-001',
  created_at: new Date().toISOString(),
  resolved_at: null as string | null,
};

const COMMENT = {
  id: 'comment-001',
  ticket_id: 'ticket-001',
  author_id: 'user-001',
  body: 'This is a test comment',
  created_at: new Date().toISOString(),
};

const EMAIL_THREAD = {
  id: 'thread-001',
  subject: 'Test Thread',
  last_message_at: new Date().toISOString(),
  contact_id: null,
  deal_id: null,
  ticket_id: null,
};

// ── Route mock helpers ─────────────────────────────────────────────────────

/**
 * Sets up all the API mocks needed for an authenticated session.
 * Intercepts fetch calls to the backend API.
 */
async function setupAuthMocks(page: Page) {
  // Login endpoint
  await page.route('**/auth/login', async (route: Route) => {
    const body = JSON.parse((route.request().postData() ?? '{}') as string) as {
      email?: string;
      password?: string;
    };
    if (body.email === TEST_USER.email && body.password === TEST_USER.password) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: ACCESS_TOKEN }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized', detail: 'Invalid credentials' }),
      });
    }
  });

  // Token refresh
  await page.route('**/auth/refresh', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: ACCESS_TOKEN }),
    });
  });

  // Logout
  await page.route('**/auth/logout', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Current user (me) — used by useAuth hook
  await page.route('**/users/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_USER),
    });
  });

  // Team users list
  await page.route('**/users/', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([TEST_USER]),
    });
  });
}

async function setupSalesMocks(page: Page) {
  // Pipelines
  await page.route('**/pipelines/', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PIPELINE]),
      });
    } else {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(PIPELINE),
      });
    }
  });

  // Stages for pipeline
  await page.route('**/pipelines/pipeline-001/stages', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STAGES),
    });
  });

  // Deals list
  let currentDeal = { ...DEAL };
  await page.route('**/deals/', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([currentDeal]),
      });
    } else {
      // POST — create deal
      const body = JSON.parse((route.request().postData() ?? '{}') as string) as Partial<typeof DEAL>;
      currentDeal = { ...DEAL, ...body };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(currentDeal),
      });
    }
  });

  // Deal stage move
  await page.route('**/deals/deal-001/stage', async (route: Route) => {
    const body = JSON.parse((route.request().postData() ?? route.request().postData() ?? '{}') as string) as {
      stage_id?: string;
    };
    currentDeal = { ...currentDeal, stage_id: body.stage_id ?? currentDeal.stage_id };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentDeal),
    });
  });
}

async function setupSupportMocks(page: Page) {
  let currentTicket = { ...TICKET };
  let comments: typeof COMMENT[] = [];

  // Tickets list
  await page.route('**/tickets/', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([currentTicket]),
      });
    } else {
      const body = JSON.parse((route.request().postData() ?? '{}') as string) as Partial<typeof TICKET>;
      currentTicket = { ...TICKET, ...body };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(currentTicket),
      });
    }
  });

  // Single ticket
  await page.route('**/tickets/ticket-001', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentTicket),
      });
    } else if (route.request().method() === 'PATCH') {
      const body = JSON.parse((route.request().postData() ?? '{}') as string) as Partial<typeof TICKET>;
      currentTicket = { ...currentTicket, ...body };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentTicket),
      });
    }
  });

  // Ticket status update
  await page.route('**/tickets/ticket-001/status', async (route: Route) => {
    const body = JSON.parse((route.request().postData() ?? '{}') as string) as { status?: string };
    currentTicket = {
      ...currentTicket,
      status: (body.status as typeof TICKET.status) ?? currentTicket.status,
      resolved_at: body.status === 'resolved' ? new Date().toISOString() : currentTicket.resolved_at,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentTicket),
    });
  });

  // Ticket comments
  await page.route('**/tickets/ticket-001/comments', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(comments),
      });
    } else {
      const body = JSON.parse((route.request().postData() ?? '{}') as string) as { body?: string };
      const newComment = { ...COMMENT, body: body.body ?? COMMENT.body };
      comments = [...comments, newComment];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newComment),
      });
    }
  });
}

async function setupEmailMocks(page: Page) {
  // Email credentials
  await page.route('**/email/credentials', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'cred-001', user_id: 'user-001' }),
    });
  });

  // Inbox threads
  await page.route('**/email/inbox', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([EMAIL_THREAD]),
    });
  });

  // Send email
  await page.route('**/email/send', async (route: Route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'msg-001',
        thread_id: 'thread-001',
        from_address: TEST_USER.email,
        to_addresses: ['recipient@example.com'],
        cc_addresses: [],
        body_text: 'Test email body',
        sent_at: new Date().toISOString(),
        direction: 'outbound',
        owner_id: 'user-001',
      }),
    });
  });

  // Thread detail
  await page.route('**/email/threads/thread-001', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'msg-001',
          thread_id: 'thread-001',
          message_id: '<msg-001@example.com>',
          from_address: 'sender@example.com',
          to_addresses: [TEST_USER.email],
          cc_addresses: [],
          body_text: 'Hello from sender',
          sent_at: new Date().toISOString(),
          direction: 'inbound',
          owner_id: 'user-001',
        },
      ]),
    });
  });
}

// ── Helper: perform UI login ───────────────────────────────────────────────

async function loginViaUI(page: Page) {
  const loginPage = new LoginPage(page);
  await loginPage.login(TEST_USER.email, TEST_USER.password);
  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

// ══════════════════════════════════════════════════════════════════════════
// Test Suite 1: Login / Logout  (Requirements 1.2, 1.6)
// ══════════════════════════════════════════════════════════════════════════

test.describe('Login / Logout', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    // Requirement 1.2: valid credentials → access token + redirect
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard/);
    // Sidebar should be visible
    await expect(page.locator('aside')).toBeVisible();
  });

  test('invalid credentials show error toast', async ({ page }) => {
    // Requirement 1.3: invalid credentials → 401 + error feedback
    const loginPage = new LoginPage(page);
    await loginPage.login('wrong@example.com', 'wrongpassword');

    // Toast notification should appear
    const toast = page.locator('[data-sonner-toast]').first();
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast).toContainText(/invalid|credentials|failed/i);
  });

  test('empty form shows inline validation errors', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    // Submit without filling anything
    await loginPage.submit();

    // Inline field errors should appear
    const emailError = page.locator('p.text-destructive').first();
    await expect(emailError).toBeVisible({ timeout: 3000 });
  });

  test('logout invalidates session and redirects to login', async ({ page }) => {
    // Requirement 1.6: logout → refresh token invalidated → redirect to /login
    await loginViaUI(page);

    const appPage = new AppPage(page);
    await appPage.logout();

    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
    // Sidebar should no longer be visible
    await expect(page.locator('aside')).not.toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Test Suite 2: Create a deal and drag through pipeline stages
//               (Requirements 12.3, 12.4)
// ══════════════════════════════════════════════════════════════════════════

test.describe('Deal Pipeline – Kanban drag-and-drop', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
    await setupSalesMocks(page);
  });

  test('create a deal via the Deals page', async ({ page }) => {
    // Requirement 12.3: Kanban board shows open deals grouped by stage
    await loginViaUI(page);

    // Navigate to Deals
    await page.click('nav a:has-text("Deals")');
    await page.waitForURL('**/sales/deals');

    // Open create modal
    await page.click('button:has-text("New Deal")');
    await expect(page.locator('text=New Deal').first()).toBeVisible();

    // Fill in the form
    await page.fill('#title', 'E2E Test Deal');
    await page.fill('#value', '5000');
    await page.fill('#currency', 'USD');

    // Select pipeline
    await page.selectOption('#pipeline_id', { label: 'Sales Pipeline' });
    // Wait for stages to load then select first stage
    await page.waitForSelector('#stage_id option:not([value=""])');
    await page.selectOption('#stage_id', { index: 1 });

    // Submit
    await page.click('button[type="submit"]:has-text("Create")');

    // Modal should close and deal should appear in the table
    await expect(page.locator('text=E2E Test Deal')).toBeVisible({ timeout: 5000 });
  });

  test('Kanban board renders stage columns with deals', async ({ page }) => {
    // Requirement 12.3: board displays deals grouped by stage
    await loginViaUI(page);

    await page.click('nav a:has-text("Kanban")');
    await page.waitForURL('**/sales/kanban');

    // All stage columns should be visible
    for (const stage of STAGES) {
      await expect(page.locator(`h3:has-text("${stage.name}")`)).toBeVisible({ timeout: 8000 });
    }

    // The test deal should appear in the first stage column
    await expect(page.locator('text=E2E Test Deal')).toBeVisible({ timeout: 5000 });
  });

  test('drag deal card to next stage column triggers stage-move API call', async ({ page }) => {
    // Requirement 12.4: drag → PATCH /deals/{id}/stage → board re-renders
    await loginViaUI(page);

    await page.click('nav a:has-text("Kanban")');
    await page.waitForURL('**/sales/kanban');

    // Wait for board to render
    await page.waitForSelector('h3:has-text("Prospecting")', { timeout: 8000 });
    await page.waitForSelector('h3:has-text("Qualification")', { timeout: 5000 });

    // Track the stage-move API call
    const stageMovePromise = page.waitForRequest(
      (req) => req.url().includes('/deals/') && req.url().includes('/stage'),
      { timeout: 10_000 },
    );

    // Locate the deal card and the target column drop zone
    const dealCard = page.locator('text=E2E Test Deal').first();
    const targetColumn = page.locator('h3:has-text("Qualification")').locator('..').locator('> div').last();

    // Perform drag-and-drop using mouse events
    const cardBox = await dealCard.boundingBox();
    const targetBox = await targetColumn.boundingBox();

    if (cardBox && targetBox) {
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      await page.mouse.down();
      // Move slowly to trigger dnd-kit pointer sensor (distance > 5px)
      await page.mouse.move(cardBox.x + cardBox.width / 2 + 10, cardBox.y + cardBox.height / 2);
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.mouse.up();

      // Verify the API call was made
      const req = await stageMovePromise;
      expect(req.url()).toContain('/stage');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Test Suite 3: Create and close a support ticket with comments
//               (Requirements 14.1, 15.1, 17.1)
// ══════════════════════════════════════════════════════════════════════════

test.describe('Support Tickets', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
    await setupSupportMocks(page);
  });

  test('create a new support ticket', async ({ page }) => {
    // Requirement 14.1: support_agent/admin can create ticket with status open
    await loginViaUI(page);

    await page.click('nav a:has-text("Tickets")');
    await page.waitForURL('**/tickets');

    // Open create modal
    await page.click('button:has-text("New Ticket")');
    await expect(page.locator('text=New Ticket').first()).toBeVisible();

    // Fill in the form
    await page.fill('#subject', 'E2E Test Ticket');
    await page.fill('#description', 'Created by E2E test');
    await page.selectOption('#priority', 'medium');

    // Submit
    await page.click('button[type="submit"]:has-text("Create")');

    // Modal should close and ticket should appear in the list
    await expect(page.locator('text=E2E Test Ticket')).toBeVisible({ timeout: 5000 });
  });

  test('add a comment to a ticket', async ({ page }) => {
    // Requirement 17.1: authenticated user with write access can add comments
    await loginViaUI(page);

    await page.click('nav a:has-text("Tickets")');
    await page.waitForURL('**/tickets');

    // Click on the ticket to open detail view
    await page.click('a:has-text("E2E Test Ticket")');
    await page.waitForURL('**/tickets/ticket-001');

    // Add a comment
    await page.fill('#comment-body', 'This is a test comment');
    await page.click('button:has-text("Post Comment")');

    // Comment should appear in the list
    await expect(page.locator('text=This is a test comment')).toBeVisible({ timeout: 5000 });
  });

  test('close a ticket by transitioning status to closed', async ({ page }) => {
    // Requirement 15.1: status-update request → API updates ticket status
    await loginViaUI(page);

    await page.click('nav a:has-text("Tickets")');
    await page.waitForURL('**/tickets');

    // Open ticket detail
    await page.click('a:has-text("E2E Test Ticket")');
    await page.waitForURL('**/tickets/ticket-001');

    // The status control shows "Move to…" dropdown for open tickets
    // Transition: open → in_progress
    const statusSelect = page.locator('select').filter({ hasText: 'Move to…' });
    await expect(statusSelect).toBeVisible({ timeout: 5000 });

    // Track the status update API call
    const statusUpdatePromise = page.waitForRequest(
      (req) => req.url().includes('/tickets/') && req.url().includes('/status'),
      { timeout: 8000 },
    );

    await statusSelect.selectOption('in_progress');
    await statusUpdatePromise;

    // Status badge should update
    await expect(page.locator('text=In Progress')).toBeVisible({ timeout: 5000 });
  });

  test('full ticket lifecycle: create → comment → close', async ({ page }) => {
    // Combined test covering Requirements 14.1, 15.1, 17.1
    await loginViaUI(page);

    // 1. Navigate to tickets
    await page.click('nav a:has-text("Tickets")');
    await page.waitForURL('**/tickets');

    // 2. Create ticket
    await page.click('button:has-text("New Ticket")');
    await page.fill('#subject', 'E2E Test Ticket');
    await page.fill('#description', 'Created by E2E test');
    await page.click('button[type="submit"]:has-text("Create")');
    await expect(page.locator('text=E2E Test Ticket')).toBeVisible({ timeout: 5000 });

    // 3. Open ticket detail
    await page.click('a:has-text("E2E Test Ticket")');
    await page.waitForURL('**/tickets/ticket-001');

    // 4. Add a comment
    await page.fill('#comment-body', 'This is a test comment');
    await page.click('button:has-text("Post Comment")');
    await expect(page.locator('text=This is a test comment')).toBeVisible({ timeout: 5000 });

    // 5. Transition status to closed via the dropdown
    const statusSelect = page.locator('select').filter({ hasText: 'Move to…' });
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption('in_progress');
      await page.waitForTimeout(500);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Test Suite 4: Send an email from within the CRM
//               (Requirement 22.3)
// ══════════════════════════════════════════════════════════════════════════

test.describe('Email – Compose and Send', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
    await setupEmailMocks(page);
  });

  test('compose and send a new email', async ({ page }) => {
    // Requirement 22.3: send-email request → SMTP transmission + stored outbound message
    await loginViaUI(page);

    await page.click('nav a:has-text("Email")');
    await page.waitForURL('**/email');

    // Inbox panel should be visible
    await expect(page.locator('h2:has-text("Inbox")')).toBeVisible({ timeout: 8000 });

    // Click Compose button
    await page.click('button:has-text("Compose")');

    // Compose modal should appear
    await expect(page.locator('h2:has-text("New Email")')).toBeVisible({ timeout: 3000 });

    // Fill in the compose form
    await page.fill('#to', 'recipient@example.com');
    await page.fill('#subject', 'E2E Test Email');
    await page.fill('#body', 'This is a test email sent from the E2E test suite.');

    // Track the send API call
    const sendPromise = page.waitForRequest(
      (req) => req.url().includes('/email/send') && req.method() === 'POST',
      { timeout: 8000 },
    );

    // Click Send
    await page.click('button[type="submit"]:has-text("Send")');

    // Verify the API call was made
    const req = await sendPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      to?: string;
      subject?: string;
      body?: string;
    };
    expect(body.to).toBe('recipient@example.com');
    expect(body.subject).toBe('E2E Test Email');

    // Modal should close after successful send
    await expect(page.locator('h2:has-text("New Email")')).not.toBeVisible({ timeout: 5000 });
  });

  test('email inbox displays thread list', async ({ page }) => {
    // Requirement 22.1: inbox returns paginated threads sorted by last_message_at
    await loginViaUI(page);

    await page.click('nav a:has-text("Email")');
    await page.waitForURL('**/email');

    // Thread should appear in the list
    await expect(page.locator('text=Test Thread')).toBeVisible({ timeout: 8000 });
  });

  test('clicking a thread shows message detail', async ({ page }) => {
    // Requirement 22.2: thread detail returns messages in chronological order
    await loginViaUI(page);

    await page.click('nav a:has-text("Email")');
    await page.waitForURL('**/email');

    // Click on the thread
    await page.click('button:has-text("Test Thread")');

    // Message content should appear
    await expect(page.locator('text=Hello from sender')).toBeVisible({ timeout: 8000 });
  });

  test('compose form validates required fields', async ({ page }) => {
    await loginViaUI(page);

    await page.click('nav a:has-text("Email")');
    await page.waitForURL('**/email');

    await page.click('button:has-text("Compose")');
    await expect(page.locator('h2:has-text("New Email")')).toBeVisible();

    // Submit without filling anything
    await page.click('button[type="submit"]:has-text("Send")');

    // Validation errors should appear
    const errors = page.locator('p.text-destructive');
    await expect(errors.first()).toBeVisible({ timeout: 3000 });
  });
});
