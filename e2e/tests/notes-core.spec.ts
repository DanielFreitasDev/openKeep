import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('composer saves on click-away; empty note is discarded', async ({ page }) => {
  await page.getByLabel('Take a note…').click();
  await page.getByLabel('Title', { exact: true }).fill('Click away note');
  await page.getByRole('textbox', { name: 'Take a note…' }).fill('saved by clicking outside');
  await page.locator('main').click({ position: { x: 10, y: 400 } });
  await expect(cardByTitle(page, 'Click away note')).toBeVisible();
  await expect(page.getByText('saved by clicking outside')).toBeVisible();

  // Empty composer discards with a snackbar.
  await page.getByLabel('Take a note…').click();
  await page.locator('main').click({ position: { x: 10, y: 400 } });
  await expect(page.getByText('Empty note discarded')).toBeVisible();
});

test('pinning creates PINNED/OTHERS sections and unpin restores', async ({ page }) => {
  await composeNote(page, { title: 'Stays below', body: 'other' });
  await composeNote(page, { title: 'Goes on top', body: 'pin me' });

  await expect(page.getByRole('heading', { name: 'Pinned' })).toHaveCount(0);

  await cardRootByTitle(page, 'Goes on top').hover();
  await cardRootByTitle(page, 'Goes on top').getByRole('button', { name: 'Pin note' }).click();

  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Others' })).toBeVisible();

  await cardRootByTitle(page, 'Goes on top').hover();
  await cardRootByTitle(page, 'Goes on top').getByRole('button', { name: 'Unpin note' }).click();
  await expect(page.getByRole('heading', { name: 'Pinned' })).toHaveCount(0);
});

test('card buttons survive an imprecise click (press, small move, release)', async ({ page }) => {
  await composeNote(page, { title: 'Jittery click', body: 'pin me' });

  const card = cardRootByTitle(page, 'Jittery click');
  await card.hover();
  const pin = card.getByRole('button', { name: 'Pin note' });
  const box = await pin.boundingBox();
  if (!box) throw new Error('pin button not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Real pointers drift a few pixels between press and release. That must not
  // arm the card's drag or otherwise swallow the click.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 5, y + 4, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible();
});

test('archive with undo snackbar', async ({ page }) => {
  await composeNote(page, { title: 'Archive me', body: 'x' });

  await cardRootByTitle(page, 'Archive me').hover();
  await cardRootByTitle(page, 'Archive me')
    .getByRole('button', { name: 'Archive', exact: true })
    .click();

  await expect(cardByTitle(page, 'Archive me')).toHaveCount(0);
  await expect(page.getByText('Note archived')).toBeVisible();

  await page.getByRole('link', { name: 'Archive' }).click();
  await expect(cardByTitle(page, 'Archive me')).toBeVisible();

  await page.getByRole('link', { name: 'Notes' }).click();
  await composeNote(page, { title: 'Undo archive', body: 'y' });
  await cardRootByTitle(page, 'Undo archive').hover();
  await cardRootByTitle(page, 'Undo archive')
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cardByTitle(page, 'Undo archive')).toBeVisible();
});

