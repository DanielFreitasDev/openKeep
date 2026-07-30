import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { signUpFreshUser } from './helpers.js';

/**
 * Runs only in the `pwa` project: the share target is a POST the SERVICE
 * WORKER intercepts, so it simply does not exist on the dev server. Here the
 * production build is served by `vite preview` with the real worker active,
 * and the system share sheet is emulated the way the browser performs it —
 * a multipart form submission navigating to /share.
 */

// 1x1 red PNG, as base64 so it can be rebuilt inside the page.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Boots the board and comes back under service-worker control. */
async function bootControlled(page: Page) {
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
  await expect(page.getByLabel('Take a note…')).toBeVisible();
}

/**
 * Submits the multipart form the share sheet would submit. Page code goes in
 * as a string (the e2e tsconfig is Node-flavored, no DOM lib) and the submit
 * runs from a timeout, so `evaluate` resolves before the navigation tears its
 * execution context down.
 */
async function share(
  page: Page,
  fields: { title?: string; text?: string; url?: string; pngName?: string },
) {
  await page.evaluate(`(() => {
    const fields = ${JSON.stringify(fields)};
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/share';
    form.enctype = 'multipart/form-data';
    for (const [name, value] of Object.entries(fields)) {
      if (name === 'pngName') continue;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }
    let fileInput = null;
    if (fields.pngName) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.name = 'files';
      form.append(fileInput);
    }
    document.body.append(form);
    // Only once the input is in the document does the assigned FileList
    // survive into the submission.
    if (fileInput) {
      const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_B64)}), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], fields.pngName, { type: 'image/png' }));
      fileInput.files = data.files;
    }
    setTimeout(() => form.submit(), 0);
  })()`);
}

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await bootControlled(page);
});

test('sharing text and a url creates a note holding both', async ({ page }) => {
  await share(page, {
    title: 'An article',
    text: 'worth reading later',
    url: 'https://example.com/article',
  });

  // /share drains the payload and hands over to the editor on the board.
  await page.waitForURL(/\/\?note=/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('An article');
  await expect(dialog).toContainText('worth reading later');
  await expect(dialog).toContainText('https://example.com/article');

  // Nothing is left behind: reopening /share must not mint a second note.
  await page.keyboard.press('Escape');
  await page.goto('/share');
  await page.waitForURL(/\/$/);
  const notes = await (await page.request.get('/api/notes')).json();
  expect((notes as { title: string }[]).filter((n) => n.title === 'An article')).toHaveLength(1);
});

test('a url that is already inside the shared text is not repeated', async ({ page }) => {
  await share(page, {
    title: 'https://example.com/dup',
    text: 'look at https://example.com/dup',
    url: 'https://example.com/dup',
  });

  await page.waitForURL(/\/\?note=/);
  const dialog = page.getByRole('dialog');
  // The title was only the url again, so it is dropped rather than duplicated.
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('');
  await expect(dialog.getByText('https://example.com/dup')).toHaveCount(1);
});

test('sharing an image creates a note with the image attached', async ({ page }) => {
  await share(page, { title: 'Shared photo', pngName: 'photo.png' });

  await page.waitForURL(/\/\?note=/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Shared photo');
  await expect(dialog.locator('img[src*="/api/attachments/"]')).toBeVisible({ timeout: 15_000 });
});

/**
 * The manifest and the SPA route are two places that drift apart silently:
 * a renamed route leaves the share sheet pointing at a 404.
 */
test('the built manifest declares the share target', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const manifest = (await res.json()) as {
    share_target?: { action: string; method: string; enctype: string };
  };

  expect(manifest.share_target?.action).toBe('/share');
  expect(manifest.share_target?.method).toBe('POST');
  expect(manifest.share_target?.enctype).toBe('multipart/form-data');
});
