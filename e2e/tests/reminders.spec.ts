import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

test('set preset reminder → chip appears; reminders view lists it; delete clears', async ({
  page,
}) => {
  await composeNote(page, { title: 'Call mom', body: 'weekly call' });

  await cardRootByTitle(page, 'Call mom').hover();
  await cardRootByTitle(page, 'Call mom').getByRole('button', { name: 'Remind me' }).click();
  await page.getByRole('button', { name: 'Tomorrow' }).click();

  const chip = cardRootByTitle(page, 'Call mom').getByRole('button', { name: 'Edit reminder' });
  await expect(chip).toBeVisible();

  // Reminders view lists the note.
  await page.getByRole('link', { name: 'Reminders' }).click();
  await expect(cardByTitle(page, 'Call mom')).toBeVisible();

  // Edit → delete via the chip.
  await cardRootByTitle(page, 'Call mom').hover();
  await chip.click();
  await page.getByRole('button', { name: 'Delete reminder' }).click();
  await expect(chip).toHaveCount(0);
  await expect(page.getByText('Notes with upcoming reminders appear here')).toBeVisible();
});

test('custom date & time with recurrence shows recurring chip in editor', async ({ page }) => {
  await composeNote(page, { title: 'Water plants', body: 'the ficus is thirsty' });
  await cardByTitle(page, 'Water plants').click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remind me' }).click();
  await page.getByRole('button', { name: 'Pick date & time' }).click();

  const dt = page.getByLabel('Date and time');
  const future = new Date(Date.now() + 48 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await dt.fill(
    `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T09:30`,
  );
  await page.getByLabel('Repeat').selectOption('FREQ=WEEKLY');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByRole('button', { name: 'Edit reminder' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(
    cardRootByTitle(page, 'Water plants').getByRole('button', { name: 'Edit reminder' }),
  ).toBeVisible();
});
