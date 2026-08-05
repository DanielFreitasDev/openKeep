import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, signUpFreshUser } from './helpers.js';

/** The editor morphs open from its card; pixel math has to wait for it to land. */
async function settledEditor(page: Page) {
  const dialog = page.getByRole('dialog');
  let previous = -1;
  await expect
    .poll(async () => {
      const width = (await dialog.boundingBox())?.width ?? -1;
      const settled = width > 0 && width === previous;
      previous = width;
      return settled;
    })
    .toBe(true);
  return dialog;
}

/**
 * Drag a checklist row's handle `dx` px horizontally. `dragTo` rather than raw
 * mouse moves: only the former starts a native HTML5 drag under Chromium. It
 * releases the pointer *on an element* and refuses one that something else
 * covers, so the target is whichever surface is really on top at the drop point
 * — a drop past the editor's edge lands on the scrim.
 */
async function dragRowHandle(page: Page, handle: Locator, dx: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('drag handle has no box');
  const x = box.x + box.width / 2 + dx;
  const y = box.y + box.height / 2;
  const dialog = page.getByRole('dialog');
  const dialogBox = await dialog.boundingBox();
  const overEditor = !!dialogBox && x >= dialogBox.x && x <= dialogBox.x + dialogBox.width;
  const target = overEditor ? dialog : page.locator('.editor-scrim');
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('drop target has no box');
  await handle.dragTo(target, { targetPosition: { x: x - targetBox.x, y: y - targetBox.y } });
}

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

test('dragging an item sideways indents and un-indents it', async ({ page }) => {
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Drag indent');
  const row = page.getByRole('textbox', { name: 'List item' }).last();
  await row.fill('Parent');
  await row.press('Enter');
  await page.getByRole('textbox', { name: 'List item' }).last().fill('Child');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await cardByTitle(page, 'Drag indent').click();
  const dialog = await settledEditor(page);
  const rows = dialog.locator('[data-indent]');
  const handles = dialog.getByRole('button', { name: 'Drag item' });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toHaveAttribute('data-indent', '0');

  // Right past the threshold: indented, no reorder (it never left its own row).
  const indented = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/items/'),
  );
  await dragRowHandle(page, handles.nth(1), 60);
  await expect(rows.nth(1)).toHaveAttribute('data-indent', '1');
  await expect(rows.nth(1).getByRole('textbox')).toHaveValue('Child');
  await indented;

  // And it is the server's answer, not just local state.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await cardByTitle(page, 'Drag indent').click();
  await settledEditor(page);
  await expect(rows.nth(1)).toHaveAttribute('data-indent', '1');

  // Left again: back to level 0.
  await dragRowHandle(page, handles.nth(1), -60);
  await expect(rows.nth(1)).toHaveAttribute('data-indent', '0');

  // The first item is never indentable, however far right the pointer goes.
  await dragRowHandle(page, handles.nth(0), 60);
  await expect(rows.nth(0)).toHaveAttribute('data-indent', '0');
  await page.keyboard.press('Escape');
});

