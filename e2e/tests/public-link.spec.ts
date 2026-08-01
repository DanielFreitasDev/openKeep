import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

/**
 * The link is only worth anything to someone with no account, so the reader
 * side runs in a second context that never signs in — the note has to arrive
 * with nothing but the address, and stop arriving the moment it is revoked.
 */
test('public link: a stranger reads the note, revoking closes the door', async ({ browser }) => {
  const ownerCtx = await browser.newContext({ locale: 'en-US' });
  const readerCtx = await browser.newContext({ locale: 'en-US' });
  const owner = await ownerCtx.newPage();
  const reader = await readerCtx.newPage();

  await signUpFreshUser(ownerCtx, 'Link Owner');
  await owner.goto('/');
  await expect(owner.getByLabel('Take a note…')).toBeVisible();
  await composeNote(owner, { title: 'Trip packing', body: 'sunscreen and a hat' });

  // A file attachment is shared content, so it has to reach the reader too.
  await cardByTitle(owner, 'Trip packing').click();
  const chooser = owner.waitForEvent('filechooser');
  await owner.getByRole('dialog').getByRole('button', { name: 'Attach file' }).click();
  await (await chooser).setFiles({
    name: 'itinerary.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]),
  });
  await expect(owner.getByRole('link', { name: /itinerary\.pdf/ })).toBeVisible();
  await owner.keyboard.press('Escape');

  // The link lives in the Share dialog, next to the people half of sharing.
  await cardRootByTitle(owner, 'Trip packing').hover();
  await cardRootByTitle(owner, 'Trip packing')
    .getByRole('button', { name: 'Collaborator' })
    .click();
  await owner.getByRole('button', { name: 'Create link' }).click();

  const urlField = owner.getByLabel('Public link');
  await expect(urlField).toBeVisible();
  const url = await urlField.inputValue();
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]+$/);

  // A context with no session, no cookies, nothing but the address.
  await reader.goto(new URL(url).pathname);
  await expect(reader.getByRole('heading', { name: 'Trip packing' })).toBeVisible();
  await expect(reader.getByText('sunscreen and a hat')).toBeVisible();
  await expect(reader.getByText('View only')).toBeVisible();
  // The document downloads through the same token, with no session anywhere.
  const chip = reader.getByRole('link', { name: /itinerary\.pdf/ });
  await expect(chip).toBeVisible();
  const bytes = await reader.request.get((await chip.getAttribute('href')) ?? '');
  expect(bytes.status()).toBe(200);
  expect(bytes.headers()['content-disposition']).toContain('itinerary.pdf');
  // Read-only means read-only: none of the editor's surface travels.
  await expect(reader.getByLabel('Title')).toHaveCount(0);
  await expect(reader.getByRole('button', { name: 'Collaborator' })).toHaveCount(0);

  await owner.getByRole('button', { name: 'Revoke link' }).click();
  await expect(owner.getByRole('button', { name: 'Create link' })).toBeVisible();

  await reader.reload();
  await expect(reader.getByText("This link isn't available")).toBeVisible();
});
