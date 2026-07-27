import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Creates a fresh account through the API. The context's request client
 * shares the cookie jar with the browser, so the session applies immediately.
 */
export async function signUpFreshUser(context: BrowserContext, name = 'E2E User'): Promise<string> {
  const email = `e2e-${randomUUID().slice(0, 13)}@example.com`;
  const res = await context.request.post('/api/auth/sign-up/email', {
    data: { email, password: 'password-123', name },
    // Unique client IP per signup: keeps the 10/min/IP auth rate limit out of
    // test runs (trustProxy honors X-Forwarded-For in dev).
    headers: {
      'x-forwarded-for': `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 254 + 1) | 0}`,
    },
  });
  expect(res.ok(), `sign-up failed: ${res.status()}`).toBeTruthy();
  return email;
}

/** Create a note through the composer, waiting until the card appears. */
export async function composeNote(page: Page, { title, body }: { title?: string; body?: string }) {
  await page.getByLabel('Take a note…').click();
  if (title) await page.getByLabel('Title', { exact: true }).fill(title);
  if (body) await page.getByRole('textbox', { name: 'Take a note…' }).fill(body);
  await page.locator('main').getByRole('button', { name: 'Close' }).click();
  if (title) await expect(cardByTitle(page, title)).toBeVisible();
}

export function cardByTitle(page: Page, title: string) {
  return page.getByRole('button', { name: title, exact: true });
}

/** The card root (for hover-toolbar actions) that contains the given title. */
export function cardRootByTitle(page: Page, title: string) {
  return page.locator('[data-note-id]').filter({ has: cardByTitle(page, title) });
}
