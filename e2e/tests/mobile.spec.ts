import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, signUpFreshUser } from './helpers.js';

/**
 * Keep-app mobile layout (max-md): search pill, 2-up grid, create FAB,
 * full-screen editor with bottom sheets, long-press selection. The rest of
 * the suite covers the desktop (md+) layouts.
 */
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

async function seedNote(context: BrowserContext, note: { title: string; bodyHtml?: string }) {
  const res = await context.request.post('/api/notes', {
    data: {
      id: randomUUID(),
      type: 'text',
      title: note.title,
      bodyHtml: note.bodyHtml ?? '',
      items: [],
      pinned: false,
      color: 'default',
      background: 'none',
    },
  });
  expect(res.ok(), `seed failed: ${res.status()}`).toBeTruthy();
}

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New note' })).toBeVisible();
});

test('home shows the search pill and FAB instead of the composer', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Search your notes' })).toBeVisible();
  await expect(page.getByLabel('Take a note…')).toBeHidden();
});

test('FAB → Text opens the full-screen editor; back saves the note', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(page).toHaveURL(/note=/);
  // isNew focuses the body, so typing lands in the note text.
  await page.keyboard.type('typed on the phone');
  await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Phone note');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(cardByTitle(page, 'Phone note')).toBeVisible();
  await expect(page.getByText('typed on the phone')).toBeVisible();
});

test('an untouched FAB note is discarded on back', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(page).toHaveURL(/new=true/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByText('Empty note discarded')).toBeVisible();
  await expect(page.getByText('Empty note', { exact: true })).toHaveCount(0);
});

test('FAB → List creates a checklist note', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('List item').first().click();
  await page.keyboard.type('bread');
  await dialog.getByLabel('Title', { exact: true }).fill('Phone list');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(cardByTitle(page, 'Phone list')).toBeVisible();
  await expect(page.getByText('bread')).toBeVisible();
});

test('search pill routes to /search and filters instantly', async ({ context, page }) => {
  await seedNote(context, { title: 'Oracle account', bodyHtml: '<p>user</p>' });
  await seedNote(context, { title: 'Groceries', bodyHtml: '<p>milk</p>' });
  await page.reload();
  await page.getByRole('button', { name: 'Search your notes' }).click();
  await expect(page).toHaveURL(/\/search/);
  await page.getByPlaceholder('Search your notes').fill('oracle');
  await expect(cardByTitle(page, 'Oracle account')).toBeVisible();
  await expect(cardByTitle(page, 'Groceries')).toBeHidden();
});

test('drawer covers the top bar, has Settings, and closes on navigation', async ({ page }) => {
  const nav = page.getByRole('navigation');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(nav.getByText('Settings')).toBeVisible();
  await nav.getByRole('link', { name: 'Archive' }).click();
  await expect(page).toHaveURL(/\/archive/);
  await expect(nav.getByText('Settings')).toBeHidden();
});

test('long-press (touch) selects a card', async ({ context, page }) => {
  await seedNote(context, { title: 'Pressme', bodyHtml: '<p>hold</p>' });
  await page.reload();
  const card = cardByTitle(page, 'Pressme');
  await card.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    clientX: 120,
    clientY: 240,
    isPrimary: true,
  });
  await page.waitForTimeout(700);
  await card.dispatchEvent('pointerup', { pointerType: 'touch' });
  await expect(page.getByTestId('selection-bar')).toBeVisible();
  await expect(page.getByText('1 selected')).toBeVisible();
});

test('editor bottom bar: more sheet shows Edited and deletes the note', async ({
  context,
  page,
}) => {
  await seedNote(context, { title: 'Sheet note', bodyHtml: '<p>content</p>' });
  await page.reload();
  await cardByTitle(page, 'Sheet note').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'More' }).filter({ visible: true }).click();
  await expect(page.getByText(/^Edited/).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await expect(page.getByText('Note trashed')).toBeVisible();
  await expect(cardByTitle(page, 'Sheet note')).toHaveCount(0);
});
