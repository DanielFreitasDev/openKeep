import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { signUpFreshUser } from './helpers.js';

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();
});

async function openWebhooks(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Webhooks' }).click();
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
}

test('adds an endpoint, edits what it listens to, and deletes it', async ({ page }) => {
  await openWebhooks(page);
  await expect(page.getByText('No endpoints yet. Add one to connect an automation.')).toBeVisible();

  await page.getByLabel('Endpoint URL').fill('https://example.com/hooks/openkeep');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const row = page.getByTestId('webhook-row');
  await expect(row).toHaveCount(1);
  await expect(row.getByText('https://example.com/hooks/openkeep')).toBeVisible();
  await expect(row.getByText('Never delivered')).toBeVisible();

  // The secret is revealed straight after creation — a hook nobody can verify
  // is half-built — and hides again on demand.
  await expect(row.getByText(/^okw_/)).toBeVisible();
  await row.getByRole('button', { name: 'Hide secret' }).click();
  await expect(row.getByText('Signing secret hidden')).toBeVisible();

  // Subscriptions are the checkboxes themselves; each toggle is a PATCH. The
  // box is controlled by the cache, so `check()` — which verifies the state in
  // the same breath as the click — is the wrong tool: click, then assert with
  // an assertion that retries until React has rendered the optimistic value.
  const trashed = row.getByRole('checkbox', { name: 'Note trashed' });
  await expect(trashed).not.toBeChecked();
  await trashed.click();
  await expect(trashed).toBeChecked();
  await page.reload();
  await openWebhooks(page);
  // Scoped to the row: the "add an endpoint" form offers the same seven labels.
  await expect(
    page.getByTestId('webhook-row').getByRole('checkbox', { name: 'Note trashed' }),
  ).toBeChecked();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Really delete?' }).click();
  await expect(page.getByTestId('webhook-row')).toHaveCount(0);
});

test('reports the failure when the endpoint cannot be reached', async ({ page }) => {
  await openWebhooks(page);
  // A host that resolves nowhere: the test button reports what happened
  // instead of pretending the delivery was queued.
  await page.getByLabel('Endpoint URL').fill('https://no-such-host.invalid/hook');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('webhook-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByTestId('webhook-test-result')).toContainText('Test failed');
});
