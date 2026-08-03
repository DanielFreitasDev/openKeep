import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

/** Two-browser-context collaboration: WS propagation + per-user isolation. */
test('sharing: live content sync between two users; per-user color isolation', async ({
  browser,
}) => {
  const ownerCtx: BrowserContext = await browser.newContext({ locale: 'en-US' });
  const collabCtx: BrowserContext = await browser.newContext({ locale: 'en-US' });
  const owner: Page = await ownerCtx.newPage();
  const collab: Page = await collabCtx.newPage();

  await signUpFreshUser(ownerCtx, 'Owner');
  const collabEmail = `e2e-collab-${randomUUID().slice(0, 10)}@example.com`;
  await collabCtx.request.post('/api/auth/sign-up/email', {
    data: { email: collabEmail, password: 'password-123', name: 'Collab' },
    headers: {
      'x-forwarded-for': `10.7.${(Math.random() * 255) | 0}.${(Math.random() * 254 + 1) | 0}`,
    },
  });

  await owner.goto('/');
  await collab.goto('/');
  await expect(owner.getByLabel('Take a note…')).toBeVisible();
  await expect(collab.getByLabel('Take a note…')).toBeVisible();

  // Owner creates + shares.
  await composeNote(owner, { title: 'Team plan', body: 'draft v1' });
  await cardRootByTitle(owner, 'Team plan').hover();
  await cardRootByTitle(owner, 'Team plan').getByRole('button', { name: 'Collaborator' }).click();
  await owner.getByLabel('Person or email to share with').fill(collabEmail);
  await owner.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(owner.getByText(collabEmail)).toBeVisible();
  await owner.getByRole('button', { name: 'Done' }).click();

  // Collaborator receives the note over WS without reloading.
  await expect(cardByTitle(collab, 'Team plan')).toBeVisible({ timeout: 5000 });

  // Collaborator opens the editor and leaves it open: remote non-dirty fields
  // must merge live into the open editor (title + body).
  await cardByTitle(collab, 'Team plan').click();
  const collabEditor = collab.getByRole('dialog');
  await expect(collabEditor).toBeVisible();

  // Owner edits content in the editor → collaborator card updates live.
  await cardByTitle(owner, 'Team plan').click();
  const ownerEditor = owner.getByRole('dialog');
  await ownerEditor.getByLabel('Title').fill('Team plan v2');
  await ownerEditor.locator('.tiptap').click();
  await ownerEditor.locator('.tiptap').pressSequentially(' plus live edits');
  await owner.waitForTimeout(800); // autosave debounce
  await owner.keyboard.press('Escape');

  // The collaborator's OPEN editor shows both merged fields…
  await expect(collabEditor.getByLabel('Title')).toHaveValue('Team plan v2', { timeout: 5000 });
  await expect(collabEditor.getByText('plus live edits')).toBeVisible({ timeout: 5000 });
  await collab.keyboard.press('Escape');
  // The editor morphs back onto its card — wait it out before reading the card.
  await expect(collabEditor).toHaveCount(0);

  // …and so does the card.
  await expect(collab.getByText('plus live edits')).toBeVisible({ timeout: 5000 });

  // Collaborator sets THEIR color — the owner's card must stay default.
  await cardRootByTitle(collab, 'Team plan v2').hover();
  await cardRootByTitle(collab, 'Team plan v2')
    .getByRole('button', { name: 'Background options' })
    .click();
  await collab.getByRole('radio', { name: 'Coral' }).click();
  await collab.keyboard.press('Escape');

  const collabCard = cardRootByTitle(collab, 'Team plan v2').locator('> div').first();
  await expect(collabCard).toHaveCSS('background-color', 'rgb(250, 175, 168)');

  await collab.waitForTimeout(600); // give any (wrong) event time to arrive
  const ownerCard = cardRootByTitle(owner, 'Team plan v2').locator('> div').first();
  await expect(ownerCard).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  // Shared avatars visible on the owner card.
  await expect(cardRootByTitle(owner, 'Team plan v2').getByLabel('Shared with')).toBeVisible();

  await ownerCtx.close();
  await collabCtx.close();
});

/**
 * View-only sharing: the level Keep never had. The viewer's own board state
 * (colour) has to keep working while the shared content is frozen — that split
 * is the whole design, so both halves are asserted on the same note.
 */
