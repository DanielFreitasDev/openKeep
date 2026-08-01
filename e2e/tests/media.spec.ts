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

test('editor file attachment becomes a download chip on the card', async ({ page }) => {
  await composeNote(page, { title: 'Contract note', body: 'has a document' });
  await cardByTitle(page, 'Contract note').click();

  const dialog = page.getByRole('dialog');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Attach file' }).click();
  // A real PDF head: the server decides the type from the bytes, not the name.
  await (await chooser).setFiles({
    name: 'Orçamento.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]),
  });

  const chip = dialog.getByRole('link', { name: /Orçamento\.pdf/ });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('download', 'Orçamento.pdf');
  await page.keyboard.press('Escape');

  // The card carries the same chip.
  await expect(
    cardRootByTitle(page, 'Contract note').getByRole('link', { name: /Orçamento\.pdf/ }),
  ).toBeVisible();

  // Search by type finds it.
  await page.getByRole('textbox', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'Files' }).click();
  await expect(cardByTitle(page, 'Contract note')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();

  // Removing it from the editor takes the chip with it.
  await cardByTitle(page, 'Contract note').click();
  await dialog.getByRole('button', { name: 'Remove file' }).click();
  await expect(dialog.getByRole('link', { name: /Orçamento\.pdf/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('an unsupported file is refused with a message, not silently', async ({ page }) => {
  await composeNote(page, { title: 'Refused note', body: 'nothing attached' });
  await cardByTitle(page, 'Refused note').click();

  const dialog = page.getByRole('dialog');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Attach file' }).click();
  await (await chooser).setFiles({
    name: 'page.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('<h1>not a pdf at all</h1>'),
  });

  await expect(page.getByText(/Unsupported file type/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: /page\.pdf/ })).toHaveCount(0);
});

test('composer previews a picked image before the note is saved', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await page.getByLabel('Title', { exact: true }).fill('Preview note');
  await page.getByRole('textbox', { name: 'Take a note…' }).fill('body typed before the image');

  const composer = page.locator('main');
  const chooser = page.waitForEvent('filechooser');
  await composer.getByRole('button', { name: 'Add image' }).click();
  await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });

  // Local preview, no upload yet — the note does not exist server-side.
  const preview = composer.locator('img[src^="blob:"]');
  await expect(preview).toBeVisible();

  // Removing it drops the preview; re-picking brings a fresh one back.
  await preview.hover();
  await composer.getByRole('button', { name: 'Remove image' }).click();
  await expect(composer.locator('img[src^="blob:"]')).toHaveCount(0);

  const rechooser = page.waitForEvent('filechooser');
  await composer.getByRole('button', { name: 'Add image' }).click();
  await (await rechooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await expect(composer.locator('img[src^="blob:"]')).toBeVisible();

  // Saving uploads the held file and the card shows the stored thumb.
  await composer.getByRole('button', { name: 'Close' }).click();
  await expect(cardRootByTitle(page, 'Preview note').locator('img[src*="/thumb"]')).toBeVisible();
});

test('composer "New note with image" expands with the image held', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'New note with image' }).click();
  await (await chooser).setFiles({ name: 'seed.png', mimeType: 'image/png', buffer: PNG });

  // The composer expands showing a local preview — the note does not exist yet.
  const composer = page.locator('main');
  await expect(composer.locator('img[src^="blob:"]')).toBeVisible();
  await expect(page.locator('[data-note-id]')).toHaveCount(0);

  // Saving uploads the held file and the card shows the stored thumb.
  await composer.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-note-id] img[src*="/thumb"]')).toBeVisible();
});
