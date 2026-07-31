import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, signUpFreshUser } from './helpers.js';

/**
 * Print / "Save as PDF". The dialog itself is native and out of Playwright's
 * reach, so window.print is replaced by a counter: what these specs check is
 * the sheet that would go to the printer — built from the note as it reads at
 * that moment, with the app chrome left off the page.
 */

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  // Browser code as a string, like the other specs: the e2e package compiles
  // against Node's libs, so `window` is not a name it knows.
  await page.addInitScript(`
    window.__printCalls = 0;
    window.print = () => { window.__printCalls++; };
  `);
});

const printCalls = (page: Page) => page.evaluate<number>('window.__printCalls');

test('the editor prints the note as it reads right now, chrome left out', async ({
  context,
  page,
}) => {
  await context.request.post('/api/notes', {
    data: { type: 'text', title: 'Beach trip', bodyHtml: '<h2>Packing</h2><p>towel</p>' },
  });
  await page.goto('/');
  await cardByTitle(page, 'Beach trip').click();

  const dialog = page.getByRole('dialog');
  // An edit the autosave still owes must reach the paper.
  // The body has no accessible name once it holds text — its placeholder is
  // the label, and it is gone by then.
  await dialog.locator('[contenteditable="true"]').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' and sunscreen');

  await dialog.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Print' }).click();

  expect(await printCalls(page)).toBe(1);
  const sheet = page.locator('#print-root');
  await expect(sheet).toHaveCount(1);
  // Present for the printer, invisible on screen.
  await expect(sheet).toBeHidden();
  await expect(sheet.locator('.print-title')).toHaveText('Beach trip');
  await expect(sheet.locator('.print-body h2')).toHaveText('Packing');
  await expect(sheet.locator('.print-body')).toContainText('towel and sunscreen');
  // Browsers name the PDF after the document title.
  await expect(page).toHaveTitle('Beach trip');

  // On paper the relationship inverts: the sheet is the only thing left, app
  // shell and the open modal included.
  await page.emulateMedia({ media: 'print' });
  await expect(sheet).toBeVisible();
  await expect(page.locator('#root')).toBeHidden();
  await expect(dialog).toBeHidden();
  await page.emulateMedia({ media: null });
});

test('a checklist prints its boxes, and the card menu prints without opening the note', async ({
  context,
  page,
}) => {
  await context.request.post('/api/notes', {
    data: {
      type: 'list',
      title: 'Packing list',
      items: [
        { text: 'sunscreen', checked: false },
        { text: 'towel', checked: true },
        { text: 'sandals', checked: false, indent: 1 },
      ],
    },
  });
  await page.goto('/');

  const card = cardRootByTitle(page, 'Packing list');
  await expect(cardByTitle(page, 'Packing list')).toBeVisible();
  await card.hover();
  await card.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Print' }).click();

  expect(await printCalls(page)).toBe(1);
  // The card menu never opens the editor.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const rows = page.locator('#print-root .print-item');
  // Checked rows sit at the bottom, the way the app displays them by default.
  await expect(rows).toHaveText(['☐sunscreen', '☐sandals', '☑towel']);
  await expect(rows.nth(1)).toHaveClass(/print-item-indent/);
  await expect(rows.nth(2)).toHaveClass(/print-item-checked/);
  await expect(page.locator('#print-root .print-body')).toHaveCount(0);
});
