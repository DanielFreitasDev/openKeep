import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

/** Save a note as a template through its card menu. */
async function saveAsTemplate(page: import('@playwright/test').Page, title: string) {
  await cardRootByTitle(page, title).hover();
  await cardRootByTitle(page, title).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save as template' }).click();
}

test('a note saved as a template leaves the board for the shelf, and comes back', async ({
  page,
}) => {
  await composeNote(page, { title: 'Meeting minutes', body: 'Attendees:' });
  await composeNote(page, { title: 'Plain note', body: 'stays put' });

  // No shelf, no row: the sidebar earns it only once there is a template.
  await expect(page.getByRole('link', { name: 'Templates' })).toHaveCount(0);

  await saveAsTemplate(page, 'Meeting minutes');

  // The note is gone from the board and the row has appeared.
  await expect(cardByTitle(page, 'Meeting minutes')).toHaveCount(0);
  await expect(cardByTitle(page, 'Plain note')).toBeVisible();
  const shelf = page.getByRole('link', { name: 'Templates' });
  await expect(shelf).toBeVisible();

  await shelf.click();
  await expect(page).toHaveURL(/\/templates/);
  await expect(cardByTitle(page, 'Meeting minutes')).toBeVisible();
  await expect(cardByTitle(page, 'Plain note')).toHaveCount(0);

  // The same menu item is the way back, and the row goes with the last template.
  await cardRootByTitle(page, 'Meeting minutes').hover();
  await cardRootByTitle(page, 'Meeting minutes')
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Remove from templates' }).click();
  await expect(cardByTitle(page, 'Meeting minutes')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Templates' })).toHaveCount(0);

  await page.goto('/');
  await expect(cardByTitle(page, 'Meeting minutes')).toBeVisible();
});

test('starting a note from a template opens a copy on the board, leaving the template alone', async ({
  page,
}) => {
  await composeNote(page, { title: 'Weekly review', body: 'What went well?' });
  await saveAsTemplate(page, 'Weekly review');

  // The composer offers the shelf once it has something on it.
  await page.getByRole('button', { name: 'New from template' }).click();
  await page.getByRole('button', { name: 'Weekly review' }).click();

  // The editor opens on the new note — a copy, on the board.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Weekly review');
  await expect(dialog).toContainText('What went well?');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await expect(page).toHaveURL(/^[^?]*\/(\?|$)/);
  await expect(cardByTitle(page, 'Weekly review')).toBeVisible();

  // And the template is still on the shelf, by itself.
  await page.getByRole('link', { name: 'Templates' }).click();
  await expect(cardByTitle(page, 'Weekly review')).toHaveCount(1);
});

test('the shelf stays out of search', async ({ page }) => {
  await composeNote(page, { title: 'Sonnenblume', body: 'a rare word' });
  const box = page.getByRole('textbox', { name: 'Search' });
  await box.click();
  await box.fill('sonnenblume');
  await expect(cardByTitle(page, 'Sonnenblume')).toBeVisible();

  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
  await saveAsTemplate(page, 'Sonnenblume');

  await box.click();
  await box.fill('sonnenblume');
  await expect(cardByTitle(page, 'Sonnenblume')).toHaveCount(0);
});
