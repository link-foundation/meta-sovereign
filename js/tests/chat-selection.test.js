// A message's menu and selecting messages, as Telegram Desktop has them
// (R-Y67, R-Y68): the menu's items and their order (one message, a
// photo, a link, a selection), where it opens, clicks, drags and "Select
// up to this message", what Copy puts on the clipboard, the top bar,
// t.me links, Quote & Reply, swipe to reply, the keyboard's reply and
// edit, and who may pin. Fakes only — nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, translate } from '../src/web/i18n.js';
import {
  MAX_SELECTED,
  applyDrag,
  bulkSelect,
  menuItems,
  messageLink,
  quoteOf,
  rangeOf,
  selectionText,
  SelectionTop,
  toggleSelected,
} from '../src/web/chat-selection.js';
import { dragStarts, edgeScroll } from '../src/web/chat-drag.js';
import { swipeOffset, SWIPE_REPLY_PX } from '../src/web/chat-gestures.js';
import {
  DeleteDialog,
  MessageBubble,
  MsgContextMenu,
  PinDialog,
  menuPlace,
} from '../src/web/chat-message.js';
import { lastEditable, replyStep } from '../src/web/chat-actions.js';
import { canPinIn } from '../src/sources/telegram-chat-info.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const NOW = Date.parse('2026-10-21T12:00:00Z');

const msg = (id, extra = {}) => ({
  id: `msg:telegram:-1001234:${id}`,
  source: 'telegram',
  sender: 'u1',
  senderName: 'Alice',
  body: `text ${id}`,
  timestamp: new Date(NOW - 60_000 * (10 - id)).toISOString(),
  ...extra,
});

const render = (element, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale,
          setLocale: () => {},
          t: (key, vars) => translate(locale, key, vars),
        },
      },
      element
    )
  );

test('the menu lists what Telegram Desktop does, in its order', () => {
  const chat = { chat: '-1001234', personal: false, kind: 'group' };
  assert.deepEqual(
    menuItems({ message: msg(1), chat, info: { canPin: true }, now: NOW }),
    [
      'reply',
      'pin',
      'copy',
      'copyLink',
      'translate',
      'forward',
      'delete',
      'report',
      'select',
    ]
  );
  // Own and recent: Edit; part of the text selected: Quote & Reply and
  // Copy Selected Text first.
  assert.deepEqual(
    menuItems({
      message: msg(2, { sender: 'me' }),
      chat,
      selectedText: 'ext',
      now: NOW,
    }),
    [
      'quoteReply',
      'copySelected',
      'edit',
      'copyLink',
      'translate',
      'forward',
      'delete',
      'readers',
      'select',
    ]
  );
  // Too old to edit; pinned already; a private chat has no link.
  assert.deepEqual(
    menuItems({
      message: msg(3, {
        sender: 'me',
        timestamp: new Date(NOW - 3 * 86_400_000).toISOString(),
        raw: { pinned: true },
      }),
      chat: { chat: '42', personal: true },
      now: NOW,
    }),
    ['reply', 'unpin', 'copy', 'translate', 'forward', 'delete', 'select']
  );
  // Not sent yet: only Copy Text and Delete.
  assert.deepEqual(
    menuItems({ message: msg(4, { pending: true }), chat, now: NOW }),
    ['copy', 'delete']
  );
  // A channel's post link; a link under the pointer is copied instead.
  assert.ok(
    menuItems({ message: msg(5), chat: { ...chat, kind: 'channel' } }).includes(
      'copyPostLink'
    )
  );
  const onLink = menuItems({
    message: msg(5),
    chat,
    target: { url: 'https://example.org/' },
  });
  assert.ok(onLink.includes('copyUrl') && !onLink.includes('copyLink'));
});

test('a photo offers Save As and Copy Image; a sticker Save As', () => {
  const chat = { chat: '-1001234', kind: 'group' };
  assert.deepEqual(
    menuItems({ message: msg(1), chat, target: { photo: true } }),
    [
      'reply',
      'saveAs',
      'copyImage',
      'copyLink',
      'translate',
      'forward',
      'delete',
      'report',
      'select',
    ]
  );
  assert.deepEqual(
    menuItems({
      message: msg(2, { body: '' }),
      chat,
      target: { sticker: true },
    }),
    ['reply', 'saveAs', 'copyLink', 'forward', 'delete', 'report', 'select']
  );
});

