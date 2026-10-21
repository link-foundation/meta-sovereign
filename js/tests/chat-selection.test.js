// A message's menu and selecting messages, as Telegram's apps have them
// (R-Y67): the menu's items and their order, where it opens, the
// selection's clicks and Shift+clicks, what Copy puts on the clipboard,
// t.me links, swipe to reply, the keyboard's reply and edit, and who may
// pin. Fakes only — nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, translate } from '../src/web/i18n.js';
import {
  MAX_SELECTED,
  menuItems,
  messageLink,
  selectionText,
  SelectionBar,
  toggleSelected,
} from '../src/web/chat-selection.js';
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

test('the menu lists what Telegram does, in its order', () => {
  const chat = { chat: '-1001234', personal: false };
  assert.deepEqual(
    menuItems({ message: msg(1), chat, info: { canPin: true }, now: NOW }),
    ['reply', 'copy', 'copyLink', 'pin', 'forward', 'select', 'delete']
  );
  // Own and recent: Edit; part of the text selected: Copy Selected Text.
  assert.deepEqual(
    menuItems({
      message: msg(2, { sender: 'me' }),
      chat,
      selectedText: 'ext',
      now: NOW,
    }),
    ['reply', 'edit', 'copySelected', 'copyLink', 'forward', 'select', 'delete']
  );
  // Too old to edit; pinned already; in the selection.
  assert.deepEqual(
    menuItems({
      message: msg(3, {
        sender: 'me',
        timestamp: new Date(NOW - 3 * 86_400_000).toISOString(),
        raw: { pinned: true },
      }),
      chat: { chat: '42', personal: true },
      selected: true,
      now: NOW,
    }),
    ['reply', 'copy', 'unpin', 'forward', 'unselect', 'delete']
  );
  // Not sent yet: only Copy and Delete.
  assert.deepEqual(
    menuItems({ message: msg(4, { pending: true }), chat, now: NOW }),
    ['copy', 'delete']
  );
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

test('the menu shows each item with its label', () => {
  const html = render(
    React.createElement(MsgContextMenu, {
      x: 10,
      y: 10,
      message: msg(1),
      items: ['reply', 'copyLink', 'pin', 'select', 'delete'],
      onClose: () => {},
      onAction: () => {},
    })
  );
  for (const label of ['Reply', 'Copy link', 'Pin', 'Select', 'Delete']) {
    assert.ok(html.includes(`>${label}</span>`), label);
  }
  assert.ok(html.includes('data-action="delete"'));
  assert.ok(html.includes('msg-context-reactions'));
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

test('Copy gives one message as it is, several under their names', () => {
  assert.equal(selectionText([msg(1)]), 'text 1');
  const text = selectionText(
    [msg(3, { sender: 'me' }), msg(1), { ...msg(2), body: '' }],
    { me: 'You' }
  );
  const lines = text.split('\n');
  assert.match(lines[0], /^Alice, \[\d\d\.\d\d\.2026 \d\d:\d\d\]$/);
  assert.equal(lines[1], 'text 1');
  assert.equal(lines[2], '');
  assert.match(lines[3], /^You, \[/);
  assert.equal(lines[4], 'text 3');
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
  assert.equal(lastEditable(list).id, list[1].id);
  assert.equal(lastEditable([msg(1)]), null);
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

test('selected messages show a check and the bar counts them', () => {
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
  const bar = render(
    React.createElement(SelectionBar, {
      count: 3,
      onClear: () => {},
      onCopy: () => {},
      onForward: () => {},
      onDelete: () => {},
    })
  );
  assert.ok(bar.includes('3 messages'));
  const ru = render(React.createElement(SelectionBar, { count: 5 }), 'ru');
  assert.ok(ru.includes('5 сообщений'));
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
