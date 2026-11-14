import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { unreadNoticeFixture } from '../../experiments/issue-56/unread-notice-fixture.mjs';
import { unreadInput } from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import { noticeReply } from '../../experiments/issue-56/notice-fixture.mjs';
import {
  questionBrowserCli,
  questionBrowserHttp,
} from '../../experiments/issue-56/question-browser-clients.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { questionBrowserApi } from '../src/web/question-browser-api.js';
import { BrowserUnreadControls } from '../src/web/question-unread-controls.js';
import { LocaleContext, translate } from '../src/web/i18n.js';

const enabled = { acknowledgements: 'reply' };

test(
  'CLI notice mode is explicit and recovers the same confirmed receipt without replay',
  { timeout: 5000 },
  async () => {
    const env = await unreadNoticeFixture({ notices: enabled });
    const call = questionBrowserCli(env);
    try {
      assert.equal(
        (
          await call('unread', {
            source: 'hh',
            confirm: true,
            'notice-replies': 'yes',
          })
        ).code,
        1
      );
      assert.equal(env.state.scans.length, 0);
      const result = await call('unread', {
        source: 'hh',
        confirm: true,
        'notice-replies': 'true',
        'pass-id': env.input.id,
      });
      assert.equal(result.code, 0);
      assert.equal(
        result.value.entries[0].notice.outbox.receipt.text,
        noticeReply
      );
      assert.equal(
        (await call('unread-status', { 'pass-id': env.input.id })).value
          .noticeReplies,
        true
      );
      assert.equal(env.state.sends.length, 1);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'both Lino formats retain notice admission and full positive receipt identity',
  { timeout: 15000 },
  async () => {
    const env = await unreadNoticeFixture({ notices: enabled });
    const { server, call } = await questionBrowserHttp(env);
    try {
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const input = unreadInput({ noticeReplies: true });
        const started = await call('unread-start', input, media);
        assert.equal(started.status, 200);
        let saved;
        for (let attempt = 0; attempt < 100; attempt++) {
          saved = (await call('unread-status', input, media)).body;
          if (saved.state !== 'active') {
            break;
          }
          await delay(5);
        }
        assert.equal(saved.state, 'completed');
        assert.equal(saved.noticeReplies, true);
        assert.equal(saved.entries[0].notice.phase, 'sent');
        assert.equal(saved.entries[0].notice.outbox.receipt.text, noticeReply);
      }
      assert.equal(
        env.state.sends.length,
        1,
        'Both passes reserve the same observed question'
      );
    } finally {
      await server.close();
      await env.browser.close();
    }
  }
);

test('wire clients refuse fabricated notice delivery and preserve read-only status recovery', async () => {
  const env = await unreadNoticeFixture({ notices: enabled });
  try {
    const result = await env.complete();
    const entry = result.entries[0];
    for (const notice of [
      { ...entry.notice, outbox: null },
      {
        ...entry.notice,
        outbox: {
          ...entry.notice.outbox,
          receipt: { ...entry.notice.outbox.receipt, chat: '9' },
        },
      },
      {
        ...entry.notice,
        outbox: { ...entry.notice.outbox, text: 'Invented answer' },
      },
      { ...entry.notice, selection: { ...entry.notice.selection, chat: '9' } },
      { phase: 'sent', kind: 'acknowledgements' },
    ]) {
      const api = questionBrowserApi({
        remote: {
          report: async () => ({ ...result, entries: [{ ...entry, notice }] }),
        },
      });
      await assert.rejects(api.browserUnreadReviewStatus(env.input));
    }
    const incomplete = questionBrowserApi({
      remote: {
        report: async () => ({ ...result, entries: [{ chat: entry.chat }] }),
      },
    });
    await assert.rejects(incomplete.browserUnreadReviewStatus(env.input));
    const calls = [];
    const api = questionBrowserApi({
      remote: {
        report: async (_path, input, settings) => {
          calls.push(settings);
          return env.browser.unreadStatus(input);
        },
      },
    });
    assert.equal(
      (await api.browserUnreadReviewStatus(env.input)).entries[0].notice.phase,
      'sent'
    );
    assert.deepEqual(calls, [{ network: true, read: true }]);
    assert.equal(env.state.sends.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('all four locales expose explicit supported notice mode without changing default read-only admission', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const name of [
      'notices',
      'noticesHint',
      'startNotices',
      'activeNotices',
      'pausedNotices',
    ]) {
      const key = `browserUnread.${name}`;
      assert.notEqual(translate(locale, key), key);
      if (locale !== 'en') {
        assert.notEqual(translate(locale, key), translate('en', key));
      }
    }
    const render = (noticesAvailable) =>
      renderToStaticMarkup(
        React.createElement(
          LocaleContext.Provider,
          {
            value: {
              locale,
              t: (key, values) => translate(locale, key, values),
            },
          },
          React.createElement(BrowserUnreadControls, {
            available: true,
            noticesAvailable,
            source: 'hh',
            api: {
              startBrowserUnreadReview: () =>
                assert.fail('Rendering starts nothing'),
            },
            remember: () => '',
            changed: () => {},
          })
        )
      );
    const supported = render(true);
    const unsupported = render(false);
    assert.equal(supported.includes('data-browser-unread-notices'), true);
    assert.equal(unsupported.includes('data-browser-unread-notices'), false);
    assert.equal(
      supported.includes(translate(locale, 'browserUnread.notices')),
      true
    );
    assert.equal(supported.includes('browserUnread.'), false);
    assert.equal((supported.match(/checked=""/gu) ?? []).length, 0);
  }
});
