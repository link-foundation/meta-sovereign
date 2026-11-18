// R-Z4: a message that may have gone out is told as such in the composer,
// and the outbox never sends it again by itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { failureText } from '../src/web/chat-failure.js';
import { afterFailure } from '../src/web/chat-outbox.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { MessageBubble } from '../src/web/chat-message.js';
import { ChatItem } from '../src/web/chat-list.js';
import { pendingChatPreviews } from '../src/web/chat-pending-preview.js';
import { summarizeChats } from '../src/web/chat-model.js';

const t = (key) => key;

test('"send-unknown" has its own words in every language', () => {
  for (const code of ['send-unknown', 'unknown-delivery']) {
    assert.equal(failureText(t, { code }), 'chat.failure.sendUnknown');
  }
  const key = 'chat.failure.sendUnknown';
  const en = translate('en', key);
  assert.notEqual(en, key);
  for (const lang of ['ru', 'hi', 'zh']) {
    assert.notEqual(translate(lang, key), en, lang);
  }
});

test('a maybe-delivered message is not tried again by itself', () => {
  const item = { clientId: 'c1', key: 'vk:1', status: 'sending' };
  const next = afterFailure(item, { code: 'send-unknown' }, 0);
  assert.equal(next.status, 'failed');
  assert.equal(next.retryAt, null);
});

test('shared failed bubbles and directory labels explain uncertain sends in every locale', () => {
  const link = {
    id: 'msg:telegram:42:1',
    source: 'telegram',
    chat: '42',
    sender: '42',
    body: 'Question',
    timestamp: '2026-01-01T12:00:00Z',
  };
  const item = {
    key: 'telegram:42',
    source: 'telegram',
    chat: '42',
    clientId: 'uncertain',
    text: 'Retained response',
    at: '2026-01-02T12:00:00Z',
    status: 'failed',
    code: 'send-unknown',
  };
  const chat = pendingChatPreviews(summarizeChats([link]), [item])[0];
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    const words = (key, vars) => translate(locale, key, vars);
    const render = (component, props) =>
      renderToStaticMarkup(
        React.createElement(
          LocaleContext.Provider,
          { value: { locale, t: words } },
          React.createElement(component, props)
        )
      );
    const message = {
      ...link,
      id: 'pending:uncertain',
      sender: 'me',
      body: item.text,
      delivery: 'failed',
      code: item.code,
      error: 'private backend diagnostic',
    };
    const bubble = render(MessageBubble, {
      message,
      composer: {},
      msgById: new Map(),
    });
    const row = render(ChatItem, { chat });
    const guidance = words('chat.failure.sendUnknown');
    assert.ok(bubble.includes(guidance), locale);
    assert.ok(row.includes(guidance), locale);
    assert.ok(!bubble.includes('private backend diagnostic'), locale);
    assert.ok(
      !bubble.includes(`aria-label="${words('chat.delivery.failed')}"`),
      locale
    );
  }
});
