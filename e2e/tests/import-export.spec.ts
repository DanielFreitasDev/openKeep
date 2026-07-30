import { expect, test } from '@playwright/test';
import { composeNote, signUpFreshUser } from './helpers.js';

test('export produces a downloadable zip from the Import / Export dialog', async ({
  context,
  page,
}) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await composeNote(page, { title: 'Exportable', body: 'take me with you' });

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Import / Export' }).click();

  const dialog = page.getByRole('dialog', { name: 'Import / Export' });
  await expect(dialog.getByText('Import from a zip')).toBeVisible();
  await expect(dialog.getByText('Export your data')).toBeVisible();

  await dialog.getByRole('button', { name: 'Prepare export' }).click();
  const downloadLink = dialog.getByRole('link', { name: 'Download zip' });
  await expect(downloadLink).toBeVisible({ timeout: 20_000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/openkeep.*\.zip/i);
});
