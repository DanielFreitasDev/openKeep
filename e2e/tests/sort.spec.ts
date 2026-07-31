import { expect, type Page, test } from '@playwright/test';
import { composeNote, signUpFreshUser } from './helpers.js';

/** Card order as rendered — the open-card button carries the title as its label. */
async function gridOrder(page: Page): Promise<string[]> {
  return page
    .locator('[data-note-id]')
    .evaluateAll((els) =>
      els.map(
        (el) => el.querySelector('[role="button"][aria-label]')?.getAttribute('aria-label') ?? '',
      ),
    );
}

async function chooseSort(page: Page, option: string) {
  await page.getByRole('button', { name: 'Sort notes' }).click();
  await page.getByRole('menuitemradio', { name: option }).click();
}

test('sorts the grid by title, creation and edit date, and comes back to manual intact', async ({
  context,
  page,
}) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();

  await composeNote(page, { title: 'Charlie', body: 'first written' });
  await composeNote(page, { title: 'alpha', body: 'second written' });
  await composeNote(page, { title: 'Bravo', body: 'third written' });

  // Manual: newest on top, the order the composer produced.
  const manual = await gridOrder(page);
  expect(manual).toEqual(['Bravo', 'alpha', 'Charlie']);

  // Title ignores case: alpha sorts before Bravo.
  await chooseSort(page, 'Title');
  await expect.poll(() => gridOrder(page)).toEqual(['alpha', 'Bravo', 'Charlie']);

  // The preference roams with the account, so a reload keeps it.
  await page.reload();
  await expect.poll(() => gridOrder(page)).toEqual(['alpha', 'Bravo', 'Charlie']);

  await chooseSort(page, 'Date created');
  await expect.poll(() => gridOrder(page)).toEqual(['Bravo', 'alpha', 'Charlie']);

  // Editing the oldest note pushes it to the top of "Date edited" only.
  await page.getByRole('button', { name: 'Charlie', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.note-editor [contenteditable="true"]').click();
  await page.keyboard.type(' and edited last');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await chooseSort(page, 'Date edited');
  await expect.poll(() => gridOrder(page)).toEqual(['Charlie', 'Bravo', 'alpha']);

  // Nothing above rewrote a position: manual is exactly where it was.
  await chooseSort(page, 'Manual');
  await expect.poll(() => gridOrder(page)).toEqual(manual);
});
