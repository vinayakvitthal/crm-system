import type { Page } from '@playwright/test';

/**
 * Shared helpers for authenticated pages (AppShell).
 */
export class AppPage {
  constructor(protected page: Page) {}

  /** Click a sidebar nav link by its label text. */
  async navigateTo(label: string) {
    await this.page.click(`nav a:has-text("${label}")`);
  }

  /** Click the Logout button in the sidebar. */
  async logout() {
    await this.page.click('button:has-text("Logout")');
  }

  /** Wait until the sidebar is visible (i.e. user is authenticated). */
  async waitForShell() {
    await this.page.waitForSelector('aside', { timeout: 10_000 });
  }
}
