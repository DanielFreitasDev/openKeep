import { expect, test } from '@playwright/test';
import { cardByTitle, cardRootByTitle, composeNote, signUpFreshUser } from './helpers.js';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

/** prefers-reduced-motion: animations off, everything still works. */
test('reduced-motion: transitions and enter animation disabled, core flow intact', async ({
  context,
  page,
}) => {
  await signUpFreshUser(context);
  await page.goto('/');
  await expect(page.getByLabel('Take a note…')).toBeVisible();

  await composeNote(page, { title: 'Calm one', body: 'no motion' });
  await composeNote(page, { title: 'Calm two', body: 'still' });

  // FLIP position transitions are suppressed (motion-reduce:transition-none).
  // All grid wrappers share the transition classes, so any card serves.
  await expect
    .poll(() =>
      page.evaluate(
        "getComputedStyle(document.querySelector('[data-note-id]')).transitionProperty",
      ),
    )
    .toBe('none');

  // The card enter animation is disabled under reduced motion.
  if ((await page.locator('.note-enter').count()) > 0) {
    expect(
      await page.evaluate(
        "getComputedStyle(document.querySelector('.note-enter').firstElementChild).animationName",
      ),
    ).toBe('none');
  }

  // Editor opens and closes; archive works with its snackbar.
  await cardByTitle(page, 'Calm one').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await cardRootByTitle(page, 'Calm two').hover();
  await cardRootByTitle(page, 'Calm two').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Note archived')).toBeVisible();
  await expect(cardByTitle(page, 'Calm two')).toHaveCount(0);
});
