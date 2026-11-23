import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatSummarizer } from '../src/web/chat-model.js';
import { freshChats } from '../src/web/chat-notify.js';
import { parseMessageParts } from '../src/web/message-parts.js';
import {
  messageAuthor,
  messageVisibility,
  telegramAuthor,
} from '../src/web/message-visibility.js';

const at = '2026-11-22T09:20:00.000Z';
const msg = (id, sender = '42', changes = {}) => ({
  source: 'telegram',
  id: `msg:telegram:-10071:${id}`,
  chat: '-10071',
  chatType: 'supergroup',
  chatName: 'Design group',
  sender,
  senderName: 'Ada',
  body: `Message ${id}`,
  timestamp: at,
  raw: { id },
  ...changes,
});
const ada = msg(1);
const rule = { source: 'telegram', id: '42', name: 'Ada', slot: 1 };
const visibility = messageVisibility([rule], 1);

test('author matching uses provider and Telegram account IDs while rejecting lookalikes', () => {
  assert.deepEqual(messageAuthor(ada), {
    source: 'telegram',
    id: '42',
    name: 'Ada',
  });
  assert.deepEqual(
    telegramAuthor({ source: 'telegram', chat: '42', name: 'Ada' }),
    messageAuthor(ada)
  );
  assert.equal(telegramAuthor({ source: 'telegram', chat: '-10071' }), null);
  assert.equal(messageVisibility([rule], 2).hides(ada), false);
  assert.equal(visibility.hides(msg(9, 'user42', { raw: undefined })), true);
  assert.deepEqual(
    visibility
      .show([
        ada,
        msg(2, '43'),
        msg(3, '42', { source: 'vk' }),
        msg(4, '42', { outgoing: true }),
        msg(5, '42', { service: 'join' }),
        msg(6, '42', { raw: { sender_chat: { id: -1 } } }),
        msg(7, '42', { raw: { fromId: { channelId: '42' } } }),
        msg(8, '-10042', { forwardedFrom: { id: '42', name: 'Ada' } }),
      ])
      .map((link) => link.id),
    [2, 3, 4, 5, 6, 7, 8].map((id) => msg(id).id)
  );
});

test('connected and imported providers need an address supplied by the adapter', () => {
  const identify = (source, sender, raw) =>
    messageAuthor({ source, sender, raw })?.id;
  assert.equal(identify('vk', '42'), '42');
  assert.equal(identify('facebook', '9191'), '9191');
  assert.equal(identify('x', '9007199254740993123'), '9007199254740993123');
  assert.equal(identify('whatsapp', '4200', { from: '4200' }), '4200');
  assert.equal(
    identify('linkedin', 'https://www.linkedin.com/in/ada-example/'),
    'https://www.linkedin.com/in/ada-example/'
  );
  assert.equal(identify('email', 'ada@example.org'), 'ada@example.org');
  assert.equal(identify('whatsapp', '4200', {}), undefined);
  assert.equal(identify('facebook', 'Ada'), undefined);
  assert.equal(identify('linkedin', 'Ada'), undefined);
  const vk = { source: 'vk', sender: '42' };
  assert.equal(
    messageVisibility([{ ...rule, source: 'vk' }], 2).hides(vk),
    true
  );
});

test('only a visible message can update previews, text search, and notifications', () => {
  const summarize = createChatSummarizer();
  const visible = msg(2, '43', { body: 'Public agenda' });
  const suppressed = msg(3, '42', { body: 'Concealed text' });
  const read = {
    id: 'read:telegram:-10071',
    source: 'telegram',
    chat: '-10071',
    inboxMaxId: 1,
    unreadTopId: 3,
    unreadCount: 2,
  };
  const links = [ada, visible, suppressed, read];
  const [initial] = summarize(links);
  assert.equal(initial.last.message, suppressed);
  const [filtered] = summarize(links, { visibility });
  assert.equal(filtered.last.message, visible);
  assert.equal(filtered.unread, 1);
  assert.equal(filtered.kind, 'group');
  assert.doesNotMatch(filtered.search, /concealed text/);
  const baseline = freshChats(null, [filtered]);
  const [next] = summarize([...links, msg(4)], { visibility });
  assert.equal(next.unread, 1);
  assert.equal(
    freshChats(baseline.seen, [next], { now: Date.parse(at) }).fresh.length,
    0
  );
  const [restored] = summarize(links, { visibility: messageVisibility([], 1) });
  assert.equal(restored.last.message, suppressed);
});

test('quotes from hidden senders cannot disclose the original or embedded quote', () => {
  const response = msg(2, '43', {
    replyTo: ada.id,
    raw: { id: 2, replyTo: { replyToMsgId: 1, quoteText: 'Concealed text' } },
  });
  assert.equal(
    parseMessageParts(response, visibility.lookup(new Map([[ada.id, ada]])))
      .replyRef.hidden,
    true
  );
  const unresolved = parseMessageParts(
    response,
    visibility.lookup(new Map())
  ).replyRef;
  assert.equal(unresolved?.text ?? null, null);
  assert.equal(unresolved?.quoteText ?? null, null);
  assert.match(
    JSON.stringify(
      parseMessageParts(response, new Map([[ada.id, ada]])).replyRef
    ),
    /Concealed text|Message 1/
  );
});
