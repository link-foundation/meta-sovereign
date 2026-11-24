import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  employerRatingInvite,
  pollUrl,
  ratingReviewBrowser,
  ratingSessionCookie,
} from '../../../experiments/issue-56/unread-rating-fixture.mjs';
import { prepareEmployerRating } from '../../src/forms/employer-rating.js';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { openUnread } from './e2e-question-unread-controls.mjs';

const company = 'Example employer';

const verifyRatingSearchStates = async (browser) => {
  for (const [kind, expected] of [
    ['seasonal', 'rating-closed'],
    ['signed-out', 'rating-sign-in'],
    ['owner-search', 'rating-unavailable'],
    ['ambiguous-search', 'rating-unavailable'],
  ]) {
    const fixture = ratingReviewBrowser(browser, {
      seasonal: kind === 'seasonal',
    });
    const slot = await fixture.forms.openSession();
    const { page, commander } = slot;
    try {
      if (kind.endsWith('search')) {
        await page.context().addCookies([ratingSessionCookie]);
      }
      await commander.goto({ url: pollUrl, waitUntil: 'load' });
      if (kind === 'owner-search') {
        await page.locator('#company').fill('Owner search');
      }
      if (kind === 'ambiguous-search') {
        await page.locator('#company').evaluate((input) => {
          const duplicate = input.parentElement.cloneNode(true);
          duplicate.firstElementChild.id = 'another-company';
          input.parentElement.after(duplicate);
        });
      }
      assert.equal(
        await prepareEmployerRating({
          page,
          company,
          seeded: true,
          check: () => {},
          verify: async () => {},
        }),
        expected
      );
      if (kind !== 'seasonal') {
        assert.equal(
          await page.locator('#company').inputValue(),
          kind === 'owner-search' ? 'Owner search' : ''
        );
        assert.equal(
          await page.locator('input[type=radio]:checked').count(),
          0
        );
        assert.equal(await page.evaluate(() => globalThis.submits), 0);
      }
    } finally {
      await slot.close();
    }
  }
};

export const verifyUnreadEmployerRating = async (
  browser,
  { screenshots } = {}
) => {
  // The same group already exercises inactive-view refusal on WebKit.
  if (browser.browserType().name() !== 'chromium') {
    return { cases: 0, liveProvider: false };
  }
  const before = process.env.E2E_EMPLOYER_RATING_BEFORE === '1';
  const rating = ratingReviewBrowser(browser);
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-forms',
    serverOptions: {
      unreadReview: true,
      unreadAnswers: true,
      unreadRatingAuth: true,
      unreadMessages: { 8: employerRatingInvite },
      forms: rating.forms,
    },
  });
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    await unread.locator('[data-browser-unread-answers]').check();
    await unread.locator('[data-browser-unread-forms]').check();
    await unread.locator('[data-browser-unread-confirm]').check();
    await unread.locator('[data-browser-unread-start]').click();
    const result = unread.locator(
      '[data-browser-unread-result]:not([data-browser-unread-result="active"]), [role="alert"]'
    );
    await result.first().waitFor({ timeout: 65000 });
    assert.equal(
      await result.first().getAttribute('data-browser-unread-result'),
      'completed',
      await unread.innerText()
    );
    if (before) {
      const held = unread.locator('[data-browser-unread-held="8"]');
      await held.waitFor();
      assert.deepEqual(rating.visits, []);
      await held.scrollIntoViewIfNeeded();
      await scenario.shot('issue-56-employer-rating-before');
      return { cases: 1, liveProvider: false };
    }
    const ready = unread.locator('[data-browser-unread-form="rating-ready"]');
    const readOutcome = async () =>
      JSON.stringify({
        result: await unread.innerText(),
        visits: rating.visits,
      });
    assert.equal(await ready.count(), 1, await readOutcome());
    assert.equal(
      await unread.locator('[data-browser-unread-held="9"]').count(),
      1,
      await readOutcome()
    );
    assert.deepEqual(rating.visits, [{ method: 'GET', signedIn: true }]);
    const [poll] = rating.pages;
    assert.equal(await poll.locator('#company').inputValue(), company);
    assert.deepEqual(
      await poll.evaluate(() => ({
        searches: globalThis.searches,
        submits: globalThis.submits,
      })),
      { searches: [company], submits: 0 }
    );
    assert.equal(await poll.locator('input[type=radio]:checked').count(), 0);
    assert.deepEqual((await scenario.fixture.stats()).visits, ['8', '9']);
    assert.equal((await scenario.fixture.stats()).sends, 0);
    await ready.scrollIntoViewIfNeeded();
    await scenario.shot('issue-56-employer-rating-after');
    if (screenshots) {
      await poll.screenshot({
        path: join(screenshots, 'issue-56-employer-rating-poll.png'),
      });
    }
    await ready.getByRole('link').click();
    const card = scenario.page
      .locator('[data-form-review]')
      .filter({ hasText: pollUrl });
    await card.waitFor();
    assert.equal(await card.getByRole('button').count(), 2);
    await card.locator('[data-review-action="focus"]').click();
    await card.locator('[data-review-action="close"]').click();
    await card.waitFor({ state: 'detached' });
    assert.equal(poll.isClosed(), true);
    assert.deepEqual(scenario.errors, []);
    await verifyRatingSearchStates(browser);
    return { cases: 5, liveProvider: false };
  } finally {
    await scenario.close();
  }
};