test('view-only: shared content is frozen, own board state is not, promotion unfreezes', async ({
  browser,
}) => {
  const ownerCtx: BrowserContext = await browser.newContext({ locale: 'en-US' });
  const viewerCtx: BrowserContext = await browser.newContext({ locale: 'en-US' });
  const owner: Page = await ownerCtx.newPage();
  const viewer: Page = await viewerCtx.newPage();

  await signUpFreshUser(ownerCtx, 'Owner');
  const viewerEmail = `e2e-viewer-${randomUUID().slice(0, 10)}@example.com`;
  await viewerCtx.request.post('/api/auth/sign-up/email', {
    data: { email: viewerEmail, password: 'password-123', name: 'Viewer' },
    headers: {
      'x-forwarded-for': `10.8.${(Math.random() * 255) | 0}.${(Math.random() * 254 + 1) | 0}`,
    },
  });

  await owner.goto('/');
  await viewer.goto('/');
  await expect(owner.getByLabel('Take a note…')).toBeVisible();
  await expect(viewer.getByLabel('Take a note…')).toBeVisible();

  await composeNote(owner, { title: 'Read only plan', body: 'do not touch' });
  await cardRootByTitle(owner, 'Read only plan').hover();
  await cardRootByTitle(owner, 'Read only plan')
    .getByRole('button', { name: 'Collaborator' })
    .click();
  await owner.getByLabel('Person or email to share with').fill(viewerEmail);
  await owner.getByRole('combobox', { name: 'Permission', exact: true }).click();
  await owner.getByRole('option', { name: 'Can view' }).click();
  await owner.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(owner.getByText(viewerEmail)).toBeVisible();
  await owner.getByRole('button', { name: 'Done' }).click();

  await expect(cardByTitle(viewer, 'Read only plan')).toBeVisible({ timeout: 5000 });

  // The editor opens read-only: the title cannot be typed into and the
  // formatting affordances are gone, replaced by the "View only" line.
  await cardByTitle(viewer, 'Read only plan').click();
  const viewerEditor = viewer.getByRole('dialog');
  // The badge exists twice — the mobile top bar and the desktop bottom bar,
  // each hidden by a breakpoint — so this asserts the one this viewport shows.
  await expect(viewerEditor.getByText('View only').filter({ visible: true })).toBeVisible();
  await expect(viewerEditor.getByLabel('Title')).toHaveAttribute('readonly', '');
  await expect(viewerEditor.getByRole('button', { name: 'Formatting options' })).toHaveCount(0);
  await expect(viewerEditor.locator('.tiptap[contenteditable="false"]')).toBeVisible();

  await viewer.keyboard.press('Escape');
  await expect(viewerEditor).toHaveCount(0);

  // Their own board state is untouched by the permission: colour still theirs.
  await cardRootByTitle(viewer, 'Read only plan').hover();
  await cardRootByTitle(viewer, 'Read only plan')
    .getByRole('button', { name: 'Background options' })
    .click();
  await viewer.getByRole('radio', { name: 'Coral' }).click();
  await viewer.keyboard.press('Escape');
  await expect(cardRootByTitle(viewer, 'Read only plan').locator('> div').first()).toHaveCSS(
    'background-color',
    'rgb(250, 175, 168)',
  );

  // Owner promotes them to editor; the change reaches the other browser over
  // the socket, and the same editor now takes typing.
  await cardRootByTitle(owner, 'Read only plan').hover();
  await cardRootByTitle(owner, 'Read only plan')
    .getByRole('button', { name: 'Collaborator' })
    .click();
  await owner.getByRole('combobox', { name: 'Permission for Viewer' }).click();
  await owner.getByRole('option', { name: 'Can edit' }).click();
  await owner.getByRole('button', { name: 'Done' }).click();

  await cardByTitle(viewer, 'Read only plan').click();
  await expect(viewerEditor.getByLabel('Title')).not.toHaveAttribute('readonly', '', {
    timeout: 5000,
  });
  await viewerEditor.getByLabel('Title').fill('Read only plan edited');
  await viewer.waitForTimeout(800); // autosave debounce
  await viewer.keyboard.press('Escape');

  await expect(cardByTitle(owner, 'Read only plan edited')).toBeVisible({ timeout: 5000 });

  await ownerCtx.close();
  await viewerCtx.close();
});
