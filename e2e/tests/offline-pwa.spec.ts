import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

/**
 * Runs only in the `pwa` project: the production build served by `vite
 * preview` (:4173), so the real service worker is active and an OFFLINE
 * reload exercises precache + NetworkFirst reads + the draft paint — the
 * exact "wrote offline, reloaded, lost it" report.
 *
 * CDP quirk: after a reload of an SW-controlled page, emulated offline no
 * longer reflects in navigator.onLine (real OS offline does). The banner is
 * therefore asserted only before the reload, and reconnect goes through a
 * fresh reload — which is precisely the reported user flow.
 */

test('an edit made offline survives an offline reload and syncs after reconnect', async ({
  context,
  page,
}) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
  // The e2e tsconfig is Node-flavored; Node's Navigator type has no serviceWorker.
  await page.evaluate(() =>
    (
      navigator as unknown as { serviceWorker: { ready: Promise<unknown> } }
    ).serviceWorker.ready.then(() => undefined),
  );
  // The first load is not SW-controlled (no clientsClaim); reload under control.
  await page.reload();
  await composeNote(page, { title: 'PWA offline', body: 'first' });
  // Fresh boot so the corpus GET (now including the note) lands in api-reads.
  await page.reload();
  await expect(cardByTitle(page, 'PWA offline')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("You are offline. Changes can't be saved right now.")).toBeVisible();

  await cardByTitle(page, 'PWA offline').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill('PWA offline edited');
  await page.waitForTimeout(900); // debounce flush → paused mutation → outbox write
  await dialog.getByRole('button', { name: 'Close' }).click();
  // The editor morphs back onto its card; reloading mid-morph would keep
  // ?note= in the URL and boot straight back into the editor.
  await expect(dialog).toHaveCount(0);

  // Reload while still offline: the SW serves the shell and the cached
  // corpus, and the local draft paints the edit over it — nothing is lost.
  await page.reload();
  await expect(cardByTitle(page, 'PWA offline edited')).toBeVisible({ timeout: 10_000 });

  // The reported scenario: the connection returns and the user reloads.
  await context.setOffline(false);
  await page.reload();
  await expect(cardByTitle(page, 'PWA offline edited')).toBeVisible({ timeout: 10_000 });

  await expect
    .poll(
      async () => {
        const res = await context.request.get('/api/notes');
        if (!res.ok()) return false;
        const notes = (await res.json()) as { title: string }[];
        return notes.some((n) => n.title === 'PWA offline edited');
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});
