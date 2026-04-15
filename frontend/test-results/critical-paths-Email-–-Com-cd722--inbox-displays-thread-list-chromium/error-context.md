# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: critical-paths.spec.ts >> Email – Compose and Send >> email inbox displays thread list
- Location: e2e/critical-paths.spec.ts:676:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
Call log:
  - navigating to "http://localhost:5173/login", waiting until "load"

```

# Test source

```ts
  1  | import type { Page } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Page Object Model for the Login page.
  5  |  */
  6  | export class LoginPage {
  7  |   constructor(private page: Page) {}
  8  | 
  9  |   async goto() {
> 10 |     await this.page.goto('/login');
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
  11 |   }
  12 | 
  13 |   async fillEmail(email: string) {
  14 |     await this.page.fill('#email', email);
  15 |   }
  16 | 
  17 |   async fillPassword(password: string) {
  18 |     await this.page.fill('#password', password);
  19 |   }
  20 | 
  21 |   async submit() {
  22 |     await this.page.click('button[type="submit"]');
  23 |   }
  24 | 
  25 |   async login(email: string, password: string) {
  26 |     await this.goto();
  27 |     await this.fillEmail(email);
  28 |     await this.fillPassword(password);
  29 |     await this.submit();
  30 |   }
  31 | 
  32 |   /** Returns the text of the first visible error/toast message. */
  33 |   async getErrorText(): Promise<string | null> {
  34 |     // Sonner toast appears with role="status" or data-sonner-toast
  35 |     const toast = this.page.locator('[data-sonner-toast]').first();
  36 |     try {
  37 |       await toast.waitFor({ timeout: 4000 });
  38 |       return toast.textContent();
  39 |     } catch {
  40 |       return null;
  41 |     }
  42 |   }
  43 | 
  44 |   /** Returns inline field-level error text for the email field. */
  45 |   async getEmailError(): Promise<string | null> {
  46 |     const el = this.page.locator('#email ~ p.text-destructive, #email + p.text-destructive');
  47 |     try {
  48 |       await el.waitFor({ timeout: 2000 });
  49 |       return el.textContent();
  50 |     } catch {
  51 |       return null;
  52 |     }
  53 |   }
  54 | }
  55 | 
```