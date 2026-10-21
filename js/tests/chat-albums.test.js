// Albums as Telegram shows them: the photos sent together are one bubble
// with a grid and one caption; a photo with no caption has a size of its
// own (it used to fold to nothing, leaving only its time); a forward
// names the channel it came from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  albumRows,
  expandAlbums,
  groupAlbums,
  rowIds,
} from '../src/web/chat-album.js';
import { photoBox } from '../src/web/chat-photo.js';
import { forwardKey, parseMessageParts } from '../src/web/message-parts.js';
import { MessageBubble, QuoteContext } from '../src/web/chat-message.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { nameForwards } from '../src/sources/telegram-repair.js';
import { createMemoryStore } from '../src/storage/universal.js';

const photo = (w, h) => ({
  className: 'MessageMediaPhoto',
  photo: {
    className: 'Photo',
    id: '1',
    sizes: [{ className: 'PhotoSize', type: 'm', w, h, size: 1 }],
  },
});

const item = (
  id,
  { album = '77', body = '📎', fwd = null, w = 800, h = 600 } = {}
) => ({
  id: `msg:telegram:-1001:${id}`,
  source: 'telegram',
  chat: '-1001',
  sender: '-1001',
  body,
  timestamp: '2026-10-21T16:08:51.000Z',
  raw: {
    groupedId: album,
    media: photo(w, h),
    ...(fwd ? { fwdFrom: fwd } : {}),
  },
});

test('the photos sent together are one row, led by the one with the caption', () => {
  const rows = groupAlbums([
    item(1, { album: null, body: 'before' }),
    item(2),
    item(3, { body: 'Квартира с 2 спальнями' }),
    item(4),
    item(5, { album: '78' }),
    item(6, { album: '78' }),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].id, 'msg:telegram:-1001:3', 'the caption leads');
  assert.deepEqual(rowIds(rows[1]), [
    'msg:telegram:-1001:2',
    'msg:telegram:-1001:3',
    'msg:telegram:-1001:4',
  ]);
  assert.equal(rows[2].id, 'msg:telegram:-1001:5', 'no caption: the first');
  assert.equal(expandAlbums(rows).length, 6, 'an action takes every item');
});

test('the grid: rows that fill the width, the short ones first', () => {
  const sizes = (n, ratio = 1) =>
    albumRows(Array.from({ length: n }, () => ratio)).map(
      (r) => r.items.length
    );
  assert.deepEqual(sizes(1), [1]);
  assert.deepEqual(sizes(2), [2]);
  assert.deepEqual(sizes(2, 2), [1, 1], 'two wide ones stand one above');
  assert.deepEqual(sizes(5), [2, 3]);
  assert.deepEqual(sizes(10), [2, 2, 3, 3]);
  const [row] = albumRows([1.5, 0.75]);
  assert.equal(row.aspect, 2.25, 'as wide as its items side by side');
  assert.equal(albumRows([10])[0].items[0].ratio, 2.2, 'a panorama is held');
});

test('a photo with no caption has its own size', () => {
  assert.deepEqual(photoBox({ aspectRatio: 4 / 3 }), {
    width: '320px',
    maxWidth: '100%',
    aspectRatio: String(4 / 3),
  });
  assert.equal(photoBox({ aspectRatio: 0.5 }).width, '160px');
});

const render = (message, chatName = () => null) =>
  renderToStaticMarkup(
    React.createElement(
      QuoteContext.Provider,
      { value: { selfName: null, api: null, chatName } },
      React.createElement(MessageBubble, { message, isPersonal: true })
    )
  );

test('an album is one bubble: a tile for each photo, one caption', () => {
  const [album] = groupAlbums([
    item(1, { body: 'Квартира' }),
    item(2),
    item(3),
  ]);
  const html = render(album);
  assert.equal((html.match(/data-album-item=/g) ?? []).length, 3);
  assert.equal((html.match(/class="bubble-body"/g) ?? []).length, 1);
  assert.match(
    html,
    /data-items="msg:telegram:-1001:1 msg:telegram:-1001:2 msg:telegram:-1001:3"/
  );
  assert.match(html, /has-visual/);
});

test('a forward names the channel it came from, never "PeerChannel"', () => {
  const fwd = { fromId: { className: 'PeerChannel', channelId: '42' } };
  assert.equal(forwardKey(fwd.fromId), 'telegram:-10042');
  const message = item(1, { album: null, body: 'post', fwd });
  assert.equal(parseMessageParts(message).fwdFrom.fromName, null);
  const named = render(message, (key) =>
    key === 'telegram:-10042' ? 'AN-HOME' : null
  );
  assert.match(named, /AN-HOME/);
  assert.doesNotMatch(render(message), /PeerChannel/);
  // Stored with the name when Telegram gives it.
  const [link] = telegramDialogLinks(
    { id: '-1001', title: 'Аренда', isChannel: true },
    [
      {
        id: 5,
        message: 'post',
        date: 1,
        fwdFrom: fwd,
        forward: { chat: { title: 'AN-HOME' } },
      },
    ]
  );
  assert.deepEqual(link.forwardedFrom, { name: 'AN-HOME' });
});

test('forwards stored without their source are read again once, and named', async () => {
  const store = createMemoryStore();
  const peer = (channelId) => ({ className: 'PeerChannel', channelId });
  await store.put(
    item(1, { album: null, body: 'a', fwd: { fromId: peer('42') } })
  );
  await store.put(
    item(2, { album: null, body: 'b', fwd: { fromId: peer('42') } })
  );
  // Named already, from a known chat, or hidden by name: left alone.
  await store.put({
    ...item(3, { album: null, body: 'c', fwd: { fromId: peer('43') } }),
    forwardedFrom: { name: 'Known' },
  });
  await store.put(
    item(4, { album: null, body: 'd', fwd: { fromId: peer('1') } })
  );
  await store.put(
    item(5, { album: null, body: 'e', fwd: { fromName: 'Hidden' } })
  );
  // Telegram asks to wait twice; the repair waits and asks again.
  const asked = [];
  const waits = [];
  const refresh = async ({ chat, ids, priority }) => {
    asked.push([chat, ids, priority]);
    if (asked.length <= 2) {
      throw Object.assign(new Error('Telegram asked to wait'), {
        code: 'flood-wait',
        retryAfter: 21,
      });
    }
    for (const id of ids) {
      const link = await store.get(`msg:telegram:${chat}:${id}`);
      await store.put({ ...link, forwardedFrom: { name: 'AN-HOME' } });
    }
  };
  const logged = [];
  assert.equal(
    await nameForwards(store, {
      refresh,
      log: (e) => logged.push(e),
      wait: async (ms) => waits.push(ms),
    }),
    2
  );
  assert.deepEqual(asked, Array(3).fill(['-1001', [1, 2], 'prefetch']));
  assert.deepEqual(waits, [21_000, 21_000], 'waited as Telegram asked');
  assert.equal(logged[0].left, 0);
  assert.equal(logged[0].failed, 0);
  assert.equal(
    (await store.get('msg:telegram:-1001:1')).forwardedFrom.name,
    'AN-HOME'
  );
  assert.equal(await nameForwards(store, { refresh }), 0, 'once');
});
