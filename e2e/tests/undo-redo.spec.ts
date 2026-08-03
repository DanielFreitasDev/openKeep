import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

/** Compose a list note with the given rows through the "New list" composer. */
async function composeList(page: Page, title: string, items: string[]) {
  await page.getByRole('button', { name: 'New list' }).click();
  const titleField = page.getByLabel('Title', { exact: true });
  await titleField.click();
  await titleField.pressSequentially(title);
  for (const [i, text] of items.entries()) {
    if (i > 0) await page.getByRole('textbox', { name: 'List item' }).last().press('Enter');
    await page.getByRole('textbox', { name: 'List item' }).last().fill(text);
  }
  await page.locator('main').getByRole('button', { name: 'Close' }).click();
  await expect(cardByTitle(page, title)).toBeVisible();
}

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('session undo/redo takes back a title edit, and what is left is what saves', async ({
  page,
}) => {
  await composeNote(page, { title: 'Grocery run', body: 'milk' });

  await cardByTitle(page, 'Grocery run').click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByLabel('Title', { exact: true });
  await title.click();
  await title.fill('Grocery run — Saturday');

  await title.press('Control+z');
  await expect(title).toHaveValue('Grocery run');
  await title.press('Control+y');
  await expect(title).toHaveValue('Grocery run — Saturday');
  await title.press('Control+z');
  await expect(title).toHaveValue('Grocery run');

  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && /\/api\/notes\/[^/]+$/.test(r.url()),
  );
  await page.keyboard.press('Escape');
  await saved;
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(cardByTitle(page, 'Grocery run')).toBeVisible();
});

test('session undo brings a deleted list item back, as a row the server keeps', async ({
  page,
}) => {
  await composeList(page, 'Packing', ['Passport', 'Charger']);

  await cardByTitle(page, 'Packing').click();
  const dialog = page.getByRole('dialog');
  const rows = dialog.getByRole('textbox', { name: 'List item' });
  await expect(rows).toHaveCount(2);

  await dialog.getByRole('button', { name: 'Delete item' }).nth(1).click();
  await expect(rows).toHaveCount(1);

  // Undo recreates the row server-side, so a reload has to still show it.
  const recreated = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/items'),
  );
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toHaveValue('Charger');
  await recreated;

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await cardByTitle(page, 'Packing').click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toHaveValue('Charger');
});

test('splitting a row with Enter is one undo step', async ({ page }) => {
  await composeList(page, 'Reading', ['Dracula']);

  await cardByTitle(page, 'Reading').click();
  const dialog = page.getByRole('dialog');
  const rows = dialog.getByRole('textbox', { name: 'List item' });
  await rows.first().click();
  await rows.first().press('Home');
  await rows.first().press('ArrowRight');
  await rows.first().press('ArrowRight');
  await rows.first().press('ArrowRight');
  await rows.first().press('Enter');
  await expect(rows).toHaveCount(2);

  // The two halves of the split (shortening one row, adding another) landed
  // together, so they come back together.
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveValue('Dracula');
  await page.keyboard.press('Escape');
});

test('session undo walks back over item text and a check, and stops at the top', async ({
  page,
}) => {
  await composeList(page, 'Chores', ['Dishes']);

  await cardByTitle(page, 'Chores').click();
  const dialog = page.getByRole('dialog');
  const rows = dialog.getByRole('textbox', { name: 'List item' });
  const undo = dialog.getByRole('button', { name: 'Undo', exact: true });
  const redo = dialog.getByRole('button', { name: 'Redo', exact: true });

  // Nothing has happened this session yet.
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await rows.first().click();
  await rows.first().fill('Dishes and pans');
  await dialog.getByRole('checkbox', { name: 'Dishes and pans' }).check();
  await expect(dialog.getByText('1 Completed item', { exact: true })).toBeVisible();

  await undo.click();
  await expect(dialog.getByText('Completed item')).toHaveCount(0);
  await undo.click();
  await expect(rows.first()).toHaveValue('Dishes');
  await expect(undo).toBeDisabled();

  await redo.click();
  await expect(rows.first()).toHaveValue('Dishes and pans');
  await page.keyboard.press('Escape');
});
