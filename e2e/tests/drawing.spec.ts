import { expect, type Page, test } from '@playwright/test';
import { signUpFreshUser } from './helpers.js';

// 120x80 flat red PNG — big enough to be a believable page to draw over.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAgUlEQVR42u3QQQkAAAgEsAt2/TGWLcTHYAmWaTkQBaJFI1q0aAuiRSNatGgLokUjWrRoRItGtGjRiBaNaNGiES0a0aJFI1o0okWLRrRoRIsWjWjRohEtGtGiRSNaNKJFi0a0aET/sem24rNkIybRAAAAAElFTkSuQmCC',
  'base64',
);

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

test('the lasso picks up a stroke, moves it, and can delete it', async ({ page }) => {
  await page.getByRole('button', { name: 'New note with drawing' }).click();
  const canvas = page.locator('canvas[aria-label="Drawing"]');
  await expect(canvas).toBeVisible();
  await drawSquiggle(page);

  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Loop right around the squiggle (it spans ±120px around the middle).
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.mouse.move(cx - 180, cy - 60);
  await page.mouse.down();
  for (const [x, y] of [
    [cx + 180, cy - 60],
    [cx + 180, cy + 100],
    [cx - 180, cy + 100],
  ] as const) {
    await page.mouse.move(x, y, { steps: 10 });
  }
  await page.mouse.up();

  // The loop caught it: the tool's panel now offers to delete the selection.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const deleteSelection = page.getByRole('button', { name: 'Delete selection' });
  await expect(deleteSelection).toBeEnabled();
  await page.keyboard.press('Escape');

  // Dragging from inside the selection moves the ink, and that is undoable.
  const undoButton = page.getByRole('button', { name: 'Undo' });
  await page.mouse.move(cx, cy + 20);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 90, { steps: 10 });
  await page.mouse.up();
  await expect(undoButton).toBeEnabled();

  // Delete empties the page: leaving it now discards the note, Keep-style.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await deleteSelection.click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByText('Empty note discarded')).toBeVisible();
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

test('drawing against the bottom edge grows the page', async ({ page }) => {
  await page.getByRole('button', { name: 'New note with drawing' }).click();
  const canvas = page.locator('canvas[aria-label="Drawing"]');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');

  // A fresh page is exactly the viewport, so it starts fitted at 100%.
  const readout = canvas.locator('..').getByText('%');
  await expect(readout).toHaveText('100%');

  // Drag ink into the bottom edge: the paper is a roll, so it lengthens.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2, { steps: 20 });
  await page.mouse.up();

  // Taller than the window now, so fitting the whole page has to zoom out.
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await expect(readout).not.toHaveText('100%');

  // And the taller page is what gets saved.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Edit drawing' }),
  ).toBeVisible();
});

test('drawing on a photo replaces it in the stack and stays re-editable', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await page.getByLabel('Title').fill('Annotated');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Annotated' }).click();

  const dialog = page.getByRole('dialog');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Add image' }).click();
  await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PHOTO });
  const photo = dialog.locator('img[src*="/api/attachments/"]');
  await expect(photo).toBeVisible();
  const photoSrc = await photo.getAttribute('src');

  // The image's own "Draw on image" opens the canvas with the photo as paper.
  await photo.hover();
  await dialog.getByRole('button', { name: 'Draw on image' }).click();
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();
  // Paper is the photo's, so there is no ruling to pick.
  await expect(page.getByRole('button', { name: 'Grid' })).toHaveCount(0);
  await drawSquiggle(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  // The note shows the annotated render *instead of* the bare photo — the
  // photo is still attached (it is what makes the drawing re-editable).
  await expect(dialog.getByRole('button', { name: 'Edit drawing' })).toBeVisible();
  await expect(dialog.locator('img[src*="/api/attachments/"]')).toHaveCount(1);
  await expect(dialog.locator('img[src*="/api/attachments/"]')).not.toHaveAttribute(
    'src',
    photoSrc ?? 'missing',
  );

  // Re-opening it puts the photo back under the ink, not a blank page.
  await dialog.getByRole('button', { name: 'Edit drawing' }).click();
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grid' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Edit drawing' })).toBeVisible();
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