test('with messages selected the menu is the selection’s', () => {
  const order = [1, 2, 3, 4].map((id) => msg(id).id);
  const selection = {
    ids: [order[0]],
    has: (id) => id === order[0],
    canForward: true,
    anyPinned: false,
  };
  const on = msg(1);
  assert.deepEqual(menuItems({ message: on, selection, order }), [
    'reply',
    'copySelectedItems',
    'forwardSelected',
    'deleteSelected',
    'clearSelection',
  ]);
  const other = msg(3);
  assert.deepEqual(menuItems({ message: other, selection, order }), [
    'reply',
    'select',
    'selectBulk',
  ]);
  assert.ok(
    menuItems({
      message: on,
      selection: { ...selection, anyPinned: true, canForward: false },
      order,
    }).includes('unpinSelected')
  );
});

test('a quote is only an exact part of the text', () => {
  assert.equal(quoteOf(msg(1), ' text '), 'text');
  assert.equal(quoteOf(msg(1), 'Alice text 1'), null);
  assert.equal(quoteOf(msg(1), ''), null);
});

test('a channel message has a t.me link; other chats none', () => {
  const message = msg(77);
  assert.equal(
    messageLink(message, { chat: '-1001234', username: 'team' }),
    'https://t.me/team/77'
  );
  assert.equal(
    messageLink(message, { chat: '-1001234' }),
    'https://t.me/c/1234/77'
  );
  assert.equal(
    messageLink({ ...message, id: 'msg:telegram:42:77' }, { chat: '42' }),
    null
  );
});

test('the menu opens at the pointer and stays inside the window', () => {
  const view = { width: 800, height: 600 };
  const size = { width: 200, height: 300 };
  assert.deepEqual(menuPlace({ x: 100, y: 100 }, size, view), {
    x: 100,
    y: 100,
  });
  // Near the right and bottom edges it opens to the left and above.
  assert.deepEqual(menuPlace({ x: 750, y: 500 }, size, view), {
    x: 550,
    y: 200,
  });
  // Never past the top-left margin.
  assert.deepEqual(
    menuPlace({ x: 150, y: 250 }, { width: 200, height: 590 }, view),
    { x: 150, y: 8 }
  );
});

test('the menu shows each item with Desktop’s label', () => {
  const html = render(
    React.createElement(MsgContextMenu, {
      x: 10,
      y: 10,
      message: msg(1),
      items: [
        'quoteReply',
        'saveAs',
        'copy',
        'copyLink',
        'pin',
        'select',
        'delete',
      ],
      onClose: () => {},
      onAction: () => {},
    })
  );
  for (const label of [
    'Quote &amp; Reply',
    'Save As…',
    'Copy Text',
    'Copy Message Link',
    'Pin',
    'Select',
    'Delete',
  ]) {
    assert.ok(html.includes(`>${label}</span>`), label);
  }
  assert.ok(html.includes('data-action="delete"'));
  assert.ok(html.includes('msg-context-reactions'));
  const selected = render(
    React.createElement(MsgContextMenu, {
      x: 10,
      y: 10,
      message: msg(1),
      items: ['copySelectedItems', 'clearSelection'],
      reactions: false,
      onClose: () => {},
      onAction: () => {},
    })
  );
  assert.ok(selected.includes('>Copy Selected as Text</span>'));
  assert.ok(selected.includes('>Clear Selection</span>'));
  assert.ok(!selected.includes('msg-context-reactions'));
});

test('a click adds or takes a message; Shift+click adds a range', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  let state = toggleSelected(undefined, 'b', { order });
  assert.deepEqual(state, { ids: ['b'], anchor: 'b' });
  state = toggleSelected(state, 'e', { shift: true, order });
  assert.deepEqual(state.ids, ['b', 'c', 'd', 'e']);
  state = toggleSelected(state, 'c', { order });
  assert.deepEqual(state.ids, ['b', 'd', 'e']);
  // Upward ranges too, without doubles.
  state = toggleSelected(state, 'a', { shift: true, order });
  assert.deepEqual(state.ids, ['b', 'd', 'e', 'a', 'c']);
});

test('at most a hundred messages are selected', () => {
  const order = Array.from({ length: 150 }, (_, i) => `m${i}`);
  let state = toggleSelected(undefined, 'm0', { order });
  state = toggleSelected(state, 'm149', { shift: true, order });
  assert.equal(state.ids.length, MAX_SELECTED);
  assert.equal(toggleSelected(state, 'm149', { order }).ids.length, 100);
  assert.equal(toggleSelected(state, 'm50', { order }).ids.length, 99);
});

