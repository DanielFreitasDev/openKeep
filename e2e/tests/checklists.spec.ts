import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('checklist lifecycle: compose list, split, check to completed, uncheck all, delete checked', async ({
  page,
}) => {
  // Compose a list via the "New list" composer button.
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Shopping');
  const firstRow = page.getByRole('textbox', { name: 'List item' }).last();
  await firstRow.fill('Milk');
  await firstRow.press('Enter');
  await page.getByRole('textbox', { name: 'List item' }).last().fill('Bread');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();
  await expect(cardByTitle(page, 'Shopping')).toBeVisible();
  await expect(page.getByText('Milk')).toBeVisible();

  // Open the editor and Enter-split "Bread" into "Br" + "ead".
  await cardByTitle(page, 'Shopping').click();
  const dialog = page.getByRole('dialog');
  const bread = dialog.getByRole('textbox', { name: 'List item' }).nth(1);
  await bread.click();
  await bread.press('Home');
  await bread.press('ArrowRight');
  await bread.press('ArrowRight');
  await bread.press('Enter');
  await expect(dialog.getByRole('textbox', { name: 'List item' })).toHaveCount(3);
  const rows = dialog.getByRole('textbox', { name: 'List item' });
  await expect(rows.nth(1)).toHaveValue('Br');
  await expect(rows.nth(2)).toHaveValue('ead');

  // Check "Milk" → moves into the Completed section with strikethrough.
  await dialog.getByRole('checkbox', { name: 'Milk' }).check();
  await expect(dialog.getByText('1 Completed item', { exact: true })).toBeVisible();

  // Uncheck all via the more menu.
  await dialog.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Uncheck all items' }).click();
  await expect(dialog.getByText('Completed item')).toHaveCount(0);

  // Check one again and delete checked.
  await dialog.getByRole('checkbox', { name: 'Br', exact: true }).check();
  await dialog.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete checked items' }).click();
  await expect(dialog.getByRole('textbox', { name: 'List item' })).toHaveCount(2);

  await page.keyboard.press('Escape');
  // The editor morphs back onto its card — wait it out before reading the card.
  await expect(dialog).toHaveCount(0);
  // Card shows remaining items.
  await expect(page.getByText('Milk')).toBeVisible();
  await expect(page.getByText('ead')).toBeVisible();
});

test('indent rules: first item cannot indent; Tab indents; parent check cascades', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Nested');
  const row = page.getByRole('textbox', { name: 'List item' }).last();
  await row.fill('Parent');
  await row.press('Enter');
  await page.getByRole('textbox', { name: 'List item' }).last().fill('Child');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await cardByTitle(page, 'Nested').click();
  const dialog = page.getByRole('dialog');
  const items = dialog.getByRole('textbox', { name: 'List item' });

  // First item: Tab is a no-op.
  await items.nth(0).click();
  await items.nth(0).press('Tab');
  // Second item: Tab indents.
  await items.nth(1).click();
  await items.nth(1).press('Tab');
  await page.waitForTimeout(400);

  // Parent check cascades to the indented child.
  await dialog.getByRole('checkbox', { name: 'Parent' }).check();
  await expect(dialog.getByText('2 Completed items', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('card checkboxes tick items without opening the note', async ({ page }) => {
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Tick me');
  const firstRow = page.getByRole('textbox', { name: 'List item' }).last();
  await firstRow.fill('Milk');
  await firstRow.press('Enter');
  await page.getByRole('textbox', { name: 'List item' }).last().fill('Bread');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  // Ticking straight from the closed card: no editor, item moves to Completed.
  const card = cardRootByTitle(page, 'Tick me');
  await card.getByRole('checkbox', { name: 'Milk' }).click();
  await expect(card.getByText('1 Completed item', { exact: true })).toBeVisible();
  await expect(card.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Unticking works from the Completed group too, and the change is persisted.
  await card.getByRole('checkbox', { name: 'Milk' }).click();
  await expect(card.getByText('Completed item')).toHaveCount(0);
  await card.getByRole('checkbox', { name: 'Bread' }).click();
  await page.reload();
  await expect(
    cardRootByTitle(page, 'Tick me').getByRole('checkbox', { name: 'Bread' }),
  ).toBeChecked();
});

test('convert text ↔ list from the card menu', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await page.getByLabel('Title', { exact: true }).fill('Convert me');
  await page.getByRole('textbox', { name: 'Take a note…' }).fill('alpha\nbeta');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await cardRootByTitle(page, 'Convert me').hover();
  await cardRootByTitle(page, 'Convert me')
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Show checkboxes' }).click();

  await cardByTitle(page, 'Convert me').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'List item' })).toHaveCount(2);

  // Hide checkboxes from the editor more menu → back to text.
  await dialog.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Hide checkboxes' }).click();
  await expect(dialog.locator('.tiptap')).toContainText('alpha');
  await page.keyboard.press('Escape');
});

test('settings dialog toggles move-checked behavior', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Settings')).toBeVisible();

  const moveChecked = dialog.getByRole('checkbox', {
    name: 'Move checked items to bottom of list',
  });
  await expect(moveChecked).toBeChecked();
  await moveChecked.uncheck();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // With the setting off, checked items stay inline (no Completed section).
  await page.getByRole('button', { name: 'New list' }).click();
  const row = page.getByRole('textbox', { name: 'List item' }).last();
  await row.fill('inline item');
  await page.getByLabel('Title', { exact: true }).fill('Inline check');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await cardByTitle(page, 'Inline check').click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('checkbox', { name: 'inline item' }).check();
  await expect(editor.getByText('Completed item')).toHaveCount(0);
  await expect(editor.getByRole('textbox', { name: 'List item' })).toHaveValue('inline item');
  await page.keyboard.press('Escape');
});
