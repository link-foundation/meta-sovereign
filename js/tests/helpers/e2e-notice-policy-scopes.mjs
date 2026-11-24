import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';
import { openUnread } from './e2e-question-unread-controls.mjs';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
} from '../../src/automation/question-policy.js';
import { noticeReply } from '../../../experiments/issue-56/notice-fixture.mjs';

const chatOverride = { source: 'hh', chat: '8', acknowledgements: 'review' };

const openPolicy = async (page) => {
  const policy = page.locator('[data-answer-policy]');
  await openQuestionDisclosure(policy);
  await policy.locator('[data-notice-policies]').waitFor();
  return policy;
};

const fillScope = async (entry, source, chat) => {
  await entry.getByLabel('Provider ID', { exact: true }).fill(source);
  if (chat) {
    await entry
      .getByLabel('Chat ID (leave empty for the whole provider)', {
        exact: true,
      })
      .fill(chat);
  }
};

const configureScope = async (scenario, before) => {
  const { fixture, page, shot } = scenario;
  const policy = await openPolicy(page);
  const current = await readAnswerPolicy(fixture.store);
  if (before) {
    assert.equal(await policy.locator('[data-notice-overrides]').count(), 0);
    const saved = await saveAnswerPolicy(fixture.store, {
      ...current,
      notices: { ...current.notices, overrides: [chatOverride] },
    });
    assert.equal(saved.notices.overrides, undefined);
    await policy.locator('[data-notice-policies]').scrollIntoViewIfNeeded();
    await shot('issue-56-notice-policy-scopes-settings-before');
    return;
  }
  const add = policy.getByRole('button', { name: 'Add override', exact: true });
  const entries = policy.locator('[data-notice-override]');
  await add.click();
  await fillScope(entries.first(), 'hh', '8');
  await add.click();
  await fillScope(entries.last(), 'vk');
  await entries
    .last()
    .getByRole('button', { name: 'Remove override', exact: true })
    .click();
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  assert.deepEqual((await readAnswerPolicy(fixture.store)).notices.overrides, [
    chatOverride,
  ]);
  await scenario.open();
  await openPolicy(page);
  assert.equal(
    await entries
      .first()
      .getByLabel('Provider ID', { exact: true })
      .inputValue(),
    'hh'
  );
  assert.equal(
    await entries
      .first()
      .getByLabel('Rejections', { exact: true })
      .inputValue(),
    ''
  );
  await entries.first().scrollIntoViewIfNeeded();
  await shot('issue-56-notice-policy-scopes-settings-after');
};

export const verifyNoticePolicyScopes = async (
  browser,
  { parentBundle, screenshots = process.env.E2E_SCREENSHOTS } = {}
) => {
  if (browser.browserType().name() !== 'chromium') {
    return { cases: 0, liveProvider: false };
  }
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-notice-policy',
    serverOptions: { unreadReview: true, unreadNotices: true },
  });
  const before = Boolean(parentBundle);
  try {
    if (before) {
      await scenario.page.route('**/app.min.js', (route) =>
        route.fulfill({ body: parentBundle, contentType: 'text/javascript' })
      );
    }
    await scenario.open();
    await configureScope(scenario, before);
    const { fixture, page, shot } = scenario;
    const original = await fixture.stats();
    assert.equal(original.sends, 0);
    const unread = await openUnread(scenario.controls);
    await unread.locator('[data-browser-unread-notices]').check();
    await unread.locator('[data-browser-unread-confirm]').check();
    await unread.locator('[data-browser-unread-start]').click();
    await unread
      .locator('[data-browser-unread-result="completed"]')
      .waitFor({ timeout: 65000 });
    const replies = finalReplies(before);
    const result = await fixture.stats();
    assert.deepEqual(result.visits, ['8', '9']);
    assert.deepEqual(result.replies, replies);
    assert.equal(result.sends, Object.keys(replies).length);
    assert.equal(result.draft, original.draft);
    assert.deepEqual(
      await unread
        .locator('[data-browser-unread-notice]')
        .evaluateAll((rows) =>
          rows.map((row) => row.dataset.browserUnreadNotice)
        ),
      [before ? 'sent' : 'review', 'sent']
    );
    await unread
      .locator('[data-browser-unread-result]')
      .scrollIntoViewIfNeeded();
    await shot(`issue-56-notice-policy-scopes-${before ? 'before' : 'after'}`);
    assert.deepEqual(scenario.errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
    return { cases: 1, liveProvider: false };
  } finally {
    await scenario.close();
  }
};

const finalReplies = (before) =>
  before ? { 8: noticeReply, 9: 'May I ask why?' } : { 9: 'May I ask why?' };
