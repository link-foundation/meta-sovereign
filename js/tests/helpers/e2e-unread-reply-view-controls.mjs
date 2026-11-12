import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import {
  openUnread,
  recoverUnread,
  openUnreadSurface,
  unreadSurfaces,
  verifyUnreadFocusRefusal,
} from './e2e-question-unread-controls.mjs';

/** Shared public UI reports intentional reply visibility independently of delivery. */
export const verifyUnreadReplyViewControls = async (
  browser,
  { screenshots } = {}
) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-reply-view',
    serverOptions: {
      unreadReview: true,
      unreadNotices: true,
      unreadReplyView: true,
    },
  });
  const { page, fixture, run, shot } = scenario;
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    if (browser.browserType().name() !== 'chromium') {
      await run('unsupported focus refuses original-chat sends', () =>
        verifyUnreadFocusRefusal(unread, fixture)
      );
      return scenario.result();
    }
    await run(
      'confirmed original-chat reply is visible and accurately disclosed',
      async () => {
        await unread.getByRole('spinbutton').fill('1');
        await unread.locator('[data-browser-unread-notices]').check();
        await unread.locator('[data-browser-unread-confirm]').check();
        await unread.locator('[data-browser-unread-start]').click();
        await unread
          .locator('[data-browser-unread-result="completed"]')
          .waitFor();
        await unread
          .getByText('Confirmed reply 708 was revealed', { exact: false })
          .waitFor();
        assert.equal((await fixture.stats()).sends, 1);
        await unread.scrollIntoViewIfNeeded();
        await shot('reply-view-controls');
      }
    );
    // Existing per-surface IDs remain recoverable and migrate after a read.
    await page.evaluate(() => {
      const key = 'metaSovereign.browserUnread.hh';
      globalThis.localStorage.setItem(
        'metaSovereign.browserAnswer.settings.unread',
        globalThis.localStorage.getItem(key)
      );
      globalThis.localStorage.removeItem(key);
    });
    await page.reload();
    await scenario.open();
    const recovered = await openUnread(scenario.controls);
    await run(
      'reload migrates the legacy ID without another provider pass',
      async () => {
        await recoverUnread(recovered);
        await recovered
          .getByText('Confirmed reply 708 was revealed', { exact: false })
          .waitFor();
        assert.equal((await fixture.stats()).sends, 1);
      }
    );
    for (const [surface, hash, width] of unreadSurfaces) {
      await run(
        `shared ${surface} restores the same visibility receipt`,
        async () => {
          const controls = await openUnreadSurface(
            scenario,
            surface,
            hash,
            width
          );
          await recoverUnread(controls);
          await controls
            .getByText('Confirmed reply 708 was revealed', { exact: false })
            .waitFor();
          await controls.scrollIntoViewIfNeeded();
          await shot(`reply-view-${surface}`);
        }
      );
    }
    return scenario.result();
  } catch (error) {
    await shot('reply-view-failed');
    console.error('[question-unread-reply-view]', {
      result: await page.locator('[data-browser-unread-controls]').innerText(),
      provider: await fixture.stats(),
    });
    throw error;
  } finally {
    await scenario.close();
  }
};
