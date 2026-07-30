import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

/**
 * Find in note (Ctrl+F) — the search Keep has spent 13 years without.
 *
 * What the assertions watch for: the count spans the whole note (title
 * included), navigation wraps, and Escape belongs to the bar while it is open
 * — the editor also closes on Escape, and that collision is invisible from the
 * code alone.
 */

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('Ctrl+F walks the matches in a text note and Esc keeps the note open', async ({ page }) => {
  await composeNote(page, {
    title: 'Beach trip',
    body: 'pack the beach towel, buy sunscreen, the beach opens at 8',
  });
  await cardByTitle(page, 'Beach trip').click();
  const dialog = page.getByRole('dialog');
  const find = dialog.getByRole('textbox', { name: 'Find in note' });

  await page.keyboard.press('Control+f');
  await expect(find).toBeFocused();

  // Three hits: the title ("Beach trip") and two in the body — accent- and
  // case-insensitive, so lowercase "beach" finds the capitalized title too.
  await find.fill('beach');
  await expect(dialog.getByText('1/3', { exact: true })).toBeVisible();
  await expect(dialog.locator('.find-match')).toHaveCount(2);

  // The title is first in reading order, and it is a textarea: the whole field
  // is the highlight there, the body marks the words themselves.
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveClass(/find-field-current/);
  await expect(dialog.locator('.find-match-current')).toHaveCount(0);

  await find.press('Enter');
  await expect(dialog.getByText('2/3', { exact: true })).toBeVisible();
  await expect(dialog.locator('.find-match-current')).toHaveText('beach');

  // Wrap-around in both directions.
  await find.press('Enter');
  await expect(dialog.getByText('3/3', { exact: true })).toBeVisible();
  await find.press('Enter');
  await expect(dialog.getByText('1/3', { exact: true })).toBeVisible();
  await find.press('Shift+Enter');
  await expect(dialog.getByText('3/3', { exact: true })).toBeVisible();

  await find.fill('kayak');
  await expect(dialog.getByText('No results')).toBeVisible();
  await expect(dialog.locator('.find-match')).toHaveCount(0);

  // Escape closes the bar; the note stays open and unchanged.
  await find.press('Escape');
  await expect(find).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Beach trip');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('find reaches list items, including completed ones', async ({ page }) => {
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Groceries');
  const row = () => page.getByRole('textbox', { name: 'List item' }).last();
  await row().fill('milk');
  await row().press('Enter');
  await row().fill('bread');
  await row().press('Enter');
  await row().fill('almond milk');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();
  await expect(cardByTitle(page, 'Groceries')).toBeVisible();

  await cardByTitle(page, 'Groceries').click();
  const dialog = page.getByRole('dialog');

  // Check "milk" so it drops into the Completed section, then collapse it.
  await dialog.getByRole('checkbox', { name: 'milk', exact: true }).check();
  await expect(dialog.getByText('1 Completed item', { exact: true })).toBeVisible();
  await dialog.getByText('1 Completed item', { exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'List item' })).toHaveCount(2);

  // Opened from the mobile-agnostic overflow menu, not only the shortcut.
  await dialog.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Find in note' }).click();
  const find = dialog.getByRole('textbox', { name: 'Find in note' });
  await find.fill('milk');

  // "almond milk" (open) and the completed "milk" — a hit inside the collapsed
  // section forces it open rather than hiding the match being counted.
  await expect(dialog.getByText('1/2', { exact: true })).toBeVisible();
  await expect(dialog.locator('.find-field')).toHaveCount(2);
  await find.press('Enter');
  await expect(dialog.getByText('2/2', { exact: true })).toBeVisible();
  await expect(dialog.locator('.find-field-current')).toHaveCount(1);

  await find.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
