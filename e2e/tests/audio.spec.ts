import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

/**
 * Chromium's fake capture device: a real `MediaRecorder` stream (a tone), so
 * what these tests upload is a genuine WebM/Opus recording rather than a
 * stubbed blob — the point being that the bytes survive the sniffer.
 *
 * `--use-fake-ui-for-media-stream` accepts the prompt: the fake device alone
 * is not enough, since headless Chromium never resolves the request without
 * it. That makes the accept path browser-wide (`launchOptions` cannot be
 * narrowed inside a `describe`), so the refusal below is stubbed at
 * `getUserMedia` instead — the branch under test is ours, not Chromium's.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

const audioPlayer = (page: Page) =>
  page.getByRole('dialog').locator('audio[src*="/api/attachments/"]');

test.beforeEach(async ({ context, page }) => {
  await signUpFreshUser(context);
  await page.goto('/');
  // "Loaded" reads differently per width: the composer is desktop-only, and
  // phones get the FAB in its place (the mobile groups below run at 390px).
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  await expect(
    mobile ? page.getByRole('button', { name: 'New note' }) : page.getByLabel('Take a note…'),
  ).toBeVisible();
});

test('records audio into a note; the recording plays back and is searchable', async ({ page }) => {
  await composeNote(page, { title: 'Voice note', body: 'about the meeting' });
  await cardByTitle(page, 'Voice note').click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Record audio' }).click();

  // The bar is the whole recorder UI, and the mic button stands down while it
  // is up (one recording, one place to stop it).
  await expect(dialog.getByText('Recording…')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Record audio' })).toBeDisabled();
  await expect(dialog.getByText('0:01')).toBeVisible();

  await dialog.getByRole('button', { name: 'Stop' }).click();
  await expect(audioPlayer(page)).toBeVisible();
  await expect(dialog.getByText('Recording…')).toHaveCount(0);

  await page.keyboard.press('Escape');

  // Search by type finds the note the way images already do.
  await page.getByRole('textbox', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'Audio' }).click();
  await expect(cardByTitle(page, 'Voice note')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();

  // Remove it again from the editor.
  await cardByTitle(page, 'Voice note').click();
  await dialog.getByRole('button', { name: 'Remove audio' }).click();
  await expect(audioPlayer(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('discarding a take attaches nothing and leaves the note open', async ({ page }) => {
  await composeNote(page, { title: 'Nothing recorded' });
  await cardByTitle(page, 'Nothing recorded').click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Record audio' }).click();
  await expect(dialog.getByText('Recording…')).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard' }).click();

  await expect(dialog.getByText('Recording…')).toHaveCount(0);
  await expect(audioPlayer(page)).toHaveCount(0);
  // Discarding a take is not closing the note.
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

/**
 * The FAB's "Recording" creates the note *before* the microphone is asked for,
 * so it is born empty and marked `new` — the state the editor discards on
 * close. A take has to count as content from the moment it exists, not from
 * the moment its upload acks, or closing the note straight after Stop deletes
 * the note the recording is still on its way to.
 */
test.describe('recording from the FAB (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a take made and closed while still uploading keeps its note', async ({ page }) => {
    // Hold the upload open so the close genuinely happens mid-flight.
    await page.route('**/api/notes/*/audio', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.getByRole('button', { name: 'New note' }).click();
    await page.getByRole('button', { name: 'Recording' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Recording…')).toBeVisible();
    // Let the take carry actual audio: Stop on the way up produces a bare
    // container and is refused before it ever reaches the route.
    await expect(dialog.getByText('0:01')).toBeVisible();

    // The upload's own answer is the assertion: a 201 means the note was still
    // there when the recording arrived. A discarded note answers 404.
    const uploaded = page.waitForResponse((r) => r.url().includes('/audio'));
    await dialog.getByRole('button', { name: 'Stop' }).click();
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    expect((await uploaded).status()).toBe(201);

    await page.reload();
    await expect(page.locator('[data-note-id] audio')).toBeVisible();
  });
});

test.describe('microphone refused', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('refusing to record leaves no empty note behind', async ({ page }) => {
    // The refusal a person gives at the prompt, which this browser is launched
    // to accept: `NotAllowedError` is exactly what it rejects with. Browser
    // code as a string, like the other specs — the e2e package compiles
    // against Node's libs.
    await page.addInitScript(`
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    `);
    await page.reload();

    await page.getByRole('button', { name: 'New note' }).click();
    await page.getByRole('button', { name: 'Recording' }).click();

    await expect(page.getByText('OpenKeep needs permission to use the microphone')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();

    await page.reload();
    await expect(page.locator('[data-note-id]')).toHaveCount(0);
  });
});

test('a take stopped on the way up says so instead of failing an upload', async ({ page }) => {
  await composeNote(page, { title: 'Tapped twice' });
  await cardByTitle(page, 'Tapped twice').click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Record audio' }).click();
  await dialog.getByRole('button', { name: 'Stop' }).click();

  await expect(page.getByText('That recording was too short')).toBeVisible();
  await expect(audioPlayer(page)).toHaveCount(0);
});

test('Escape cancels the recording before it cancels the note', async ({ page }) => {
  await composeNote(page, { title: 'Escape hatch' });
  await cardByTitle(page, 'Escape hatch').click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Record audio' }).click();
  await expect(dialog.getByText('Recording…')).toBeVisible();

  await dialog.getByRole('button', { name: 'Discard' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('Recording…')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(audioPlayer(page)).toHaveCount(0);
});
