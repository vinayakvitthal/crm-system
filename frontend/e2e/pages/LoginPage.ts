import type { Page } from '@playwright/test';

/**
 * Page Object Model for the Login page.
 */
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async fillEmail(email: string) {
    await this.page.fill('#email', email);
  }

  async fillPassword(password: string) {
    await this.page.fill('#password', password);
  }

  async submit() {
    await this.page.click('button[type="submit"]');
  }

  async login(email: string, password: string) {
    await this.goto();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  /** Returns the text of the first visible error/toast message. */
  async getErrorText(): Promise<string | null> {
    // Sonner toast appears with role="status" or data-sonner-toast
    const toast = this.page.locator('[data-sonner-toast]').first();
    try {
      await toast.waitFor({ timeout: 4000 });
      return toast.textContent();
    } catch {
      return null;
    }
  }

  /** Returns inline field-level error text for the email field. */
  async getEmailError(): Promise<string | null> {
    const el = this.page.locator('#email ~ p.text-destructive, #email + p.text-destructive');
    try {
      await el.waitFor({ timeout: 2000 });
      return el.textContent();
    } catch {
      return null;
    }
  }
}
