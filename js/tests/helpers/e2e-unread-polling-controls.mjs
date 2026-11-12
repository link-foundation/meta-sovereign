import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import {
  openUnread,
  openUnreadSurface,
  ownerState,
  unreadSurfaces,
  shotUnreadSurface,
} from './e2e-question-unread-controls.mjs';

const recover = async (controls) => {
  await controls
    .getByRole('button', { name: 'Recover unread pass status', exact: true })
    .click();
  await controls
    .locator('[data-browser-unread-poll-phase="settled"]')
    .waitFor();
};

/** Real finite native passes under one durable polling owner and the shared UI. */
export const verifyUnreadPollingControls = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-polling',
    serverOptions: { unreadReview: true },
  });
  const { page, fixture, run, shot } = scenario;
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    if (before) {
      await unread.scrollIntoViewIfNeeded();
      await shot('polling-before');
      assert.equal(
        await unread.locator('[data-browser-unread-polling]').count(),
        1,
        'Unread controls must offer explicit repeated checking'
      );
      return scenario.result();
    }
    const original = await ownerState(fixture.page);
    await unread.getByRole('spinbutton').fill('1');
    await unread.locator('[data-browser-unread-polling]').check();
    await unread
      .locator('[data-browser-unread-poll-field="intervalMs"]')
      .fill('1');
    await unread
      .locator('[data-browser-unread-poll-field="durationMs"]')
      .fill('1');
    await unread.locator('[data-browser-unread-confirm]').check();
    await unread.locator('[data-browser-unread-start]').click();
    if (browser.browserType().name() !== 'chromium') {
      await run(
        'unsupported native focus pauses polling without opening chats',
        async () => {
          await unread
            .locator('[data-browser-unread-result="paused"]')
            .waitFor();
          await unread
            .getByText('browser-background-focus-unavailable', { exact: false })
            .waitFor();
          assert.deepEqual((await fixture.stats()).visits, []);
        }
      );
      return scenario.result();
    }
    await run(
      'one polling session reaches a second native pass and restores the owner view',
      async () => {
        await unread.getByText(/^Settled passes: 2\./u).waitFor();
        const visits = (await fixture.stats()).visits;
        assert.deepEqual(visits, ['8', '9']);
        assert.deepEqual(await ownerState(fixture.page), original);
        await unread.scrollIntoViewIfNeeded();
        await shot('polling-after');
      }
    );
    await run(
      'returning owner waits without stealing focus or opening another chat',
      async () => {
        await fixture.page.bringToFront();
        await unread
          .locator('[data-browser-unread-poll-phase="owner-active"]')
          .waitFor();
        assert.deepEqual((await fixture.stats()).visits, ['8', '9']);
        assert.equal(
          await fixture.page.evaluate(() => document.hasFocus()),
          true
        );
        await page.bringToFront();
      }
    );
    await run(
      'Stop drains and reload recovery never starts another native pass',
      async () => {
        await unread
          .getByRole('button', {
            name: 'Stop unread pass and wait',
            exact: true,
          })
          .click();
        await unread
          .locator('[data-browser-unread-result="stopped"]')
          .waitFor();
        await page.reload();
        await scenario.open();
        const recovered = await openUnread(scenario.controls);
        await recover(recovered);
        assert.deepEqual((await fixture.stats()).visits, ['8', '9']);
        await shotUnreadSurface(scenario, recovered, 'settings', 'polling');
      }
    );
    for (const [surface, hash, width] of unreadSurfaces) {
      await run(
        `${surface} recovers the same stopped session without restarting`,
        async () => {
          const shared = await openUnreadSurface(
            scenario,
            surface,
            hash,
            width
          );
          await recover(shared);
          await shared
            .getByText(/^Displayed receipts are from pass /u)
            .waitFor();
          assert.deepEqual((await fixture.stats()).visits, []);
          await shotUnreadSurface(scenario, shared, surface, 'polling');
        }
      );
    }
    return scenario.result();
  } catch (error) {
    await shot('polling-failed');
    console.error('[question-unread-polling]', {
      result: await page.locator('[data-browser-unread-controls]').innerText(),
      provider: await fixture.stats(),
    });
    throw error;
  } finally {
    await scenario.close();
  }
};
