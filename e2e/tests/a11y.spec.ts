import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

/**
 * Axe reads computed colors, so a surface caught mid-fade reports a blended
 * foreground and trips the contrast rule — the way this shows up in a report is
 * unmistakable: the failing nodes carry greys that are in no palette, the muted
 * token part of the way to the paper behind it.
 *
 * Asking once whether `getAnimations()` is quiet is not enough, which is what
 * used to make this spec flaky under load: these screens animate on mount (the
 * search panel's sections stagger in over ~440ms, the editor morphs out of the
 * card), and a check that runs before the animation has been registered sees an
 * empty list and passes *before* the fade begins — the report then names greys
 * that are in no palette. So quiet has to hold across several consecutive
 * frames, and anything found in between is waited out; the callers help by
 * asserting something on the new screen first, which is what proves it mounted.
 * Looping animations (the sync spinner) never finish and are excluded; the
 * deadline keeps a restarting one from hanging the test.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(`(async () => {
    const deadline = performance.now() + 3000;
    const running = () =>
      document
        .getAnimations()
        .filter(
          (a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity,
        );
    for (let quietFrames = 0; quietFrames < 6 && performance.now() < deadline; ) {
      const pending = running();
      if (pending.length === 0) {
        quietFrames++;
        await new Promise(requestAnimationFrame);
      } else {
        quietFrames = 0;
        await Promise.all(pending.map((a) => a.finished.catch(() => undefined)));
      }
    }
  })()`);
}

async function expectNoSeriousViolations(page: Page, context: string) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.tiptap') // contenteditable internals are ProseMirror-managed
    .analyze();
  const serious = results.violations.filter(
    (v: { impact?: string | null }) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious,
    `${context}: ${serious.map((v: { id: string; nodes: unknown[] }) => `${v.id} (${v.nodes.length})`).join(', ')}`,
  ).toEqual([]);
}

test('axe: grid, editor, search, settings and trash pass in light and dark', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await signUpFreshUser(context);
  await page.goto('/');
  await composeNote(page, { title: 'A11y note', body: 'accessible body text' });

  for (const theme of ['light', 'dark'] as const) {
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('menuitem', { name: 'Enable dark theme' }).click();
    }

    await expect(cardByTitle(page, 'A11y note')).toBeVisible();
    await expectNoSeriousViolations(page, `grid ${theme}`);

    await cardByTitle(page, 'A11y note').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousViolations(page, `editor ${theme}`);
    await page.keyboard.press('Escape');

    await page.getByRole('textbox', { name: 'Search' }).click();
    await expect(page.getByRole('heading', { name: 'Types' })).toBeVisible();
    await expectNoSeriousViolations(page, `search ${theme}`);
    await page.getByRole('button', { name: 'Clear search' }).click();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
    await expectNoSeriousViolations(page, `settings ${theme}`);
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('link', { name: 'Trash' }).click();
    await expect(page.getByText(/Notes in Trash are deleted/)).toBeVisible();
    await expectNoSeriousViolations(page, `trash ${theme}`);
    await page.getByRole('link', { name: 'Notes', exact: true }).click();
  }
});