test('a drag selects every message between; from a selected one, drops', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(rangeOf(order, 'd', 'b'), ['b', 'c', 'd']);
  assert.deepEqual(rangeOf(order, 'a', 'z'), []);
  assert.deepEqual(applyDrag(['a'], ['b', 'c'], true), ['a', 'b', 'c']);
  assert.deepEqual(applyDrag(['a', 'b', 'c'], ['b', 'c'], false), ['a']);
  const many = Array.from({ length: 120 }, (_, i) => `m${i}`);
  assert.equal(applyDrag([], many, true).length, MAX_SELECTED);
  // With nothing selected a drag starts once it leaves the message; with
  // some selected, after a few pixels.
  assert.equal(
    dragStarts({ selecting: false, dx: 0, dy: 90, from: 'a', over: 'a' }),
    false
  );
  assert.equal(
    dragStarts({ selecting: false, dx: 0, dy: 90, from: 'a', over: 'b' }),
    true
  );
  // A press beside the bubble selects its message after a few pixels,
  // in its own row too (R-Y83).
  assert.equal(
    dragStarts({
      selecting: false,
      beside: true,
      dx: 0,
      dy: 2,
      from: 'a',
      over: 'a',
    }),
    false
  );
  assert.equal(
    dragStarts({
      selecting: false,
      beside: true,
      dx: 1,
      dy: 5,
      from: 'a',
      over: 'a',
    }),
    true
  );
  assert.equal(
    dragStarts({ selecting: true, dx: 2, dy: 1, from: 'a', over: 'a' }),
    false
  );
  assert.equal(
    dragStarts({ selecting: true, dx: 3, dy: 2, from: 'a', over: 'a' }),
    true
  );
  // Near the list's edges the list scrolls.
  assert.ok(edgeScroll(105, 100, 700) < 0);
  assert.ok(edgeScroll(695, 100, 700) > 0);
  assert.equal(edgeScroll(400, 100, 700), 0);
});

test('Select up to this message adds from the nearest selected', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(bulkSelect(['b', 'f'], 'd', order), ['b', 'f', 'c', 'd']);
  assert.deepEqual(bulkSelect(['b', 'f'], 'e', order), ['b', 'f', 'e']);
  assert.equal(bulkSelect(['b'], 'b', order), null);
  assert.equal(bulkSelect([], 'b', order), null);
  const many = Array.from({ length: 150 }, (_, i) => `m${i}`);
  assert.equal(bulkSelect(['m0'], 'm140', many), null, 'past 100: no');
});

test('Copy gives one message as it is, several as Desktop does', () => {
  assert.equal(selectionText([msg(1)]), 'text 1');
  const describe = (m) => ({
    author: m.sender === 'me' ? 'Konstantin' : m.senderName,
    text: m.body,
    media: m.photo ? 'Photo' : null,
    reply: m.replyName
      ? { name: m.replyName, label: `in reply to ${m.replyName}`, text: 'hi' }
      : null,
  });
  const text = selectionText(
    [
      msg(3, { sender: 'me', replyName: 'Alice' }),
      msg(1),
      msg(2, { body: 'nice', photo: true }),
    ],
    { describe, stamp: (m) => `T${m.id.split(':').pop()}` }
  );
  assert.equal(
    text,
    [
      '[T1] Alice: text 1',
      '[T2] Alice: [ Photo ]',
      '',
      'nice',
      '[T3] Konstantin in reply to Alice:',
      '> hi',
      'text 3',
    ].join('\n')
  );
});

test('a swipe to the left replies; a scroll is no swipe', () => {
  assert.equal(swipeOffset(-5, 0), null);
  assert.equal(swipeOffset(-40, 5), -40);
  assert.equal(swipeOffset(-200, 10), -90);
  assert.equal(swipeOffset(-40, 60), null);
  assert.equal(swipeOffset(40, 0), null);
  assert.ok(SWIPE_REPLY_PX <= 90);
});

test('Ctrl+Up and Down move the reply; Up edits the last own message', () => {
  const list = [
    msg(1),
    msg(2, { sender: 'me' }),
    { ...msg(3), service: true },
    msg(4),
    msg(5, { pending: true }),
  ];
  assert.equal(replyStep(list, null, -1).id, list[3].id);
  assert.equal(replyStep(list, list[3].id, -1).id, list[1].id);
  assert.equal(replyStep(list, list[0].id, -1).id, list[0].id);
  assert.equal(replyStep(list, list[1].id, 1).id, list[3].id);
  assert.equal(replyStep(list, list[3].id, 1), null);
  assert.equal(replyStep(list, null, 1), null);
  assert.equal(lastEditable(list, NOW).id, list[1].id);
  assert.equal(lastEditable([msg(1)], NOW), null);
});

test('who may pin, as Telegram decides', () => {
  assert.equal(canPinIn({ creator: true, broadcast: true }), true);
  assert.equal(canPinIn({ broadcast: true }), false);
  assert.equal(
    canPinIn({ broadcast: true, adminRights: { editMessages: true } }),
    true
  );
  assert.equal(canPinIn({ megagroup: true }), true);
  assert.equal(
    canPinIn({ megagroup: true, defaultBannedRights: { pinMessages: true } }),
    false
  );
  assert.equal(
    canPinIn({
      megagroup: true,
      defaultBannedRights: { pinMessages: true },
      adminRights: { pinMessages: true },
    }),
    true
  );
  assert.equal(canPinIn({ bannedRights: { pinMessages: true } }), false);
});

