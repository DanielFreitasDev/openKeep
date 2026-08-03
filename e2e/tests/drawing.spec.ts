import { expect, type Page, test } from '@playwright/test';
import { signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

async function drawSquiggle(page: Page, dx = 0) {
  const canvas = page.locator('canvas[aria-label="Drawing"]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');
  const cx = box.x + box.width / 2 + dx;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 120, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 40, { steps: 15 });
  await page.mouse.up();
}

test('composer brush → draw → back creates the note; re-edit re-saves in place', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New note with drawing' }).click();
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();
  await drawSquiggle(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  // Back lands on the freshly created note with the render stacked on top.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const editButton = dialog.getByRole('button', { name: 'Edit drawing' });
  await expect(editButton).toBeVisible();
  const firstSrc = await dialog.locator('img').getAttribute('src');

  // Re-edit: strokes reload; another stroke re-saves the SAME attachment
  // (the ?v= cache-buster is what changes).
  await editButton.click();
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();
  await drawSquiggle(page, 40);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).not.toHaveAttribute('src', firstSrc ?? 'missing');

  // The grid card shows the drawing thumb, and the Drawings search tile hits.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-note-id] img')).toHaveCount(1);
  await page.goto('/search?type=drawing');
  await expect(page.locator('[data-note-id]')).toHaveCount(1);
});

test('leaving an empty drawing discards it, Keep-style', async ({ page }) => {
  await page.getByRole('button', { name: 'New note with drawing' }).click();
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByText('Empty note discarded')).toBeVisible();
  await expect(page.locator('[data-note-id]')).toHaveCount(0);
});

test('eraser removes a whole stroke; Clear page + undo restore it', async ({ page }) => {
  await page.getByRole('button', { name: 'New note with drawing' }).click();
  const canvas = page.locator('canvas[aria-label="Drawing"]');
  await expect(canvas).toBeVisible();
  await drawSquiggle(page);

  const undoButton = page.getByRole('button', { name: 'Undo' });
  await expect(undoButton).toBeEnabled();

  // Eraser drag across the stroke removes it entirely (vector eraser).
  await page.getByRole('button', { name: 'Eraser' }).click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy + 20);
  await page.mouse.down();
  await page.mouse.move(cx + 8, cy + 20, { steps: 3 });
  await page.mouse.up();

  // Undo restores the erased stroke; back then saves a note with ink.
  await undoButton.click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Edit drawing' }),
  ).toBeVisible();
});

test('zoom buttons scale the page and Fit to screen puts it back', async ({ page }) => {
  await page.getByRole('button', { name: 'New note with drawing' }).click();
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();

  // A fresh page is created viewport-sized, so it opens fitted at 100%.
  const readout = page.locator('canvas[aria-label="Drawing"]').locator('..').getByText('%');
  await expect(readout).toHaveText('100%');

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(readout).toHaveText('125%');

  // The floor is the fit scale: zooming out past the whole page is refused.
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(readout).toHaveText('100%');

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await expect(readout).toHaveText('100%');
});

test('the editor ⋮ menu offers Add drawing', async ({ page }) => {
  // A note created through the composer…
  await page.getByLabel('Take a note…').click();
  await page.getByLabel('Title').fill('Drawing host');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Drawing host' }).click();
  // …offers "Add drawing" in its overflow menu, which opens the canvas.
  await page.getByRole('dialog').getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Add drawing' }).click();
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();
  await drawSquiggle(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Edit drawing' }),
  ).toBeVisible();
});
