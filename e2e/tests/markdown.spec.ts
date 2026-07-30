import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, signUpFreshUser } from './helpers.js';

/**
 * Markdown phase A: the note understands markdown as it is typed and pasted.
 *
 * The interesting case is `#`, which Keep spends on quick-labeling and
 * markdown spends on headings. Both gestures are asserted here because the
 * rule that separates them (empty block start vs. anywhere else) is invisible
 * from the outside and easy to regress.
 */

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

const body = (page: Page) => page.getByRole('textbox', { name: 'Take a note…' });

/**
 * A plain-text clipboard drop on the composer body. Page code goes in as a
 * string — the e2e tsconfig is Node-flavored and has no DOM lib.
 */
const pasteText = (page: Page, text: string) =>
  page.evaluate(`(() => {
    const target = document.querySelector('.note-editor [contenteditable="true"]');
    const data = new DataTransfer();
    data.setData('text/plain', ${JSON.stringify(text)});
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  })()`);

test('typing markdown formats the note body', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  await page.keyboard.type('# Big title');
  await expect(body(page).locator('h1')).toHaveText('Big title');

  await page.keyboard.press('Enter');
  await page.keyboard.type('## Smaller');
  await expect(body(page).locator('h2')).toHaveText('Smaller');

  await page.keyboard.press('Enter');
  await page.keyboard.type('some **bold** and *italic* text');
  await expect(body(page).locator('strong')).toHaveText('bold');
  await expect(body(page).locator('em')).toHaveText('italic');

  await page.getByLabel('Title', { exact: true }).fill('Markdown typed');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  // The formatting survives the round trip through the server sanitizer.
  await cardByTitle(page, 'Markdown typed').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('h1')).toHaveText('Big title');
  await expect(dialog.locator('h2')).toHaveText('Smaller');
  await expect(dialog.locator('strong')).toHaveText('bold');
  await page.keyboard.press('Escape');
});

test('`#` still opens the label picker, at a line start too', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  // Mid-text: the picker opens on the keystroke itself.
  await page.keyboard.type('groceries #');
  await expect(page.getByLabel('Enter label name')).toBeVisible();
  await page.keyboard.press('Escape');

  // At the start of an empty line `#` types through so a heading is possible —
  // the next character is what proves it was a label, and it seeds the filter.
  await body(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('#w');
  const filter = page.getByLabel('Enter label name');
  await expect(filter).toBeVisible();
  await expect(filter).toHaveValue('w');
  // The picker takes the focus, so typing simply carries on into the filter.
  await page.keyboard.type('o');
  await expect(filter).toHaveValue('wo');
});

test('pasting markdown converts it to rich text', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  await pasteText(page, '# Pasted\n\nwith **strong** words');

  await expect(body(page).locator('h1')).toHaveText('Pasted');
  await expect(body(page).locator('strong')).toHaveText('strong');
});

test('pasting plain text stays plain', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  await pasteText(page, 'a 2 * 3 * 4 calculation and snake_case_name');

  await expect(body(page)).toContainText('a 2 * 3 * 4 calculation and snake_case_name');
  await expect(body(page).locator('em')).toHaveCount(0);
  await expect(body(page).locator('strong')).toHaveCount(0);
});