test('trash lifecycle: banner, restore, delete forever, empty trash', async ({ page }) => {
  await composeNote(page, { title: 'Trash one', body: '1' });
  await composeNote(page, { title: 'Trash two', body: '2' });

  for (const title of ['Trash one', 'Trash two']) {
    await cardRootByTitle(page, title).hover();
    await cardRootByTitle(page, title).getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete note' }).click();
    await expect(page.getByText('Note trashed')).toBeVisible();
  }

  await page.getByRole('link', { name: 'Trash' }).click();
  await expect(page.getByText('Notes in Trash are deleted after 7 days.')).toBeVisible();
  await expect(cardByTitle(page, 'Trash one')).toBeVisible();

  // Restore one.
  await cardRootByTitle(page, 'Trash one').hover();
  await cardRootByTitle(page, 'Trash one')
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect(cardByTitle(page, 'Trash one')).toHaveCount(0);

  // Delete the other forever (confirm dialog).
  await cardRootByTitle(page, 'Trash two').hover();
  await cardRootByTitle(page, 'Trash two').getByRole('button', { name: 'Delete forever' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No notes in Trash.')).toBeVisible();

  // Empty trash with a fresh throwaway.
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await composeNote(page, { title: 'For emptying', body: 'z' });
  await cardRootByTitle(page, 'For emptying').hover();
  await cardRootByTitle(page, 'For emptying')
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Delete note' }).click();
  await page.getByRole('link', { name: 'Trash' }).click();
  await page.getByRole('button', { name: 'Empty Trash' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Empty Trash' }).click();
  await expect(page.getByText('No notes in Trash.')).toBeVisible();
});

test('editor autosave survives reload', async ({ page }) => {
  await composeNote(page, { title: 'Autosave note', body: 'first line' });

  await cardByTitle(page, 'Autosave note').click();
  const editorBody = page.getByRole('dialog').locator('.tiptap');
  await editorBody.click();
  await editorBody.pressSequentially(' plus autosaved text');
  await page.waitForTimeout(900); // > 500ms debounce + request
  await page.reload();

  // ?note=<id> deep link reopens the editor after reload.
  await expect(page.getByRole('dialog').locator('.tiptap')).toContainText('plus autosaved text');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('version history: first edit is recorded and restorable from the card menu', async ({
  page,
}) => {
  await composeNote(page, { title: 'Versioned', body: 'original text' });

  // Editing the note captures the state it had before the edit.
  await cardByTitle(page, 'Versioned').click();
  const editorBody = page.getByRole('dialog').locator('.tiptap');
  await editorBody.click();
  await editorBody.pressSequentially(' plus more');
  await page.waitForTimeout(900); // > 500ms debounce + request
  await page.keyboard.press('Escape');

  // The entry is reachable from the collapsed card, not only from the editor.
  await cardRootByTitle(page, 'Versioned').hover();
  await cardRootByTitle(page, 'Versioned')
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Version history' }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Version history' });
  const entry = dialog.getByRole('button', { name: 'Restore' }).first();
  await expect(entry).toBeVisible();
  // Stamped down to the second (e.g. "…, 9:41:07 AM").
  await expect(dialog.getByText(/\d{1,2}:\d{2}:\d{2}/)).toBeVisible();

  await entry.click();
  await expect(page.getByText('original text', { exact: true })).toBeVisible();
});

test('colors apply on card in light AND dark themes', async ({ page }) => {
  await composeNote(page, { title: 'Colorful', body: 'paint me' });

  await cardRootByTitle(page, 'Colorful').hover();
  await cardRootByTitle(page, 'Colorful')
    .getByRole('button', { name: 'Background options' })
    .click();
  await page.getByRole('radio', { name: 'Coral' }).click();
  await page.keyboard.press('Escape');

  const card = cardRootByTitle(page, 'Colorful').locator('> div').first();
  await expect(card).toHaveCSS('background-color', 'rgb(250, 175, 168)');

  // Switch to dark theme via the gear menu.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Enable dark theme' }).click();
  await expect(card).toHaveCSS('background-color', 'rgb(119, 23, 46)');
});

test('opening and closing a note keeps the grid scrolled where it was', async ({
  context,
  page,
}) => {
  for (let i = 0; i < 30; i++) {
    const res = await context.request.post('/api/notes', {
      data: { title: `Scroll note ${i}`, bodyHtml: `<p>body ${i}</p><p>more</p>` },
    });
    expect(res.ok(), `note create failed: ${res.status()}`).toBeTruthy();
  }
  await page.reload();
  await expect(cardByTitle(page, 'Scroll note 29')).toBeVisible();

  // Masonry measures cards asynchronously and the browser's scroll anchoring
  // reacts to every re-layout; wait for both to go quiet before the baseline.
  const scrollY = () => page.evaluate<number>('window.scrollY');
  await page.evaluate('window.scrollTo(0, 900)');
  await page.waitForFunction(`(() => {
    const h = document.documentElement.scrollHeight;
    const y = window.scrollY;
    window.__calm = window.__lastH === h && window.__lastY === y ? (window.__calm ?? 0) + 1 : 0;
    window.__lastH = h;
    window.__lastY = y;
    return window.__calm >= 20;
  })()`);

  // A card already fully in view, so Playwright's own scroll-into-view can't
  // move the page and mask the regression.
  const targetId = await page.evaluate<string | null>(`(() => {
    const hit = [...document.querySelectorAll('[data-note-id]')].find((c) => {
      const r = c.getBoundingClientRect();
      return r.top > 100 && r.bottom < window.innerHeight - 100;
    });
    return hit ? hit.dataset.noteId : null;
  })()`);
  expect(targetId).not.toBeNull();

  const before = await scrollY();
  expect(before).toBeGreaterThan(0);

  // The note lives in a search param, not a new page — the grid must not jump.
  await page.locator(`[data-note-id="${targetId}"] [role="button"]`).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await scrollY()).toBe(before);

  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await scrollY()).toBe(before);
});

test('trashed note opens read-only with restore bar', async ({ page }) => {
  await composeNote(page, { title: 'RO in trash', body: 'locked' });
  await cardRootByTitle(page, 'RO in trash').hover();
  await cardRootByTitle(page, 'RO in trash')
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Delete note' }).click();

  await page.getByRole('link', { name: 'Trash' }).click();
  await cardByTitle(page, 'RO in trash').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Note in Trash')).toBeVisible();
  await expect(dialog.locator('.tiptap[contenteditable="false"]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('No notes in Trash.')).toBeVisible();
});

// App shortcuts (long-press the installed icon) are plain deep links: the
// manifest points at these URLs and the shell does the rest.
test('app shortcuts open a new note, list and drawing', async ({ page }) => {
  await page.goto('/?compose=text');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.tiptap')).toBeVisible();
  // The shortcut param is consumed by the navigation that opens the note, so
  // reloading this URL can never mint a second note.
  await expect(page).toHaveURL(/note=[0-9a-f-]{36}/);
  await expect(page).not.toHaveURL(/compose=/);
  await page.keyboard.press('Escape');

  // An empty list opens on its "add item" affordance, as the FAB flow does.
  await page.goto('/?compose=list');
  await expect(page.getByRole('dialog').getByText('List item').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/?drawing=new');
  await expect(page.locator('canvas[aria-label="Drawing"]')).toBeVisible();
});