test('dragging an item down lands it in the slot the list opened for it', async ({ page }) => {
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Drag order');
  for (const text of ['One', 'Two', 'Three']) {
    const row = page.getByRole('textbox', { name: 'List item' }).last();
    await row.fill(text);
    if (text !== 'Three') await row.press('Enter');
  }
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await cardByTitle(page, 'Drag order').click();
  const dialog = await settledEditor(page);
  const rows = dialog.locator('[data-indent]');
  const handles = dialog.getByRole('button', { name: 'Drag item' });
  await expect(rows).toHaveCount(3);

  // The bottom half of "Two" reads as "after Two" — one slot down, not two.
  // The row is lifted out of the list first, so the slot it lands in is the one
  // the list is already holding open on screen.
  const box = await rows.nth(1).boundingBox();
  if (!box) throw new Error('row has no box');
  const moved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/items/'),
  );
  await handles.nth(0).dragTo(rows.nth(1), {
    targetPosition: { x: box.width / 2, y: box.height - 2 },
  });
  await expect(rows.nth(0).getByRole('textbox')).toHaveValue('Two');
  await expect(rows.nth(1).getByRole('textbox')).toHaveValue('One');
  await expect(rows.nth(2).getByRole('textbox')).toHaveValue('Three');
  await moved;

  // And it is the order the server kept, not just the preview.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await cardByTitle(page, 'Drag order').click();
  await settledEditor(page);
  await expect(rows.nth(0).getByRole('textbox')).toHaveValue('Two');
  await expect(rows.nth(1).getByRole('textbox')).toHaveValue('One');
  await expect(rows.nth(2).getByRole('textbox')).toHaveValue('Three');
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

test('n/p select a list item and Shift+N/Shift+P move it', async ({ page }) => {
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keys');
  const alpha = page.getByRole('textbox', { name: 'List item' }).last();
  await alpha.fill('Alpha');
  await alpha.press('Enter');
  const bravo = page.getByRole('textbox', { name: 'List item' }).last();
  await bravo.fill('Bravo');
  await bravo.press('Enter');
  await page.getByRole('textbox', { name: 'List item' }).last().fill('Charlie');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await cardByTitle(page, 'Keys').click();
  const dialog = await settledEditor(page);
  const items = dialog.getByRole('textbox', { name: 'List item' });
  const selected = dialog.locator('[data-selected="true"]');
  await expect(items).toHaveCount(3);

  // Editors open with a field focused, where every bare letter is a letter:
  // Escape steps out of the field onto the item it was in.
  await items.nth(0).click();
  await page.keyboard.press('Escape');
  await expect(selected.getByRole('textbox')).toHaveValue('Alpha');
  await expect(dialog).toBeVisible();

  // n walks down and stops at the bottom; p walks back.
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await expect(selected.getByRole('textbox')).toHaveValue('Charlie');
  await page.keyboard.press('n');
  await expect(selected.getByRole('textbox')).toHaveValue('Charlie');
  await page.keyboard.press('p');
  await expect(selected.getByRole('textbox')).toHaveValue('Bravo');

  // Shift+N moves the selected item down, and the selection travels with it.
  const moved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/items/'),
  );
  await page.keyboard.press('Shift+N');
  await expect(items.nth(1)).toHaveValue('Charlie');
  await expect(items.nth(2)).toHaveValue('Bravo');
  await expect(selected.getByRole('textbox')).toHaveValue('Bravo');
  await moved;

  // Shift+P twice takes it to the top; the third press has nowhere to go.
  await page.keyboard.press('Shift+P');
  await page.keyboard.press('Shift+P');
  await expect(items.nth(0)).toHaveValue('Bravo');
  await page.keyboard.press('Shift+P');
  await expect(items.nth(0)).toHaveValue('Bravo');
  await expect(items.nth(1)).toHaveValue('Alpha');

  // Enter hands the keystrokes back to the row's own field, where n is a letter
  // again — the whole reason the selection is a focus of its own.
  await page.keyboard.press('Enter');
  await expect(selected).toHaveCount(0);
  await page.keyboard.type('n');
  await expect(items.nth(0)).toHaveValue('Bravon');

  // And from the field, Escape is still one step from closing the note.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // The moves were the server's, not just the open editor's.
  await page.reload();
  await cardByTitle(page, 'Keys').click();
  await settledEditor(page);
  const reopened = page.getByRole('dialog').getByRole('textbox', { name: 'List item' });
  await expect(reopened.nth(0)).toHaveValue('Bravon');
  await expect(reopened.nth(1)).toHaveValue('Alpha');
  await expect(reopened.nth(2)).toHaveValue('Charlie');
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

test('composer list: the add row appends an item and the handle reorders rows', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Packing');
  const rows = page.getByRole('textbox', { name: 'List item' });
  await rows.last().fill('Alpha');

  // The "List item" add row appends an empty row and takes the caret with it.
  await page.getByRole('button', { name: 'List item' }).click();
  await expect(rows).toHaveCount(2);
  await page.keyboard.type('Bravo');
  await expect(rows.nth(1)).toHaveValue('Bravo');

  // Drag Bravo's handle onto Alpha's top half: it lands above.
  const handles = page.getByRole('button', { name: 'Drag item' });
  await handles.nth(1).dragTo(rows.first(), { targetPosition: { x: 10, y: 2 } });
  await expect(rows.first()).toHaveValue('Bravo');
  await expect(rows.nth(1)).toHaveValue('Alpha');

  // The saved note keeps the dragged order.
  await page.locator('main').getByRole('button', { name: 'Close' }).click();
  await cardByTitle(page, 'Packing').click();
  const items = page.getByRole('dialog').getByRole('textbox', { name: 'List item' });
  await expect(items.nth(0)).toHaveValue('Bravo');
  await expect(items.nth(1)).toHaveValue('Alpha');
  await page.keyboard.press('Escape');
});
