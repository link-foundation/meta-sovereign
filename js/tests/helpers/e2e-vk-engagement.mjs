import assert from 'node:assert/strict';
import { engagementServer } from '../../../experiments/issue-56/vk-engagement-fixture.mjs';
import { verifyVkTextReply } from './e2e-vk-text-reply.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
import { vkReplyApi } from './vk-reply-api.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

export const verifyVkEngagement = async (browser, options = {}) => {
  const configured = await verifyVkTextReply(
    browser,
    engagementServer,
    'engagement',
    options
  );
  if (options.before) {
    return configured;
  }
  const fixture = await engagementServer({
    sendResult: (_params, { calls }) =>
      calls.length === 2
        ? { error: { error_code: 100, error_msg: 'Fixture text refusal' } }
        : 918 + calls.length,
  });
  const { context, page, errors } = await vkAutomationBrowser(
    browser,
    '👋',
    fixture.base
  );
  context.setDefaultTimeout(10000);
  try {
    const call = vkReplyApi(fixture, LINO_TEXT);
    await call('/run', {
      automation: 'engagement',
      targets: [{ source: 'vk', chat: '41' }],
    });
    await page.goto(`${fixture.base}/#chat=vk:41`);
    const card = page.locator('.draft-card');
    await card.locator('[data-ordered-step="1"]').waitFor();
    assert.equal(await card.locator('[data-ordered-step]').count(), 2);
    await captureVkAutomationLayouts(
      page,
      card.locator('[data-ordered-reply]'),
      options.screenshots,
      'after-review'
    );
    await card.locator('[data-action="draft-send"]').click();
    await card
      .locator('[data-ordered-step="1"]')
      .getByText('Sent', { exact: true })
      .waitFor();
    await card
      .locator('[data-ordered-step="2"]')
      .getByText('Not delivered; review before retrying', { exact: true })
      .waitFor();
    await page
      .locator('[data-notice=failed]')
      .getByText(
        'Sticker sent; introduction not delivered. Review the remaining text before retrying.',
        { exact: true }
      )
      .waitFor();
    assert.equal(fixture.vk.calls.length, 2);
    await captureVkAutomationLayouts(
      page,
      card.locator('[data-ordered-step="2"]'),
      options.screenshots,
      'after-partial'
    );
    await page.reload();
    await card
      .locator('[data-ordered-step="1"]')
      .getByText('Sent', { exact: true })
      .waitFor();
    assert.equal(fixture.vk.calls.length, 2);
    // Supply a real fixture unread snapshot; Operator's defaults only open unread chats.
    await fixture.store.put({
      id: 'read:vk:41',
      source: 'vk',
      chat: '41',
      unreadCount: 1,
      unreadTopId: 3,
      inboxMaxId: 0,
    });
    await page.goto(`${fixture.base}/?ordered=operator#/operator?chat=vk%3A41`);
    await card
      .locator('[data-ordered-step="2"]')
      .getByText('Not delivered; review before retrying', { exact: true })
      .waitFor();
    await captureVkAutomationLayouts(
      page,
      card.locator('[data-ordered-reply]'),
      options.screenshots,
      'after-operator'
    );
    await card.locator('[data-action="draft-send"]').click();
    await card.waitFor({ state: 'detached' });
    assert.equal(fixture.vk.calls.length, 3);
    assert.equal(fixture.vk.calls.filter((c) => c.params.sticker_id).length, 1);
    assert.equal(fixture.receipts.length, 2);
    assert.deepEqual(errors, []);
    return {
      ...configured,
      partialResume: true,
      sharedChatOperator: true,
      mockProviderCalls: 3,
      acknowledgedSteps: 2,
      liveProvider: false,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
