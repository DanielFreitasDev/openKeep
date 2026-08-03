import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, signUpFreshUser } from './helpers.js';

/**
 * Markdown: the note understands it as typed, pasted, exported and imported.
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

test('marks still fire on a soft-broken line, not only at a block start', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  // Shift+Enter is how a note gets a line break, and ProseMirror shows the
  // break to input rules as an object character — the anchor every built-in
  // rule missed, so `**bold**` from the second line down did nothing.
  await page.keyboard.type('first line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('**bold** and *italic* and ~~gone~~ and `code`');

  await expect(body(page).locator('strong')).toHaveText('bold');
  await expect(body(page).locator('em')).toHaveText('italic');
  await expect(body(page).locator('s')).toHaveText('gone');
  await expect(body(page).locator('code')).toHaveText('code');
});

test('typing the extended syntax builds blocks', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  // Three backticks alone: a note is not a code editor, so the fence does not
  // wait for a language before turning into a block.
  await page.keyboard.type('```');
  await expect(body(page).locator('pre code')).toHaveCount(1);
  await page.keyboard.type('const a = 1;');
  await expect(body(page).locator('pre code')).toHaveText('const a = 1;');

  // Arrow-down out of the code block, then the other block gestures.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('- first item');
  await expect(body(page).locator('ul li')).toHaveText('first item');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('> quoted');
  await expect(body(page).locator('blockquote')).toContainText('quoted');

  await page.getByLabel('Title', { exact: true }).fill('Blocks typed');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  // The sanitizer keeps every one of them on the way back.
  await cardByTitle(page, 'Blocks typed').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('pre code')).toHaveText('const a = 1;');
  await expect(dialog.locator('ul li')).toHaveText('first item');
  await expect(dialog.locator('blockquote')).toContainText('quoted');
  await page.keyboard.press('Escape');
});

test('a table goes in from the bar and survives the round trip', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  // One button: the first click inserts, the next opens the row/column edits.
  await page.getByLabel('Formatting options').click();
  await page.getByLabel('Insert table').click();
  await expect(body(page).locator('table th')).toHaveCount(3);
  await page.keyboard.type('Item');

  await page.getByLabel('Table options').click();
  await page.getByRole('menuitem', { name: 'Insert row below' }).click();
  await expect(body(page).locator('table tr')).toHaveCount(4);

  await page.getByLabel('Title', { exact: true }).fill('Table note');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  // The card preview renders the grid, and so does the reopened note: the
  // sanitizer keeps the whole vocabulary, merges and widths aside.
  await expect(cardByTitle(page, 'Table note').locator('table th').first()).toHaveText('Item');
  await cardByTitle(page, 'Table note').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('table tr')).toHaveCount(4);
  await expect(dialog.locator('table th').first()).toHaveText('Item');
  await page.keyboard.press('Escape');
});

test('pasting a markdown table converts it to a grid', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  await pasteText(page, '| Item | Qty |\n| --- | --- |\n| Coffee | 2 |');

  await expect(body(page).locator('table th')).toHaveText(['Item', 'Qty']);
  await expect(body(page).locator('table td')).toHaveText(['Coffee', '2']);
});

test('a note downloads as .md and comes back as a note', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();
  await page.keyboard.type('# Heading\n');
  await page.keyboard.type('body with **bold**');
  await page.getByLabel('Title', { exact: true }).fill('Round trip');
  await page.locator('main').getByRole('button', { name: 'Close' }).click();

  await cardByTitle(page, 'Round trip').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('dialog').getByLabel('More').first().click();
      await page.getByRole('menuitem', { name: 'Download as .md' }).click();
    })(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('# Round trip');
  expect(markdown).toContain('# Heading');
  expect(markdown).toContain('body with **bold**');
  await page.keyboard.press('Escape');

  // …and the same text imports back as a note.
  await page.getByLabel('Settings', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import / Export' }).click();
  await page.locator('input[type="file"][accept*=".md"]').setInputFiles({
    name: 'imported.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(markdown),
  });
  await expect(page.getByText('Imported 1 notes (0 already existed).')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(cardByTitle(page, 'Round trip')).toHaveCount(2);
});

test('pasting plain text stays plain', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await body(page).click();

  await pasteText(page, 'a 2 * 3 * 4 calculation and snake_case_name');

  await expect(body(page)).toContainText('a 2 * 3 * 4 calculation and snake_case_name');
  await expect(body(page).locator('em')).toHaveCount(0);
  await expect(body(page).locator('strong')).toHaveCount(0);
});
