import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

/**
 * Linking one note to another: `[[` in the body, and the backlink panel that
 * reads the same link from the other end.
 *
 * The link is an ordinary anchor carrying the app's own deep link, so the
 * assertions worth making are the ones about the seams: the two brackets never
 * survive as text, the href round-trips through the server sanitizer (which
 * refuses relative hrefs everywhere else), the click navigates in this tab
 * instead of opening a second copy of the app, and the target note learns it
 * has been mentioned without anyone writing the link twice.
 */

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('[[ links a note, the link navigates, and the target lists the backlink', async ({ page }) => {
  await composeNote(page, { title: 'Bathroom remodel', body: 'tiles and grout' });
  await composeNote(page, { title: 'Shopping list' });

  // Write the link from the shopping list into the remodel note.
  await cardByTitle(page, 'Shopping list').click();
  const dialog = page.getByRole('dialog');
  const body = dialog.locator('.note-editor [contenteditable="true"]');
  await body.click();
  await page.keyboard.type('see [[');

  await expect(page.getByText('Link a note')).toBeVisible();

  // Watch the handover itself, not just its outcome. Picking used to drop the
  // caret on `<body>` for a frame before the editor got it back, and whatever
  // was typed into that window was discarded — invisible on an idle machine,
  // a lost sentence on a busy one. Recorded from the events rather than
  // sampled, so a sub-frame window cannot hide.
  await page.evaluate(`(() => {
    window.__focusTrail = [];
    document.addEventListener(
      'focusout',
      (e) => window.__focusTrail.push(e.relatedTarget ? e.relatedTarget.tagName : 'nothing'),
      true,
    );
  })()`);
  await page.getByRole('button', { name: 'Bathroom remodel' }).click();
  expect(await page.evaluate('window.__focusTrail')).not.toContain('nothing');

  const link = body.getByRole('link', { name: 'Bathroom remodel' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^\?note=[0-9a-f-]{36}$/);

  // The caret is back in the body — picking from a popover that took focus
  // must hand it back, or the sentence cannot be finished.
  await page.keyboard.type('for tiles');
  // The brackets are the gesture, not content: what stays is the link alone.
  await expect(body).toHaveText('see Bathroom remodel for tiles');
  await expect(link).toHaveText('Bathroom remodel');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  // Reload before following it: the href now comes from the server sanitizer,
  // which drops every other relative href it is handed.
  await page.reload();
  await cardByTitle(page, 'Shopping list').click();
  await dialog.locator('.note-editor a').click();

  // Same tab, and the editor is now the other note.
  await expect(page).toHaveURL(/\?note=/);
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Bathroom remodel');

  // The other end of the link, which nobody typed.
  await expect(dialog.getByText('Mentioned in 1 note')).toBeVisible();
  await dialog.getByRole('button', { name: 'Shopping list' }).click();
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Shopping list');
});

test('cancelling the picker gives the caret back, and never takes it', async ({ page }) => {
  await composeNote(page, { title: 'Bathroom remodel' });
  await composeNote(page, { title: 'Shopping list' });

  await cardByTitle(page, 'Shopping list').click();
  const dialog = page.getByRole('dialog');
  const body = dialog.locator('.note-editor [contenteditable="true"]');
  await body.click();
  await page.keyboard.type('see [[');
  await expect(page.getByText('Link a note')).toBeVisible();

  // Escape means "never mind": the sentence is still being written, so the
  // caret comes back to it without anyone clicking into the body again.
  await page.keyboard.press('Escape');
  await page.keyboard.type('nothing');
  await expect(body).toHaveText('see nothing');

  // Dismissing by reaching for another field is the opposite gesture, and the
  // caret has to stay where the reader put it.
  await page.keyboard.type(' [[');
  await expect(page.getByText('Link a note')).toBeVisible();
  const title = dialog.getByLabel('Title', { exact: true });
  await title.click();
  await page.keyboard.type('!');
  await expect(title).toHaveValue('Shopping list!');
});

test('a note link survives export to markdown and comes back as a link', async ({ page }) => {
  await composeNote(page, { title: 'Target note' });
  await composeNote(page, { title: 'Source note' });

  await cardByTitle(page, 'Source note').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.note-editor [contenteditable="true"]').click();
  await page.keyboard.type('[[');
  await page.getByRole('button', { name: 'Target note' }).click();
  await expect(dialog.locator('.note-editor a')).toHaveText('Target note');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  await cardByTitle(page, 'Source note').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await dialog.getByLabel('More').first().click();
      await page.getByRole('menuitem', { name: 'Download as .md' }).click();
    })(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);

  expect(Buffer.concat(chunks).toString('utf8')).toMatch(/\[Target note\]\(\?note=[0-9a-f-]{36}\)/);
});
