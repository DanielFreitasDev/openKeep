import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

/**
 * The one flow every other spec skips: signing up, in and out through the UI
 * instead of seeding a session over the API.
 *
 * Credential endpoints are rate limited to 10/min/IP, and a retried run would
 * otherwise reuse the same one — trustProxy honors X-Forwarded-For in dev, so
 * each run looks like a new client.
 */
test.use({
  extraHTTPHeaders: {
    'x-forwarded-for': `10.9.${(Math.random() * 255) | 0}.${(Math.random() * 254 + 1) | 0}`,
  },
});

const PASSWORD = 'password-123';
const freshEmail = () => `e2e-auth-${randomUUID().slice(0, 12)}@example.com`;

test('sign up, sign out and sign back in through the UI', async ({ page }) => {
  const email = freshEmail();

  // --- sign up
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create one' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Landing on the board means the session took.
  await expect(page.getByLabel('Take a note…')).toBeVisible();
  await expect(page).toHaveURL('/');

  // --- sign out
  await page.getByRole('button', { name: 'OpenKeep account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // The board is now behind the guard.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  // --- wrong password, then the right one
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not-my-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password. Try again.');
  await expect(page.getByLabel('Take a note…')).toHaveCount(0);

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Take a note…')).toBeVisible();

  // The account menu shows who is signed in.
  await page.getByRole('button', { name: 'OpenKeep account' }).click();
  await expect(page.getByText(email)).toBeVisible();
});

test('sign up rejects a duplicate email and a short password', async ({ page }) => {
  const email = freshEmail();

  await page.goto('/login');
  await page.getByRole('button', { name: 'Create one' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Take a note…')).toBeVisible();

  await page.getByRole('button', { name: 'OpenKeep account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByRole('button', { name: 'Create one' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('An account with this email already exists.');

  // Under 8 characters never leaves the browser: the field is minLength-guarded.
  await page.getByLabel('Email').fill(freshEmail());
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  // No DOM lib in this workspace's tsconfig, hence the structural cast.
  const valid = await page
    .getByLabel('Password')
    .evaluate((el) => (el as unknown as { checkValidity(): boolean }).checkValidity());
  expect(valid).toBe(false);
});
