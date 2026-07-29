import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('keyboard-only journey: ? help, j/k focus, Enter open, Ctrl+Enter close, e archive', async ({
  page,
}) => {
  await composeNote(page, { title: 'First note', body: 'one' });
  await composeNote(page, { title: 'Second note', body: 'two' });
  await page.getByRole('button', { name: 'Refresh' }).focus(); // blur composer

  // ? opens the shortcuts dialog straight from the shared registry.
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByRole('dialog').getByText('Keyboard shortcuts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // j focuses newest (Second), j again → First; k back up.
  await page.keyboard.press('j');
  await expect(cardRootByTitle(page, 'Second note').locator('> div').first()).toHaveClass(/ring-2/);
  await page.keyboard.press('j');
  await expect(cardRootByTitle(page, 'First note').locator('> div').first()).toHaveClass(/ring-2/);
  await page.keyboard.press('k');
  await expect(cardRootByTitle(page, 'Second note').locator('> div').first()).toHaveClass(/ring-2/);

  // Enter opens the focused note; Ctrl+Enter closes it.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // e archives the still-focused note (Second) with an undo snackbar.
  await page.keyboard.press('k');
  await page.keyboard.press('e');
  await expect(page.getByText('Note archived')).toBeVisible();
  await expect(cardByTitle(page, 'Second note')).toHaveCount(0);

  // / focuses search (navigating to the search route).
  await page.keyboard.press('/');
  await expect(page.getByPlaceholder('Search')).toBeFocused();
  await expect(page).toHaveURL(/\/search/);
});

test('multi-select: x + Ctrl+A + bulk archive via the selection bar', async ({ page }) => {
  await composeNote(page, { title: 'Bulk one', body: '1' });
  await composeNote(page, { title: 'Bulk two', body: '2' });
  await page.getByRole('button', { name: 'Refresh' }).focus();

  // Select via hover checkmark.
  await cardRootByTitle(page, 'Bulk one').hover();
  await cardRootByTitle(page, 'Bulk one').getByRole('button', { name: 'Select note' }).click();
  await expect(page.getByText('1 selected')).toBeVisible();

  // Select the second card as well (x-toggle is exercised further down, after
  // an explicit focus-ring await — pressing it blind flakes).
  await cardRootByTitle(page, 'Bulk two').hover();
  await cardRootByTitle(page, 'Bulk two').getByRole('button', { name: 'Select note' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();

  // Bulk archive.
  await page
    .getByTestId('selection-bar')
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await expect(cardByTitle(page, 'Bulk one')).toHaveCount(0);
  await expect(cardByTitle(page, 'Bulk two')).toHaveCount(0);
  await page.getByRole('link', { name: 'Archive' }).click();
  await expect(cardByTitle(page, 'Bulk one')).toBeVisible();

  // Ctrl+A selects all in the archive view; Esc clears.
  await page.getByRole('button', { name: 'Refresh' }).focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('2 selected')).toHaveCount(0);

  // x toggles selection on the keyboard-focused card.
  await page.keyboard.press('j');
  await expect(cardRootByTitle(page, 'Bulk two').locator('> div').first()).toHaveClass(/ring-2/);
  await page.keyboard.press('x');
  await expect(page.getByText('1 selected')).toBeVisible();
  await page.keyboard.press('x');
  await expect(page.getByText('1 selected')).toHaveCount(0);
});

test('Delete trashes the whole selection with one undo snackbar', async ({ page }) => {
  await composeNote(page, { title: 'Doomed one', body: '1' });
  await composeNote(page, { title: 'Doomed two', body: '2' });
  await page.getByRole('button', { name: 'Refresh' }).focus();

  await page.keyboard.press('Control+a');
  await expect(page.getByText('2 selected')).toBeVisible();

  await page.keyboard.press('Delete');
  await expect(page.getByText('2 notes trashed')).toBeVisible();
  await expect(cardByTitle(page, 'Doomed one')).toHaveCount(0);
  await expect(cardByTitle(page, 'Doomed two')).toHaveCount(0);

  // Undo brings both back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(cardByTitle(page, 'Doomed one')).toBeVisible();
  await expect(cardByTitle(page, 'Doomed two')).toBeVisible();
});

test('hovering a toolbar button shows the custom tooltip', async ({ page }) => {
  await expect(page.getByTestId('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh' }).hover();
  await expect(page.getByTestId('tooltip')).toHaveText('Refresh');
  // Moving off the anchor dismisses it.
  await page.getByLabel('Take a note…').hover();
  await expect(page.getByTestId('tooltip')).toHaveCount(0);
});

test('drag-reorder persists across reload', async ({ page }) => {
  await composeNote(page, { title: 'Alpha', body: 'a' });
  await composeNote(page, { title: 'Beta', body: 'b' });
  // Newest first: Beta, Alpha. Drag Alpha onto Beta (top) → Alpha first.
  const alpha = cardRootByTitle(page, 'Alpha');
  const beta = cardRootByTitle(page, 'Beta');
  await alpha.dragTo(beta, { targetPosition: { x: 120, y: 10 } });
  await page.waitForTimeout(600);

  const order = () =>
    page
      .locator('[data-note-id] [role="button"][aria-label]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(await order()).toEqual(['Alpha', 'Beta']);

  await page.reload();
  await expect(cardByTitle(page, 'Alpha')).toBeVisible();
  expect(await order()).toEqual(['Alpha', 'Beta']);
});
