import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/web/i18n.js';
import { questionBrowserApi } from '../src/web/question-browser-api.js';
import { unreadNoticeFixture } from '../../experiments/issue-56/unread-notice-fixture.mjs';
import {
  questionBrowserCli,
  questionBrowserHttp,
} from '../../experiments/issue-56/question-browser-clients.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

const restoration = (state = 'revealed') => ({
  restored: true,
  reason: 'checked',
  replyView: { state, chat: '8', messageId: '808' },
});

test(
  'both Lino formats and CLI recovery retain witnessed original-chat visibility without another send',
  { timeout: 15000 },
  async () => {
    const env = await unreadNoticeFixture({
      notices: { acknowledgements: 'reply' },
      restoration: restoration(),
    });
    const { server, call } = await questionBrowserHttp(env);
    try {
      const result = await env.complete();
      assert.deepEqual(result.restoration, restoration());
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const response = await call('unread-status', env.input, media);
        assert.equal(response.status, 200);
        assert.deepEqual(
          response.body.restoration.replyView,
          restoration().replyView
        );
      }
      const cli = await questionBrowserCli(env)('unread-status', {
        'pass-id': env.input.id,
      });
      assert.equal(cli.code, 0);
      assert.deepEqual(
        cli.value.restoration.replyView,
        restoration().replyView
      );
      assert.equal(env.state.sends.length, 1);
      assert.equal(env.state.scans.length, 1);
    } finally {
      await server.close();
      await env.browser.close();
    }
  }
);

test('wire status rejects unbound visibility claims and retains confirmed delivery when revealing is unavailable', async () => {
  const env = await unreadNoticeFixture({
    notices: { acknowledgements: 'reply' },
    restoration: restoration('unavailable'),
  });
  try {
    const result = await env.complete();
    const apiFor = (value) =>
      questionBrowserApi({ remote: { report: async () => value } });
    assert.equal(
      (await apiFor(result).browserUnreadReviewStatus(env.input)).entries[0]
        .notice.phase,
      'sent'
    );
    for (const replyView of [
      { state: 'invented', chat: '8', messageId: '808' },
      { state: 'revealed', chat: '9', messageId: '808' },
      { state: 'revealed', chat: '8', messageId: 'different' },
      { state: 'revealed', chat: '', messageId: '808' },
    ]) {
      await assert.rejects(
        apiFor({
          ...result,
          restoration: { ...restoration(), replyView },
        }).browserUnreadReviewStatus(env.input)
      );
    }
    await assert.rejects(
      apiFor({
        ...result,
        restoration: { ...restoration(), restored: false },
      }).browserUnreadReviewStatus(env.input)
    );
    assert.equal(env.state.sends.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('shared visibility and preserved-position receipts have translations in every supported locale', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const key of [
      'browserUnread.restoredReply',
      'browserUnread.replyNotRevealed',
    ]) {
      const text = translate(locale, key, { id: '708' });
      assert.notEqual(text, key);
      assert.ok(text.includes('708'));
      assert.equal(text.includes('{id}'), false);
      if (locale !== 'en') {
        assert.notEqual(text, translate('en', key, { id: '708' }));
      }
    }
  }
});

test('the public service refuses a provider visibility receipt for another chat', async () => {
  const env = await unreadNoticeFixture({
    notices: { acknowledgements: 'reply' },
    restoration: {
      ...restoration(),
      replyView: {
        state: 'revealed',
        chat: '9',
        messageId: '808',
      },
    },
  });
  try {
    const result = await env.complete();
    assert.equal(result.state, 'failed');
    assert.equal(result.code, 'question-unread-unverified');
    assert.equal(result.restoration, null);
    assert.equal(result.entries[0].notice.phase, 'sent');
    assert.equal(env.state.sends.length, 1);
  } finally {
    await env.browser.close();
  }
});