test('selected messages show a check; the top bar counts them', () => {
  const html = render(
    React.createElement(MessageBubble, {
      message: msg(1),
      isPersonal: true,
      onAction: () => {},
      selecting: true,
      selected: true,
    })
  );
  assert.ok(html.includes('is-selected'));
  assert.ok(html.includes('bubble-check is-checked'));
  assert.ok(html.includes('aria-selected="true"'));
  assert.ok(html.includes(`data-row="${msg(1).id}"`));
  const top = render(
    React.createElement(SelectionTop, {
      count: 3,
      onClear: () => {},
      onForward: () => {},
      onDelete: () => {},
    })
  );
  assert.match(
    top,
    /data-action="forward"[^>]*><span>Forward<\/span><span class="selection-top-count">3</
  );
  assert.match(
    top,
    /data-action="delete"[^>]*><span>Delete<\/span><span class="selection-top-count">3</
  );
  assert.match(top, /data-action="clear"[^>]*><span>Cancel</);
  const unsent = render(
    React.createElement(SelectionTop, { count: 2, canForward: false })
  );
  assert.ok(!unsent.includes('data-action="forward"'));
  const ru = render(React.createElement(SelectionTop, { count: 5 }), 'ru');
  assert.ok(ru.includes('Удалить'));
});

test('a group’s incoming message has Desktop’s corner Reply', () => {
  const row = (extra) =>
    render(
      React.createElement(MessageBubble, {
        message: msg(1, extra),
        isPersonal: false,
        onAction: () => {},
        fastReply: true,
      })
    );
  assert.ok(row({}).includes('class="bubble-fast-reply"'));
  assert.ok(!row({ sender: 'me' }).includes('bubble-fast-reply'));
});

test('deleting several asks once; a pin asks as Telegram does', () => {
  const many = render(
    React.createElement(DeleteDialog, {
      messages: [msg(1, { sender: 'me' }), msg(2, { sender: 'me' })],
      isGroup: false,
      onClose: () => {},
      onDelete: () => {},
    })
  );
  assert.ok(many.includes('Delete 2 messages?'));
  assert.ok(many.includes('Delete for everyone'));
  const others = render(
    React.createElement(DeleteDialog, {
      messages: [msg(1, { sender: 'me' }), msg(2)],
      isGroup: false,
      onClose: () => {},
      onDelete: () => {},
    })
  );
  assert.ok(!others.includes('Delete for everyone'));
  const pin = render(
    React.createElement(PinDialog, {
      where: 'personal',
      name: 'Alice',
      onClose: () => {},
      onPin: () => {},
    })
  );
  assert.ok(pin.includes('Pin for me and Alice'));
  const group = render(
    React.createElement(PinDialog, {
      where: 'group',
      onClose: () => {},
      onPin: () => {},
    })
  );
  assert.ok(group.includes('Pin and notify all members'));
  const channel = render(
    React.createElement(PinDialog, {
      where: 'channel',
      onClose: () => {},
      onPin: () => {},
    })
  );
  assert.ok(!channel.includes('type="checkbox"'));
});

const post = async (path, body, account) => {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = { 'content-type': 'application/json' };
  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end(text) {
      this.body = text;
    },
  };
  await handleTelegramRoutes(req, res, path, { telegramAccount: account });
  return { status: res.status, body: JSON.parse(res.body) };
};

test('the pin route pins and unpins one message', async () => {
  const calls = [];
  const account = {
    status: async () => ({}),
    pinMessage: async (request) => {
      calls.push(request);
      return { ok: true, pinned: request.unpin ? null : request.id };
    },
  };
  const pinned = await post(
    '/api/telegram/pin',
    { chat: '-1001234', id: 7, oneSide: true },
    account
  );
  assert.equal(pinned.status, 200);
  assert.deepEqual(pinned.body, { ok: true, pinned: 7 });
  assert.deepEqual(calls[0], {
    chat: '-1001234',
    id: 7,
    unpin: false,
    oneSide: true,
    silent: false,
  });
  const unpinned = await post(
    '/api/telegram/pin',
    { chat: '-1001234', id: 7, unpin: true },
    account
  );
  assert.equal(unpinned.body.pinned, null);
  const bad = await post('/api/telegram/pin', { chat: '-1', id: 'x' }, account);
  assert.equal(bad.status, 400);
});
