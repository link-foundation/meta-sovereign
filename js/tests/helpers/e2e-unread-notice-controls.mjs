import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import {
  openUnread,
  openUnreadSurface,
  ownerState,
  recoverUnread,
  loseUnreadStartResponse,
  verifyUnreadFocusRefusal,
  shotUnreadSurface,
  unreadSurfaces,
} from './e2e-question-unread-controls.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';
import { noticeReply } from '../../../experiments/issue-56/notice-fixture.mjs';

const start = async (unread, notices) => {
  await unread.getByRole('spinbutton').fill('2');
  await unread.locator('[data-browser-unread-notices]').setChecked(notices);
  await unread.locator('[data-browser-unread-confirm]').check();
  await unread.locator('[data-browser-unread-start]').click();
};
const completed = (unread) =>
  unread.locator('[data-browser-unread-result="completed"]').waitFor();

const verifyNoticeSurfaces = async (scenario) => {
  const { fixture, run } = scenario;
  for (const [surface, hash, width] of unreadSurfaces) {
    await run(
      `${surface} shares explicit policy mode and saved actual receipts`,
      async () => {
        const controls = await openUnreadSurface(
          scenario,
          surface,
          hash,
          width
        );
        if (surface === 'operator') {
          await recoverUnread(controls);
        }
        await start(controls, true);
        await completed(controls);
        assert.equal(
          await controls.locator('[data-browser-unread-notice="sent"]').count(),
          2
        );
        assert.equal(
          (await fixture.stats()).sends,
          0,
          'Shared reservations prevent another send'
        );
        await shotUnreadSurface(scenario, controls, surface, 'notices');
      }
    );
  }
};

/** The production service, transport, UI and default native sender run together. */
export const verifyUnreadNoticeControls = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    serverOptions: { unreadReview: true, unreadNotices: true },
    group: 'question-unread-notices',
  });
  const { page, fixture, shot, run } = scenario;
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    if (before) {
      assert.equal(
        await unread.locator('[data-browser-unread-notices]').count(),
        0
      );
      await unread.scrollIntoViewIfNeeded();
      await shot('notices-before');
      return { missingNoticeAdmission: true, liveProvider: false };
    }
    if (browser.browserType().name() !== 'chromium') {
      await run(
        'unsupported native focus refuses cross-chat notice effects',
        async () => {
          await unread.locator('[data-browser-unread-notices]').check();
          await verifyUnreadFocusRefusal(unread, fixture);
        }
      );
      return scenario.result();
    }
    await run(
      'read-only remains the default even with enabled notice policies',
      async () => {
        const original = await ownerState(fixture.page);
        assert.equal(
          await unread.locator('[data-browser-unread-notices]').isChecked(),
          false
        );
        await start(unread, false);
        await completed(unread);
        assert.equal(
          await unread.locator('[data-browser-unread-notice]').count(),
          0
        );
        assert.deepEqual(await ownerState(fixture.page), original);
      }
    );
    await run(
      'lost response recovers two confirmed native replies and the original owner draft',
      async () => {
        await fixture.reset();
        const original = await ownerState(fixture.page);
        await page.bringToFront();
        await loseUnreadStartResponse(page);
        await start(unread, true);
        await unread
          .getByText(
            'Recover the saved pass before starting another. Recovery does not open chats again.',
            { exact: true }
          )
          .waitFor();
        await unread.scrollIntoViewIfNeeded();
        await shot('notices-response-lost');
        await page.unroute('**/api/automations/answers/browser/unread-start');
        await recoverUnread(unread);
        assert.equal(
          await unread.locator('[data-browser-unread-notice="sent"]').count(),
          2
        );
        await unread.getByText(noticeReply, { exact: true }).waitFor();
        await unread.getByText('May I ask why?', { exact: true }).waitFor();
        assert.deepEqual((await fixture.stats()).replies, {
          8: noticeReply,
          9: 'May I ask why?',
        });
        assert.deepEqual(await ownerState(fixture.page), {
          ...original,
          sends: 2,
        });
        await unread.scrollIntoViewIfNeeded();
        await shot('notices-after-desktop');
        await page.reload();
        await page.bringToFront();
        await openQuestionDisclosure(page.locator('[data-question-controls]'));
        const restored = await openUnread(scenario.controls);
        await recoverUnread(restored);
        assert.equal(
          await restored.locator('[data-browser-unread-notice="sent"]').count(),
          2
        );
        assert.equal((await fixture.stats()).sends, 2);
      }
    );
    await verifyNoticeSurfaces(scenario);
    return scenario.result();
  } finally {
    await scenario.close();
  }
};
