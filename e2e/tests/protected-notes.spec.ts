import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

const PASSWORD = 'password-123';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

/** Protect a note through its card's ⋮ menu. */
async function protectFromCard(page: import('@playwright/test').Page, title: string) {
  await cardRootByTitle(page, title).hover();
  await cardRootByTitle(page, title).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Protect note' }).click();
}

/**
 * The card of a protected note, found by what it says instead of by its title —
 * which is the whole point: the title is not in this page.
 */
function protectedCard(page: import('@playwright/test').Page) {
  return page.getByRole('button', { name: 'Protected note', exact: true });
}

test('a protected note keeps its card and loses its words until the password is retyped', async ({
  page,
}) => {
  await composeNote(page, { title: 'Bank details', body: 'account 4111 1111' });
  await composeNote(page, { title: 'Grocery list', body: 'milk, eggs' });

  await protectFromCard(page, 'Bank details');

  // Gone as a title, present as a card: the board keeps its shape.
  await expect(cardByTitle(page, 'Bank details')).toHaveCount(0);
  await expect(protectedCard(page)).toBeVisible();
  await expect(cardByTitle(page, 'Grocery list')).toBeVisible();

  // And gone from the page source, not merely from the screen — the server
  // never sent this tab the words.
  await expect(page.locator('body')).not.toContainText('4111 1111');

  // A reload does not change that: the lock survives the session, not just
  // the render.
  await page.reload();
  await expect(protectedCard(page)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('4111 1111');

  // Opening the card asks for the password instead of opening an empty editor.
  await protectedCard(page).click();
  const prompt = page.getByRole('dialog');
  await expect(
    prompt.getByText('Enter your account password to show protected notes.'),
  ).toBeVisible();

  await prompt.getByLabel('Password', { exact: true }).fill('wrong-password');
  await prompt.getByRole('button', { name: 'Unlock' }).click();
  await expect(prompt.getByRole('alert')).toBeVisible();

  await prompt.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await prompt.getByRole('button', { name: 'Unlock' }).click();

  // The right password opens the note it was asked for, contents and all.
  await expect(page.getByRole('dialog').locator('.tiptap')).toContainText('account 4111 1111');
});

test('search will not admit that a protected note exists', async ({ page }) => {
  await composeNote(page, { title: 'Passport', body: 'zanzibar visa' });
  await composeNote(page, { title: 'Trip ideas', body: 'zanzibar beaches' });

  const search = page.getByRole('textbox', { name: 'Search' });
  await search.click();
  await search.fill('zanzibar');
  await expect(cardByTitle(page, 'Passport')).toBeVisible();
  await expect(cardByTitle(page, 'Trip ideas')).toBeVisible();

  await page.goto('/');
  await protectFromCard(page, 'Passport');

  await search.fill('zanzibar');
  // Not "found but blank": no card at all. An empty hit would still answer
  // the question the lock exists to refuse.
  await expect(cardByTitle(page, 'Trip ideas')).toBeVisible();
  await expect(protectedCard(page)).toHaveCount(0);
});

test('a PIN unlocks in place of the password, and Lock now closes the curtain again', async ({
  page,
}) => {
  await composeNote(page, { title: 'Diary', body: 'dear diary' });
  await protectFromCard(page, 'Diary');

  // Settings → set a PIN (the account password authorizes it).
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: 'Set a PIN' }).click();
  await settings.getByLabel('Account password').fill(PASSWORD);
  await settings.getByLabel('PIN (4 to 8 digits)').fill('2468');
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(settings.getByRole('button', { name: 'Change PIN' })).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();

  await protectedCard(page).click();
  const prompt = page.getByRole('dialog');
  // A PIN, once set, is what the prompt asks for.
  await expect(prompt.getByText('Enter your PIN to show protected notes.')).toBeVisible();
  await prompt.getByLabel('PIN', { exact: true }).fill('2468');
  await prompt.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('dialog').locator('.tiptap')).toContainText('dear diary');
  await page.getByRole('dialog').getByText('Close', { exact: true }).click();

  // Revealed, the note reads normally but still says it is protected.
  await expect(cardByTitle(page, 'Diary')).toBeVisible();

  // "Lock now" ends the window early, without waiting it out.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lock now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  await expect(cardByTitle(page, 'Diary')).toHaveCount(0);
  await expect(protectedCard(page)).toBeVisible();
});
