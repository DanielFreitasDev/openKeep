import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('label lifecycle: create in Edit labels, appears in sidebar, assign via picker, chip navigates', async ({
  page,
}) => {
  // Create a label through the Edit labels modal.
  await page.getByRole('button', { name: 'Edit labels' }).click();
  await page.getByRole('textbox', { name: 'Create new label' }).fill('Projects');
  await page.getByRole('textbox', { name: 'Create new label' }).press('Enter');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();

  // Assign it to a note via the card more menu.
  await composeNote(page, { title: 'Labeled note', body: 'has a label' });
  await cardRootByTitle(page, 'Labeled note').hover();
  await cardRootByTitle(page, 'Labeled note')
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Add label' }).click();
  await page.getByRole('checkbox', { name: 'Projects' }).check();
  await page.keyboard.press('Escape');

  // Chip on the card → label route shows the note.
  await expect(
    cardRootByTitle(page, 'Labeled note').getByRole('button', { name: 'Projects' }),
  ).toBeVisible();
  await cardRootByTitle(page, 'Labeled note').getByRole('button', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/label\/Projects/);
  await expect(cardByTitle(page, 'Labeled note')).toBeVisible();
});

test('rename and delete labels update sidebar and chips', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit labels' }).click();
  const createBox = page.getByRole('textbox', { name: 'Create new label' });
  await createBox.fill('Old name');
  await createBox.press('Enter');

  // Rename inline.
  const row = page.getByRole('textbox', { name: 'Rename label' });
  await row.click();
  await row.fill('New name');
  await row.press('Enter');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'New name' })).toBeVisible();

  // Delete.
  await page.getByRole('button', { name: 'Edit labels' }).click();
  await page.locator('.group\\/label').hover();
  await page.getByRole('button', { name: 'Delete label' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'New name' })).toHaveCount(0);
});

test('search: live text, color filter, archive grouping, no-results', async ({ page }) => {
  await composeNote(page, { title: 'Banana bread', body: 'recipe with cinnamon' });
  await composeNote(page, { title: 'Coral colored', body: 'paint sample' });
  await composeNote(page, { title: 'Old archived', body: 'banana history' });

  // Color the second note.
  await cardRootByTitle(page, 'Coral colored').hover();
  await cardRootByTitle(page, 'Coral colored')
    .getByRole('button', { name: 'Background options' })
    .click();
  await page.getByRole('radio', { name: 'Coral' }).click();
  await page.keyboard.press('Escape');

  // Archive the third.
  await cardRootByTitle(page, 'Old archived').hover();
  await cardRootByTitle(page, 'Old archived')
    .getByRole('button', { name: 'Archive', exact: true })
    .click();

  // Focus search → tiles view.
  await page.getByRole('textbox', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/search/);
  await expect(page.getByText('Types')).toBeVisible();
  await expect(page.getByText('Colors')).toBeVisible();

  // Live text search with accent-insensitive match + ARCHIVE grouping.
  await page.getByRole('textbox', { name: 'Search' }).fill('banâna');
  await expect(cardByTitle(page, 'Banana bread')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();
  await expect(cardByTitle(page, 'Old archived')).toBeVisible();
  await expect(cardByTitle(page, 'Coral colored')).toHaveCount(0);

  // Combine with color filter → no banana+coral notes.
  await page.getByRole('textbox', { name: 'Search' }).fill('');
  await page.getByRole('button', { name: 'Coral', exact: true }).click();
  await expect(cardByTitle(page, 'Coral colored')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search' }).fill('banana');
  await expect(page.getByText('No matching results.')).toBeVisible();

  // Clear search returns home.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('# in the note body opens the label picker and assigns', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit labels' }).click();
  await page.getByRole('textbox', { name: 'Create new label' }).fill('Hash');
  await page.getByRole('textbox', { name: 'Create new label' }).press('Enter');
  await page.getByRole('button', { name: 'Done' }).click();

  await composeNote(page, { title: 'Hashtag note', body: 'text' });
  await cardByTitle(page, 'Hashtag note').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.tiptap').click();
  await page.keyboard.type('#');
  await page.getByRole('checkbox', { name: 'Hash' }).check();
  await page.keyboard.press('Escape'); // close picker
  await expect(page.getByRole('checkbox', { name: 'Hash' })).toHaveCount(0);
  await page.keyboard.press('Escape'); // close editor
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    cardRootByTitle(page, 'Hashtag note').getByRole('button', { name: 'Hash', exact: true }),
  ).toBeVisible();
});

test('labels carry a colour and an emoji, and the manual order is draggable', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit labels' }).click();
  const createBox = page.getByRole('textbox', { name: 'Create new label' });
  for (const name of ['Zebra', 'Apple']) {
    await createBox.fill(name);
    await createBox.press('Enter');
  }

  // Creation order, not alphabetical — the manual order starts as "as typed".
  const rows = page.getByTestId('label-row');
  const names = () =>
    rows
      .locator('input[type="text"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await expect(rows).toHaveCount(2);
  expect(await names()).toEqual(['Zebra', 'Apple']);

  // Colour + emoji for the first one.
  await page.getByRole('button', { name: 'Colour and emoji for Zebra' }).click();
  await page.getByRole('button', { name: 'Mint', exact: true }).click();
  await page.getByRole('button', { name: '⭐', exact: true }).click();
  await page.keyboard.press('Escape');

  // Arrow keys on the drag handle reorder (same path the drag commits).
  await page.getByRole('button', { name: 'Reorder Apple' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(names).toEqual(['Apple', 'Zebra']);

  await page.getByRole('button', { name: 'Done' }).click();

  // The sidebar shows the emoji — decorative, so it is aria-hidden and the
  // link is still named after the label alone.
  const zebra = page.getByRole('link', { name: 'Zebra', exact: true });
  await expect(zebra).toContainText('⭐');

  // The sidebar follows the manual order, and it survives a reload: the
  // position is stored, not local state.
  const sidebarOrder = () =>
    page
      .getByRole('navigation')
      .getByRole('link')
      .filter({ hasText: /Apple|Zebra/ })
      .allInnerTexts()
      .then((texts) => texts.map((x) => x.replace(/\s+/g, '')));
  await expect.poll(sidebarOrder).toEqual(['Apple', '⭐Zebra']);
  await page.reload();
  await expect(zebra).toContainText('⭐');
  await expect.poll(sidebarOrder).toEqual(['Apple', '⭐Zebra']);
});
