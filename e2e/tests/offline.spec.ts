import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

/**
 * Offline/flaky-network editing against the dev server (no service worker):
 * the outbox pauses writes while offline and replays on reconnect; the
 * localStorage draft mirror restores what an errored save left behind.
 */

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('offline edit shows the banner, queues and syncs on reconnect', async ({ context, page }) => {
  await composeNote(page, { title: 'Offline sync', body: 'first' });

  await context.setOffline(true);
  await expect(page.getByText("You are offline. Changes can't be saved right now.")).toBeVisible();

  await cardByTitle(page, 'Offline sync').click();
  const dialog = page.getByRole('dialog');
  const body = dialog.locator('.note-editor [contenteditable="true"]');
  await body.click();
  await page.keyboard.type(' typed offline');
  await page.waitForTimeout(700); // autosave debounce → paused mutation
  await dialog.getByRole('button', { name: 'Close' }).click();

  await context.setOffline(false);
  await expect(page.getByText("You are offline. Changes can't be saved right now.")).toHaveCount(0);

  await expect
    .poll(
      async () => {
        const res = await context.request.get('/api/notes');
        const notes = (await res.json()) as { title: string; bodyHtml: string }[];
        return notes.find((n) => n.title === 'Offline sync')?.bodyHtml ?? '';
      },
      { timeout: 15_000 },
    )
    .toContain('typed offline');
});

test('a save that errors out leaves a draft that is restored after reload', async ({
  context,
  page,
}) => {
  await composeNote(page, { title: 'Draft restore', body: 'original' });

  // Server unreachable while the browser still thinks it is online.
  await context.route('**/api/notes/*', (route) =>
    route.request().method() === 'PATCH' ? route.abort('internetdisconnected') : route.continue(),
  );

  await cardByTitle(page, 'Draft restore').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill('Draft restore edited');
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Three transport retries with backoff (~7 s), then the failure surfaces.
  await expect(page.getByText('Changes could not be saved.')).toBeVisible({ timeout: 20_000 });

  await context.unroute('**/api/notes/*');
  await page.reload();
  await expect(page.getByText('Restoring unsaved changes…')).toBeVisible({ timeout: 10_000 });
  await expect(cardByTitle(page, 'Draft restore edited')).toBeVisible();

  await expect
    .poll(
      async () => {
        const res = await context.request.get('/api/notes');
        const notes = (await res.json()) as { title: string }[];
        return notes.some((n) => n.title === 'Draft restore edited');
      },
      { timeout: 15_000 },
    )
    .toBe(true);
});

test('a note composed while the server is unreachable is recreated after reload', async ({
  context,
  page,
}) => {
  await context.route('**/api/notes', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  );

  await page.getByLabel('Take a note…').click();
  await page.getByLabel('Title', { exact: true }).fill('Ghost note');
  await page.getByRole('textbox', { name: 'Take a note…' }).fill('typed before the failure');
  await page.waitForTimeout(500); // composer draft mirror (300 ms trailing)
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await expect(page.getByText('Changes could not be saved.')).toBeVisible({ timeout: 20_000 });
  await context.unroute('**/api/notes');

  await page.reload();
  await expect(page.getByText('Restoring unsaved changes…')).toBeVisible({ timeout: 10_000 });
  await expect(cardByTitle(page, 'Ghost note')).toBeVisible({ timeout: 10_000 });

  await expect
    .poll(
      async () => {
        const res = await context.request.get('/api/notes');
        const notes = (await res.json()) as { title: string; bodyHtml: string }[];
        return notes.find((n) => n.title === 'Ghost note')?.bodyHtml ?? '';
      },
      { timeout: 15_000 },
    )
    .toContain('typed before the failure');
});
