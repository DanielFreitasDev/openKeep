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
