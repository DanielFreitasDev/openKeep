import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

// 1x1 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// A JPEG the way a phone takes one held upright: 120x80 pixels plus an EXIF
// "turn me a quarter", so the picture anybody sees is 80x120.
const SIDEWAYS_JPEG = Buffer.from(
  '/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAHgAAAADoAQAAQAAAFAAAAAAAAAA/+IB8ElDQ19QUk9GSUxFAAEBAAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAsclhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAAAAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAAHABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIAAAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBhcmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb/9sAQwAUDg8SDw0UEhASFxUUGB4yIR4cHB49LC4kMklATEtHQEZFUFpzYlBVbVZFRmSIZW13e4GCgU5gjZeMfZZzfoF8/9sAQwEVFxceGh47ISE7fFNGU3x8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8/8AAEQgAUAB4AwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAE/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABYBAQEBAAAAAAAAAAAAAAAAAAAEBf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJwEreAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//Z',
  'base64',
);

/** What the picture is, against what the page gave it room to be. */
const proportions = (image: Locator) =>
  image.evaluate((el) => {
    const img = el as unknown as { naturalWidth: number; naturalHeight: number };
    const box = el.getBoundingClientRect();
    return { drawn: box.width / box.height, natural: img.naturalWidth / img.naturalHeight };
  });

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

test('a photo the camera turned keeps its own proportions, in the note and on the card', async ({
  page,
}) => {
  await composeNote(page, { title: 'Sideways note', body: 'a photo taken upright' });
  await cardByTitle(page, 'Sideways note').click();

  const dialog = page.getByRole('dialog');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Add image' }).click();
  await (await chooser).setFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: SIDEWAYS_JPEG,
  });

  // Upright, as taken — and given a box of that shape, not one stretched wide
  // by the sideways numbers the file arrived with.
  const image = dialog.locator('img[src*="/api/attachments/"]');
  await expect.poll(async () => (await proportions(image)).natural).toBeCloseTo(80 / 120, 1);
  const inNote = await proportions(image);
  expect(inNote.drawn).toBeCloseTo(inNote.natural, 1);
  await page.keyboard.press('Escape');

  const thumb = cardRootByTitle(page, 'Sideways note').locator('img[src*="/thumb"]');
  await expect.poll(async () => (await proportions(thumb)).natural).toBeCloseTo(80 / 120, 1);
  const onCard = await proportions(thumb);
  expect(onCard.drawn).toBeCloseTo(onCard.natural, 1);
});

test('several images tile into one collage row with the note text below', async ({ page }) => {
  await composeNote(page, { title: 'Album note', body: 'three pictures' });
  await cardByTitle(page, 'Album note').click();

  const dialog = page.getByRole('dialog');
  const images = dialog.locator('img[src*="/api/attachments/"]');
  for (const n of [1, 2, 3]) {
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Add image' }).click();
    await (await chooser).setFiles({ name: `dot${n}.png`, mimeType: 'image/png', buffer: PNG });
    await expect(images).toHaveCount(n);
  }

  // Side by side on one row, not stacked: same top edge, left to right.
  const boxes = await images.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, bottom: r.bottom };
    }),
  );
  expect(boxes.map((b) => Math.round(b.y))).toEqual([
    Math.round(boxes[0]?.y ?? 0),
    Math.round(boxes[0]?.y ?? 0),
    Math.round(boxes[0]?.y ?? 0),
  ]);
  expect((boxes[1]?.x ?? 0) > (boxes[0]?.x ?? 0)).toBe(true);
  expect((boxes[2]?.x ?? 0) > (boxes[1]?.x ?? 0)).toBe(true);

  // And the note itself reads on below the pictures, no scrolling needed.
  const title = await dialog.getByRole('textbox', { name: 'Title' }).boundingBox();
  expect(title?.y ?? 0).toBeGreaterThanOrEqual(boxes[0]?.bottom ?? 0);
  await page.keyboard.press('Escape');

  // Reopened, the note still starts at the top of its pictures — the focus
  // the dialog takes must not scroll them out of view.
  await cardByTitle(page, 'Album note').click();
  await expect(images.first()).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  const imageBox = await images.first().boundingBox();
  expect(imageBox?.y ?? 0).toBeLessThanOrEqual((dialogBox?.y ?? 0) + 2);
  await page.keyboard.press('Escape');
});

test('a picture opens on its own, with the note others an arrow away', async ({ page }) => {
  await composeNote(page, { title: 'Gallery note', body: 'two pictures' });
  await cardByTitle(page, 'Gallery note').click();

  const dialog = page.getByRole('dialog');
  const images = dialog.locator('img[src*="/api/attachments/"]');
  for (const n of [1, 2]) {
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Add image' }).click();
    await (await chooser).setFiles({ name: `dot${n}.png`, mimeType: 'image/png', buffer: PNG });
    await expect(images).toHaveCount(n);
  }
  const first = (await images.first().getAttribute('src')) ?? '';

  // Clicking it puts the picture on screen alone — the editor stands down.
  await images.first().click();
  await expect(page).toHaveURL(/viewer=/);
  const viewed = dialog.locator('img[src*="/api/attachments/"]');
  await expect(viewed).toHaveCount(1);
  await expect(viewed).toHaveAttribute('src', first);
  await expect(dialog.getByRole('button', { name: 'Add image' })).toHaveCount(0);

  // The arrows walk the note's other pictures, and zoom magnifies this one.
  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(viewed).not.toHaveAttribute('src', first);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewed).toHaveAttribute('style', /scale\(1\.25\)/);

  // Esc lands back on the note it came from.
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/viewer=/);
  await expect(dialog.getByRole('button', { name: 'Add image' })).toBeVisible();
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
