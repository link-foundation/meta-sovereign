import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { decodeWire } from '../../src/transport/lino.js';
import {
  openUnread,
  shotUnreadSurface,
} from './e2e-question-unread-controls.mjs';

const providerView = (fixture) =>
  fixture.page.evaluate(() => ({
    filter: document.querySelector('#outer-filter').checked,
    draft: document.querySelector('textarea').value,
    originalDraft: window.fixture.drafts['7'],
    visits: window.fixture.visits.slice(),
    sends: window.fixture.sends,
  }));

export const verifyUnreadWaiting = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-waiting',
    serverOptions: {
      unreadReview: true,
      unreadAnswers: true,
      unreadWaiting: true,
    },
  });
  const { fixture, page, run, shot } = scenario;
  const receipts = [];
  const responses = (response) => {
    if (response.url().includes('/api/automations/answers/browser/unread-')) {
      void response
        .body()
        .then((body) => {
          const receipt = decodeWire(body);
          receipts.push({
            polling: receipt.polling?.phase,
            lastPassId: receipt.polling?.lastPassId,
            receiptPassId: receipt.polling?.receiptPassId,
            held: receipt.restoration?.heldReview,
            reason: receipt.restoration?.reason,
            code: receipt.code,
          });
        })
        .catch(() => {});
    }
  };
  page.on('response', responses);
  await page.setViewportSize({ width: 390, height: 950 });
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    await unread.locator('[data-browser-unread-answers]').check();
    await unread.locator('[data-browser-unread-review-choices]').check();
    await unread.locator('[data-browser-unread-polling]').check();
    const optIn = unread.locator('[data-browser-unread-watch-waiting]');
    await unread.getByRole('spinbutton').first().fill('1');
    await unread
      .locator('[data-browser-unread-poll-field="intervalMs"]')
      .fill('4');
    await unread.locator('[data-browser-unread-confirm]').check();
    const original = await providerView(fixture);
    assert.equal(original.filter, true);
    if (before) {
      assert.equal(await optIn.count(), 0);
    } else {
      await optIn.check();
    }
    await unread.locator('[data-browser-unread-start]').click();
    if (browser.browserType().name() !== 'chromium') {
      await run(
        'browser without verified background focus pauses before any visit',
        async () => {
          await unread
            .locator('[data-browser-unread-result="paused"]')
            .waitFor();
          await unread
            .getByText('browser-background-focus-unavailable', { exact: false })
            .waitFor();
          assert.deepEqual(await providerView(fixture), original);
        }
      );
      return scenario.result();
    }
    const skip = unread.locator('[data-browser-unread-skip]');
    if (before) {
      await run('the parent only holds unread chat 9', async () => {
        const held = unread.locator('[data-browser-unread-held="9"]');
        await held.waitFor();
        await held.scrollIntoViewIfNeeded();
        assert.equal(await skip.count(), 0);
        assert.deepEqual((await providerView(fixture)).visits, ['9']);
        await shot('waiting-before');
      });
      return scenario.result();
    }
    await run(
      'an already-read incoming chat precedes an unread chat and retains the filter',
      async () => {
        await unread.locator('[data-browser-unread-held="8"]').waitFor();
        await skip.waitFor();
        assert.deepEqual(await providerView(fixture), {
          ...original,
          draft: 'At 9 a.m.',
          visits: ['8'],
        });
        await skip.evaluate((node) => node.scrollIntoView({ block: 'center' }));
        await shot('waiting-after');
        await unread.getByText(/^Settled passes: 2\./u).waitFor();
        assert.deepEqual((await providerView(fixture)).visits, ['8']);
      }
    );
    await run(
      'Skip restores the held view, preserves its draft and advances without sending',
      async () => {
        await skip.click();
        await unread
          .locator('[data-browser-unread-skipped]')
          .filter({ hasText: 'chat 8' })
          .waitFor();
        await unread.locator('[data-browser-unread-held="9"]').waitFor();
        assert.equal(
          await fixture.page.evaluate(() => window.fixture.drafts['8']),
          'At 9 a.m.'
        );
        assert.deepEqual(await providerView(fixture), {
          ...original,
          draft: 'At 9 a.m.',
          visits: ['8', '9'],
        });
        await skip.evaluate((node) => node.scrollIntoView({ block: 'center' }));
        await shotUnreadSurface(scenario, skip, 'next', 'waiting');
      }
    );
    await run(
      'a visible owner reply releases the hold without touching another composer',
      async () => {
        await fixture.page.evaluate(() => {
          window.fixture.replies['9'] = 'Owner-reviewed reply';
          window.fixture.drafts['9'] = '';
          document.querySelector('textarea').value = '';
          document.querySelector('#history').scrollTop = 700;
          window.renderMessages();
        });
        await unread
          .locator('[data-browser-unread-answer="no-reply"]')
          .waitFor();
        await unread
          .getByRole('button', { name: 'Stop unread pass and wait' })
          .click();
        await unread
          .locator('[data-browser-unread-result="stopped"]')
          .waitFor();
        assert.equal((await providerView(fixture)).sends, 0);
      }
    );
    return scenario.result();
  } catch (error) {
    await shot('waiting-failed');
    console.error('[question-unread-waiting]', {
      visible: await page
        .locator('[data-browser-unread-controls]')
        .allTextContents(),
      provider: await providerView(fixture),
      receipts: receipts.slice(-8),
    });
    throw error;
  } finally {
    page.off('response', responses);
    await scenario.close();
  }
};
