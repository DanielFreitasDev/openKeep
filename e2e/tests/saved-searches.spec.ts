import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('saves the search on screen, reopens it from the sidebar, and removes it', async ({
  page,
}) => {
  await composeNote(page, { title: 'Shopping alpha', body: 'milk and bread' });
  await composeNote(page, { title: 'Other beta', body: 'nothing to buy' });

  const box = page.getByRole('textbox', { name: 'Search' });
  await box.click();
  await box.fill('milk');
  await expect(cardByTitle(page, 'Shopping alpha')).toBeVisible();

  await page.getByRole('button', { name: 'Save search' }).click();
  const nameBox = page.getByRole('textbox', { name: 'Name this search' });
  // The query is what gets offered as a name — it is what was just typed.
  await expect(nameBox).toHaveValue('milk');
  await nameBox.fill('Groceries');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const shortcut = page.getByRole('link', { name: 'Groceries' });
  await expect(shortcut).toBeVisible();

  // Leave the search entirely, then come back through the shortcut.
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
  await shortcut.click();
  await expect(page).toHaveURL(/\/search\?q=milk/);
  await expect(cardByTitle(page, 'Shopping alpha')).toBeVisible();
  await expect(cardByTitle(page, 'Other beta')).toHaveCount(0);

  // One control, two states: the saved search offers its own removal.
  await page.getByRole('button', { name: 'Saved search' }).click();
  await expect(page.getByRole('link', { name: 'Groceries' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save search' })).toBeVisible();
});

test('folds the filter tiles into the saved query', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Search' });
  await box.click();
  await expect(page.getByText('Search operators')).toBeVisible();
  await page.getByRole('button', { name: 'Coral', exact: true }).click();

  await page.getByRole('button', { name: 'Save search' }).click();
  // The tile filter arrives as the operator that means the same thing.
  await expect(page.getByRole('textbox', { name: 'Name this search' })).toHaveValue('color:coral');
  await page.getByRole('textbox', { name: 'Name this search' }).fill('Coral notes');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.goto('/');
  await page.getByRole('link', { name: 'Coral notes' }).click();
  await expect(page).toHaveURL(/q=color%3Acoral/);
  // Restored as the operator chip, since that is what was stored.
  await expect(page.getByText('Color: Coral')).toBeVisible();
});

test('survives a reload — the shortcut lives on the account, not the tab', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Search' });
  await box.click();
  await box.fill('is:pinned');
  await page.getByRole('button', { name: 'Save search' }).click();
  await page.getByRole('textbox', { name: 'Name this search' }).fill('Pinned');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Pinned' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Pinned' })).toBeVisible();
});
