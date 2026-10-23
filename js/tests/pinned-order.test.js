// Reordering the pinned chats (R-Y159): the request made to Telegram, the
// route's strict validation, the page's pure order helpers, the drag's
// landing place and the menu's Move up / Move down. Fake clients; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPinnedOrder,
  validOrder,
} from '../src/sources/telegram-pinned-order.js';
import { postRoute } from './helpers/post-route.js';
import {
  applyOrder,
  moveKey,
  pinnedKeys,
  reorderRequest,
} from '../src/web/chat-pin-order.js';
import { dropIndex, slideOf } from '../src/web/chat-pin-drag.js';
import { chatMenuItems } from '../src/web/chat-list-menu.js';
import { sortChats } from '../src/web/chat-model.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  InputDialogPeer: named('InputDialogPeer'),
  messages: { ReorderPinnedDialogs: named('ReorderPinnedDialogs') },
};

const make = ({ stored = [], fail = null } = {}) => {
  const log = [];
  const live = [];
  const client = {
    invoke: async (request) => {
      if (fail) {
        throw fail;
      }
      log.push(request);
      return true;
    },
    getInputEntity: async (chat) => ({ resolved: chat }),
  };
  const actions = createPinnedOrder(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: { withPeer: async (_c, chat, use) => use(chat) },
      store: { query: async (match) => stored.filter(match) },
      live: { handle: async (_c, update) => live.push(update) },
    },
    { userClient: async () => client }
  );
  return { actions, log, live };
};

test('the order goes to Telegram with force, for the folder', async () => {
  const { actions, log, live } = make();
  const answer = await actions.reorderPinned({
    folder: 0,
    chats: ['333', '-2002', '111'],
  });
  assert.deepEqual(answer, {
    ok: true,
    folder: 0,
    chats: ['333', '-2002', '111'],
  });
  const [call] = log;
  assert.equal(call.className, 'ReorderPinnedDialogs');
  assert.equal(call.force, true);
  assert.equal(call.folderId, 0);
  assert.deepEqual(
    call.order.map((o) => [o.className, o.peer.resolved]),
    [
      ['InputDialogPeer', '333'],
      ['InputDialogPeer', '-2002'],
      ['InputDialogPeer', '111'],
    ]
  );
  // The list follows: the update other devices get, in the same order.
  assert.equal(live[0].className, 'UpdatePinnedDialogs');
  assert.deepEqual(
    live[0].order.map((o) => o.peer.userId ?? o.peer.chatId),
    ['333', '2002', '111']
  );
});

test('the Archive is folder 1, and a pinned chat left out is kept', async () => {
  const pinned = (chat, pinnedRank, folder) => ({
    kind: 'read',
    source: 'telegram',
    chat,
    pinnedRank,
    folder,
  });
  const { actions, log } = make({
    stored: [
      pinned('1', 1, 1),
      pinned('2', 2, 1),
      pinned('3', 3, 1),
      pinned('9', 1, 0),
    ],
  });
  const answer = await actions.reorderPinned({ folder: 1, chats: ['2', '1'] });
  assert.deepEqual(answer.chats, ['2', '1', '3']);
  assert.equal(log[0].folderId, 1);
  assert.equal(log[0].order.length, 3);
});

