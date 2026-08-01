import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

// 1x1 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The dev instance sets no quota, so what this can assert end to end is the
 * half that exists either way: the account's usage is on screen in Settings,
 * and it follows an upload without a reload — the invalidation is the wiring
 * that would rot silently otherwise (the ceiling itself is covered by the
 * server's quota spec, which can set the env).
 */
test('Settings reports storage, and an upload moves the number', async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();

  const openSettings = async () => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    return page.getByRole('dialog');
  };

  let dialog = await openSettings();
  await expect(dialog.getByText('Storage', { exact: true })).toBeVisible();
  // A brand-new account owns nothing: the line is "0 byte of attachments…".
  await expect(dialog.getByText(/^0 byte/)).toBeVisible();
  await page.keyboard.press('Escape');

  await composeNote(page, { title: 'Picture note', body: 'has a picture' });
  await cardByTitle(page, 'Picture note').click();
  const editor = page.getByRole('dialog');
  const chooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: 'Add image' }).click();
  await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await expect(editor.locator('img[src*="/api/attachments/"]')).toBeVisible();
  await page.keyboard.press('Escape');

  dialog = await openSettings();
  await expect(dialog.getByText(/^0 byte/)).toHaveCount(0);
});
