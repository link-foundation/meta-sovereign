import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';

export const ownerState = (page) =>
  page.evaluate(() => {
    const input = document.querySelector('textarea');
    return {
      url: window.location.href,
      draft: input.value,
      selection: [
        input.selectionStart,
        input.selectionEnd,
        input.selectionDirection,
      ],
      draftTop: input.scrollTop,
      listTop: document.querySelector('#list').scrollTop,
      messageTop: document.querySelector('#history').scrollTop,
      sends: window.fixture.sends,
    };
  });

export const openUnread = async (controls) => {
  await openQuestionDisclosure(controls);
  const unread = controls.locator('[data-browser-unread-controls]');
  await unread.waitFor();
  return unread;
};

export const openUnreadSurface = async (scenario, surface, hash, width) => {
  const { fixture, page } = scenario;
  await fixture.reset();
  await page.setViewportSize({ width, height: 950 });
  // Chat's read marker can reload the provider. Settle it before freezing the view.
  const marked =
    surface === 'chat'
      ? page.waitForResponse(
          (response) => new URL(response.url()).pathname === '/api/message/read'
        )
      : null;
  await page.goto(`${fixture.base}/?unread-surface=${surface}${hash}`);
  await page.bringToFront();
  await marked;
  await page.locator('[data-action="chat-automations"]').click();
  return openUnread(
    page.locator('.chat-menu-list [data-browser-answer-controls]')
  );
};

export const verifyUnreadFocusRefusal = async (unread, fixture) => {
  await unread.locator('[data-browser-unread-confirm]').check();
  await unread.locator('[data-browser-unread-start]').click();
  await unread.locator('[data-browser-unread-result="failed"]').waitFor();
  assert.deepEqual((await fixture.stats()).visits, []);
  assert.equal((await fixture.stats()).sends, 0);
};

const settledUnread = (unread) =>
  unread.locator('[data-browser-unread-result="completed"]').waitFor();

export const recoverUnread = async (unread) => {
  await unread
    .getByRole('button', { name: 'Recover unread pass status', exact: true })
    .click();
  await settledUnread(unread);
};

export const recoverUnreadSurface = async (unread, fixture) => {
  const before = await fixture.stats();
  assert.equal(
    await unread.locator('[data-browser-unread-start]').isDisabled(),
    true,
    'A shared saved pass must be recovered before another pass can start'
  );
  await recoverUnread(unread);
  const after = await fixture.stats();
  for (const key of ['visits', 'sends']) {
    assert.deepEqual(
      after[key],
      before[key],
      `Recovery must not change ${key}`
    );
  }
};

export const loseUnreadStartResponse = (page) =>
  page.route(
    '**/api/automations/answers/browser/unread-start',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    }
  );

const verifyUnreadRecovery = async (scenario, unread, original) => {
  const { fixture, page, run, shot } = scenario;
  await run(
    'lost start response recovers the same pass without replaying visits',
    async () => {
      await loseUnreadStartResponse(page);
      await unread.locator('[data-browser-unread-start]').click();
      await unread
        .getByText(
          'Recover the saved pass before starting another. Recovery does not open chats again.',
          { exact: true }
        )
        .waitFor();
      assert.equal(
        await unread.locator('[data-browser-unread-start]').isDisabled(),
        true
      );
      await page.unroute('**/api/automations/answers/browser/unread-start');
      await recoverUnread(unread);
      assert.deepEqual((await fixture.stats()).visits, ['8', '9']);
      assert.deepEqual(await ownerState(fixture.page), original);
      await unread.scrollIntoViewIfNeeded();
      await shot('unread-recovered-desktop');
    }
  );
};

export const unreadSurfaces = [
  ['chat', '#chat=hh:7', 1180],
  ['operator', '#/operator?chat=hh%3A7', 390],
];

export const shotUnreadSurface = async (
  { page, shot },
  unread,
  surface,
  prefix
) => {
  await unread.scrollIntoViewIfNeeded();
  await shot(`${prefix}-${surface}`);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    true
  );
};

const verifyUnreadSurfaces = async (scenario) => {
  const { fixture, run } = scenario;
  for (const [surface, hash, width] of unreadSurfaces) {
    await run(
      `${surface} shares finite unread controls without an explicit chat target`,
      async () => {
        const unread = await openUnreadSurface(scenario, surface, hash, width);
        await recoverUnreadSurface(unread, fixture);
        const original = await ownerState(fixture.page);
        await unread.getByRole('spinbutton').fill('1');
        await unread.locator('[data-browser-unread-confirm]').check();
        await unread.locator('[data-browser-unread-start]').click();
        await settledUnread(unread);

        await unread
          .getByText(/^Visited 1 of [12] observed chats\. This does not prove/)
          .waitFor();
        assert.deepEqual(await ownerState(fixture.page), original);
        await shotUnreadSurface(scenario, unread, surface, 'unread');
      }
    );
  }
};

/** Real native provider navigation, production shared UI and negotiated Lino transport. */
export const verifyQuestionUnreadControls = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    serverOptions: { unreadReview: true },
    group: 'question-unread-controls',
  });
  const { fixture, controls, run, shot } = scenario;
  try {
    await scenario.open();
    if (before) {
      await openQuestionDisclosure(controls);
      assert.equal(
        await controls.locator('[data-browser-unread-controls]').count(),
        0
      );
      await controls.scrollIntoViewIfNeeded();
      await shot('unread-before');
      return { missingUnreadControls: true };
    }
    const unread = await openUnread(controls);
    if (browser.browserType().name() !== 'chromium') {
      await run(
        'unsupported native focus is reported without visiting provider chats',
        async () => {
          await verifyUnreadFocusRefusal(unread, fixture);
        }
      );
      return scenario.result();
    }
    const original = await ownerState(fixture.page);
    await run(
      'confirmation gates bounded unread reads and frozen saved-answer reviews',
      async () => {
        assert.equal(
          await unread.locator('[data-browser-unread-start]').isDisabled(),
          true
        );
        assert.deepEqual((await fixture.stats()).visits, []);
        await unread.getByRole('spinbutton').fill('1');
        await unread.locator('[data-browser-unread-confirm]').check();
        await unread.locator('[data-browser-unread-start]').click();
        await settledUnread(unread);
        await unread
          .getByText('The original provider view was restored.', {
            exact: true,
          })
          .waitFor();
        await unread
          .getByText(/^Browser history entries: \d+ before, \d+ after\.$/)
          .waitFor();
        assert.deepEqual((await fixture.stats()).visits, ['8']);
        assert.deepEqual(await ownerState(fixture.page), original);
        await unread.locator('[data-browser-unread-review="8"]').click();
        await controls
          .locator('[data-browser-answer-review]')
          .locator('pre')
          .filter({ hasText: 'At 9 a.m.' })
          .waitFor();
        assert.deepEqual(await ownerState(fixture.page), original);
        await unread.scrollIntoViewIfNeeded();
        await shot('unread-after-desktop');
      }
    );
    await verifyUnreadRecovery(scenario, unread, original);
    await run('empty unread passes preserve the owned view', async () => {
      await unread.locator('[data-browser-unread-start]').click();
      await settledUnread(unread);
      await unread
        .getByText(
          'Visited 0 of 0 observed chats. This does not prove that all unread chats or messages were found.',
          { exact: true }
        )
        .waitFor();
      assert.deepEqual(await ownerState(fixture.page), original);
    });
    await verifyUnreadSurfaces(scenario);
    return scenario.result();
  } catch (error) {
    await shot('unread-failed');
    throw error;
  } finally {
    await scenario.close();
  }
};
