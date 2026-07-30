import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

/** Tick a card's hover checkmark. */
async function select(page: Page, title: string) {
  await cardRootByTitle(page, title).hover();
  await cardRootByTitle(page, title).getByRole('button', { name: 'Select note' }).click();
}

const bar = (page: Page) => page.getByTestId('selection-bar');

test('bulk labels: mixed selection shows an indeterminate box; one click applies to all', async ({
  context,
  page,
}) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();

  await page.getByRole('button', { name: 'Edit labels' }).click();
  await page.getByRole('textbox', { name: 'Create new label' }).fill('Projects');
  await page.getByRole('textbox', { name: 'Create new label' }).press('Enter');
  await page.getByRole('button', { name: 'Done' }).click();

  await composeNote(page, { title: 'Bulk one', body: '1' });
  await composeNote(page, { title: 'Bulk two', body: '2' });

  // Only the first note gets the label → the selection is mixed.
  await cardRootByTitle(page, 'Bulk one').hover();
  await cardRootByTitle(page, 'Bulk one')
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Add label' }).click();
  await page.getByRole('checkbox', { name: 'Projects' }).check();
  await page.keyboard.press('Escape');
  await expect(
    cardRootByTitle(page, 'Bulk one').getByRole('button', { name: 'Projects' }),
  ).toBeVisible();

  await select(page, 'Bulk one');
  await select(page, 'Bulk two');
  await expect(page.getByText('2 selected')).toBeVisible();

  await bar(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Change labels' }).click();
  const box = page.getByRole('checkbox', { name: 'Projects' });
  await expect(box).toBeChecked({ indeterminate: true });

  // Clicking a mixed box applies the label to the whole selection (Keep).
  await box.check();
  await page.keyboard.press('Escape');
  await expect(
    cardRootByTitle(page, 'Bulk two').getByRole('button', { name: 'Projects' }),
  ).toBeVisible();

  // Reopened, it is now fully checked; unchecking strips both notes.
  await bar(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Change labels' }).click();
  await expect(page.getByRole('checkbox', { name: 'Projects' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Projects' }).uncheck();
  await page.keyboard.press('Escape');
  await expect(
    cardRootByTitle(page, 'Bulk one').getByRole('button', { name: 'Projects' }),
  ).toHaveCount(0);
  await expect(
    cardRootByTitle(page, 'Bulk two').getByRole('button', { name: 'Projects' }),
  ).toHaveCount(0);
});

test('bulk reminder: one preset sets both notes, one delete clears both', async ({
  context,
  page,
}) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();

  await composeNote(page, { title: 'Remind one', body: '1' });
  await composeNote(page, { title: 'Remind two', body: '2' });

  await select(page, 'Remind one');
  await select(page, 'Remind two');
  await bar(page).getByRole('button', { name: 'Remind me' }).click();
  await page.getByRole('button', { name: 'Tomorrow' }).click();

  const chipOne = cardRootByTitle(page, 'Remind one').getByRole('button', {
    name: 'Edit reminder',
  });
  const chipTwo = cardRootByTitle(page, 'Remind two').getByRole('button', {
    name: 'Edit reminder',
  });
  await expect(chipOne).toBeVisible();
  await expect(chipTwo).toBeVisible();

  // The picker offers "Delete reminder" because the selection already has one.
  await bar(page).getByRole('button', { name: 'Remind me' }).click();
  await page.getByRole('button', { name: 'Delete reminder' }).click();
  await expect(chipOne).toHaveCount(0);
  await expect(chipTwo).toHaveCount(0);
});

test.describe('phone-sized', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true });

  test('the bar still fits and the reminder moves into the overflow menu', async ({
    context,
    page,
  }) => {
    await signUpFreshUser(context);
    await context.request.post('/api/notes', {
      data: { type: 'text', title: 'Phone note', bodyHtml: '<p>x</p>' },
    });
    await page.goto('/');
    const card = cardByTitle(page, 'Phone note');
    await expect(card).toBeVisible();

    await card.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 120,
      clientY: 240,
      isPrimary: true,
    });
    await page.waitForTimeout(700);
    await card.dispatchEvent('pointerup', { pointerType: 'touch' });
    await expect(bar(page)).toBeVisible();

    // Six 48px targets would overflow 360px — the reminder icon is not one.
    await expect(bar(page).getByRole('button', { name: 'Remind me' })).toHaveCount(0);
    const fits = await bar(page).evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);

    await bar(page).getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remind me' }).click();
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await expect(
      cardRootByTitle(page, 'Phone note').getByRole('button', { name: 'Edit reminder' }),
    ).toBeVisible();
  });
});

test('bulk collaborator: one invite shares every selected note', async ({ browser }) => {
  const ownerCtx = await browser.newContext({ locale: 'en-US' });
  const collabCtx = await browser.newContext({ locale: 'en-US' });
  const owner = await ownerCtx.newPage();
  const collab = await collabCtx.newPage();

  await signUpFreshUser(ownerCtx, 'Owner');
  const collabEmail = `e2e-bulk-${randomUUID().slice(0, 10)}@example.com`;
  await collabCtx.request.post('/api/auth/sign-up/email', {
    data: { email: collabEmail, password: 'password-123', name: 'Collab' },
    headers: {
      'x-forwarded-for': `10.8.${(Math.random() * 255) | 0}.${(Math.random() * 254 + 1) | 0}`,
    },
  });

  await owner.goto('/');
  await collab.goto('/');
  await expect(owner.getByLabel('Take a note…')).toBeVisible();
  await expect(collab.getByLabel('Take a note…')).toBeVisible();

  await composeNote(owner, { title: 'Shared one', body: '1' });
  await composeNote(owner, { title: 'Shared two', body: '2' });
  await select(owner, 'Shared one');
  await select(owner, 'Shared two');

  await bar(owner).getByRole('button', { name: 'More', exact: true }).click();
  await owner.getByRole('menuitem', { name: 'Collaborator' }).click();
  await expect(owner.getByText('Sharing 2 selected notes')).toBeVisible();
  await owner.getByLabel('Person or email to share with').fill(collabEmail);
  await owner.getByRole('button', { name: 'Share', exact: true }).click();

  // The dialog closes and the selection is spent — the invites are in flight.
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  await expect(owner.getByText('2 selected')).toHaveCount(0);

  // Both notes reach the collaborator over the socket.
  await expect(cardByTitle(collab, 'Shared one')).toBeVisible({ timeout: 5000 });
  await expect(cardByTitle(collab, 'Shared two')).toBeVisible({ timeout: 5000 });

  await ownerCtx.close();
  await collabCtx.close();
});
