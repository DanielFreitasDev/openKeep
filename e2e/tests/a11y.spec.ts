import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { cardByTitle, composeNote, signUpFreshUser } from './helpers.js';

async function expectNoSeriousViolations(page: Page, context: string) {
  // Axe reads computed colors, so a surface caught mid-fade reports a blended
  // foreground and trips the contrast rule. Wait for the entrance animations to
  // settle — looping ones (the sync spinner) never do, so they are excluded.
  await page.waitForFunction(`(() => document.getAnimations().every(
    (a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity,
  ))()`);
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

    await expectNoSeriousViolations(page, `grid ${theme}`);

    await cardByTitle(page, 'A11y note').click();
    await expectNoSeriousViolations(page, `editor ${theme}`);
    await page.keyboard.press('Escape');

    await page.getByRole('textbox', { name: 'Search' }).click();
    await expectNoSeriousViolations(page, `search ${theme}`);
    await page.getByRole('button', { name: 'Clear search' }).click();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expectNoSeriousViolations(page, `settings ${theme}`);
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('link', { name: 'Trash' }).click();
    await expectNoSeriousViolations(page, `trash ${theme}`);
    await page.getByRole('link', { name: 'Notes', exact: true }).click();
  }
});
