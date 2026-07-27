import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

// 1x1 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('editor image upload renders on card; delete removes it', async ({ page }) => {
  await composeNote(page, { title: 'Picture note', body: 'has a picture' });
  await cardByTitle(page, 'Picture note').click();

  const dialog = page.getByRole('dialog');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Add image' }).click();
  await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });

  await expect(dialog.locator('img[src*="/api/attachments/"]')).toBeVisible();
  await page.keyboard.press('Escape');

  // Card shows the thumb.
  await expect(cardRootByTitle(page, 'Picture note').locator('img[src*="/thumb"]')).toBeVisible();

  // Search by type image finds it.
  await page.getByRole('textbox', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'Images' }).click();
  await expect(cardByTitle(page, 'Picture note')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();

  // Delete from the editor.
  await cardByTitle(page, 'Picture note').click();
  await dialog.locator('img[src*="/api/attachments/"]').hover();
  await dialog.getByRole('button', { name: 'Remove image' }).click();
  await expect(dialog.locator('img[src*="/api/attachments/"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('composer "New note with image" creates an image note', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'New note with image' }).click();
  await (await chooser).setFiles({ name: 'seed.png', mimeType: 'image/png', buffer: PNG });

  await expect(page.locator('[data-note-id] img[src*="/thumb"]')).toBeVisible();
});
