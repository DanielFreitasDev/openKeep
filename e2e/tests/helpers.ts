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

/**
 * Create a note through the composer, waiting until the card appears.
 *
 * The title is typed key by key rather than `fill()`ed, and then read back
 * *after* the body has been typed. Both halves of that are load-flakiness
 * lessons: the composer keeps its title in React state (the body it reads off
 * the editor instance at save time), and a full-suite run occasionally
 * committed a note whose POST carried `"title": ""` while the body was intact —
 * the typed value had never reached state. Typing produces one event per
 * character instead of one bulk insert, and since the field is controlled, a
 * value that survives the render the body triggers is a value state agrees
 * with. Assert it here and a lost title fails loudly, before a note exists.
 */
export async function composeNote(page: Page, { title, body }: { title?: string; body?: string }) {
  await page.getByLabel('Take a note…').click();
  const titleField = page.getByLabel('Title', { exact: true });
  if (title) {
    await titleField.click();
    await titleField.pressSequentially(title);
  }
  if (body) await page.getByRole('textbox', { name: 'Take a note…' }).fill(body);
  if (title) {
    try {
      await expect(titleField).toHaveValue(title);
    } catch (err) {
      // Three explanations were tried and refuted for the lost title (React
      // dropping a controlled input's update, the composer stealing focus into
      // the body as it expands, and the plain sequence under CPU load — see the
      // commit that added this). So if it happens again, capture what tells the
      // rest apart: where the keystrokes went, and whether the draft mirror —
      // written from the same React state the save reads — ever saw the title.
      // Evaluated as source text: this package has no DOM lib (the a11y spec's
      // animation guard is written the same way).
      const active = await page.evaluate<string>(
        `(() => { const el = document.activeElement; return el.tagName + ':' + (el.getAttribute('aria-label') || ''); })()`,
      );
      const mirrored = await page.evaluate<string>(
        `localStorage.getItem('openkeep:draft:composer') || 'none'`,
      );
      throw new Error(
        `composeNote("${title}"): the title never came back from state — ` +
          `focus: ${active}, mirrored draft: ${mirrored}\n${String(err)}`,
      );
    }
  }
  await page.locator('main').getByRole('button', { name: 'Close' }).click();
  if (!title) return;

  try {
    await expect(cardByTitle(page, title)).toBeVisible();
  } catch (err) {
    /**
     * A missing card looks the same whatever went wrong, so say which: the
     * composer refusing to commit leaves itself open, one that read its draft
     * as empty says so in a snackbar, and a note committed under the wrong name
     * shows up among the cards. That last one is how the title loss above was
     * found — the board held a card whose whole text was the body.
     */
    const discarded = await page
      .getByText('Empty note discarded')
      .isVisible()
      .catch(() => false);
    const composerStillOpen = await page
      .getByLabel('Title', { exact: true })
      .isVisible()
      .catch(() => false);
    // And what the board does hold: a note created without its title (a typed
    // value the app never committed) is a card that exists under another name,
    // which a missing locator alone cannot tell from no card at all.
    const cards = await page
      .locator('[data-note-id]')
      .allInnerTexts()
      .catch(() => []);
    throw new Error(
      `composeNote("${title}"): the card never appeared — ` +
        `discard snackbar: ${discarded}, composer still open: ${composerStillOpen}, ` +
        `cards on the board: ${JSON.stringify(cards)}\n${String(err)}`,
    );
  }
}

export function cardByTitle(page: Page, title: string) {
  return page.getByRole('button', { name: title, exact: true });
}

/** The card root (for hover-toolbar actions) that contains the given title. */
export function cardRootByTitle(page: Page, title: string) {
  return page.locator('[data-note-id]').filter({ has: cardByTitle(page, title) });
}