test('a bad request is refused before Telegram is asked', async () => {
  const { actions, log } = make();
  for (const bad of [
    { folder: 2, chats: ['1'] },
    { folder: 0, chats: [] },
    { folder: 0, chats: ['1', '1'] },
    { folder: 0, chats: ['x'] },
    { folder: 0, chats: [1] },
    { folder: '0', chats: ['1'] },
    undefined,
  ]) {
    assert.equal((await actions.reorderPinned(bad)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('Telegram refusing becomes a code', async () => {
  const { actions } = make({
    fail: Object.assign(new Error('x'), {
      errorMessage: 'PINNED_DIALOGS_TOO_MUCH',
    }),
  });
  const answer = await actions.reorderPinned({ folder: 0, chats: ['1'] });
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'too-many');
});

test('validOrder: at most 100 distinct chat ids', () => {
  const many = Array.from({ length: 100 }, (_, i) => String(i + 1));
  assert.equal(validOrder(many), true);
  assert.equal(validOrder([...many, '101']), false);
  assert.equal(validOrder(['-100123', '5']), true);
  assert.equal(validOrder('1'), false);
});

test('the route validates strictly', async () => {
  const asked = [];
  const account = {
    reorderPinned: async (request) => {
      asked.push(request);
      return { ok: true };
    },
  };
  assert.equal(
    await postRoute(
      'pinned-reorder',
      { folder: 0, chats: ['1', '2'] },
      account
    ),
    200
  );
  assert.deepEqual(asked, [{ folder: 0, chats: ['1', '2'] }]);
  for (const bad of [
    {},
    { folder: 0 },
    { folder: 3, chats: ['1'] },
    { folder: 0, chats: ['1', '1'] },
    { folder: 0, chats: ['a'] },
    { folder: 0, chats: Array.from({ length: 101 }, (_, i) => String(i + 1)) },
  ]) {
    assert.equal(await postRoute('pinned-reorder', bad, account), 400);
  }
  assert.equal(asked.length, 1);
  assert.equal(
    await postRoute('pinned-reorder', { folder: 0, chats: ['1'] }, {}),
    400
  );
});

const chat = (n, pinned = 0) => ({
  source: 'telegram',
  key: `telegram:${n}`,
  chat: String(n),
  pinned,
});

test('order helpers move and apply the pinned order', () => {
  const chats = [chat(1, 1), chat(2, 2), chat(3, 3), chat(4), chat(5)];
  const keys = pinnedKeys(chats);
  assert.deepEqual(keys, ['telegram:1', 'telegram:2', 'telegram:3']);
  const moved = moveKey(keys, 2, 0);
  assert.deepEqual(moved, ['telegram:3', 'telegram:1', 'telegram:2']);
  assert.equal(moveKey(keys, 0, -1), keys);
  assert.equal(moveKey(keys, 2, 3), keys);
  assert.deepEqual(
    applyOrder(chats, moved).map((c) => c.chat),
    ['3', '1', '2', '4', '5']
  );
  assert.equal(applyOrder(chats, null), chats);
  assert.deepEqual(reorderRequest(moved, chats, 'main'), {
    folder: 0,
    chats: ['3', '1', '2'],
  });
  assert.equal(reorderRequest(moved, chats, 'archive').folder, 1);
  assert.equal(reorderRequest([], chats, 'main'), null);
});

test('the list keeps Telegram pinned order, not the date', () => {
  const at = (n, pinned, last) => ({ ...chat(n, pinned), last: { at: last } });
  const sorted = sortChats([
    at(1, 2, '2025-01-03T00:00:00Z'),
    at(2, 0, '2025-01-09T00:00:00Z'),
    at(3, 1, '2025-01-01T00:00:00Z'),
  ]);
  assert.deepEqual(
    sorted.map((c) => c.chat),
    ['3', '1', '2']
  );
});

test('a dragged row lands where its middle is, the others slide', () => {
  const rects = [0, 1, 2, 3].map((i) => ({ top: i * 60, height: 60 }));
  assert.equal(dropIndex(rects, 2, 0), 2);
  assert.equal(dropIndex(rects, 2, -130), 0);
  assert.equal(dropIndex(rects, 0, 70), 1);
  assert.equal(dropIndex(rects, 0, 500), 3);
  assert.equal(dropIndex(rects, 9, 0), 9);
  assert.deepEqual(
    [0, 1, 2, 3].map((at) => slideOf(at, 2, 0)),
    [1, 1, 0, 0]
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((at) => slideOf(at, 0, 2)),
    [0, -1, -1, 0]
  );
});

test('the menu offers Move up / Move down only where they move', () => {
  const pinned = chat(1, 1);
  const items = (position) => chatMenuItems(pinned, { position });
  assert.ok(!items(null).includes('pinUp'));
  assert.ok(!items({ index: 0, count: 3 }).includes('pinUp'));
  assert.ok(items({ index: 0, count: 3 }).includes('pinDown'));
  assert.ok(items({ index: 1, count: 3 }).includes('pinUp'));
  assert.ok(items({ index: 1, count: 3 }).includes('pinDown'));
  assert.ok(!items({ index: 2, count: 3 }).includes('pinDown'));
  const plain = { ...chat(2), source: 'telegram' };
  assert.ok(
    !chatMenuItems(plain, { position: { index: 1, count: 3 } }).includes(
      'pinUp'
    )
  );
});
