// Emoji statuses (R-Y162): the source module with a fake client, the
// stored fields, the route validation and the page's pure helpers.
// Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmojiStatus,
  statusFields,
  statusOf,
} from '../src/sources/telegram-emoji-status.js';
import {
  validSet,
  validUntil,
} from '../src/server/routes-telegram-emoji-status.js';
import {
  DURATIONS,
  activeStatus,
  statusOfLink,
  untilOf,
} from '../src/web/emoji-status-model.js';
import { summarizeChats } from '../src/web/chat-model.js';
import { postRoute } from './helpers/post-route.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const make = ({ fail = null, premium = true, current = null } = {}) => {
  const log = [];
  const env = {
    now: () => 1_700_000_000_000,
    queue: { run: async (_k, _p, fn) => fn() },
    importer: async () => ({
      Api: {
        EmojiStatus: named('EmojiStatus'),
        EmojiStatusEmpty: named('EmojiStatusEmpty'),
        account: {
          GetDefaultEmojiStatuses: named('account.GetDefaultEmojiStatuses'),
          GetRecentEmojiStatuses: named('account.GetRecentEmojiStatuses'),
          UpdateEmojiStatus: named('account.UpdateEmojiStatus'),
        },
      },
      helpers: { returnBigInt: BigInt },
    }),
  };
  const actions = createEmojiStatus(env, {
    userClient: async () => ({
      invoke: async (request) => {
        log.push(request);
        if (fail) {
          throw Object.assign(new Error(fail), { errorMessage: fail });
        }
        if (request.className === 'account.GetDefaultEmojiStatuses') {
          return {
            statuses: [
              { documentId: 11n },
              { documentId: 12n, until: 1_700_100_000 },
            ],
          };
        }
        if (request.className === 'account.GetRecentEmojiStatuses') {
          return { className: 'account.EmojiStatusesNotModified' };
        }
        return true;
      },
      getMe: async () => ({ premium, emojiStatus: current }),
    }),
  });
  return { ...actions, log };
};

test('emojiStatuses: defaults and recent as plain ids, with Premium', async () => {
  const { emojiStatuses, log } = make({
    current: { documentId: 99n, until: 1_700_050_000 },
  });
  const got = await emojiStatuses();
  assert.deepEqual(got, {
    ok: true,
    premium: true,
    current: { id: '99', until: 1_700_050_000 },
    defaults: [{ id: '11' }, { id: '12', until: 1_700_100_000 }],
    recent: [],
  });
  assert.deepEqual(
    log.map((r) => [r.className, r.hash]),
    [
      ['account.GetDefaultEmojiStatuses', 0n],
      ['account.GetRecentEmojiStatuses', 0n],
    ]
  );
});

test('emojiStatusSet: a status with its time, and EmojiStatusEmpty', async () => {
  const { emojiStatusSet, log } = make();
  assert.deepEqual(
    await emojiStatusSet({
      documentId: '5368324170671202286',
      until: 1_700_003_600,
    }),
    { ok: true }
  );
  const sent = log[0].emojiStatus;
  assert.equal(sent.className, 'EmojiStatus');
  assert.equal(sent.documentId, 5368324170671202286n);
  assert.equal(sent.until, 1_700_003_600);
  await emojiStatusSet({ documentId: '7' });
  assert.equal('until' in log[1].emojiStatus, false);
  await emojiStatusSet({ documentId: null });
  assert.equal(log[2].emojiStatus.className, 'EmojiStatusEmpty');
});

test('emojiStatusSet refuses what is not valid before asking Telegram', async () => {
  const { emojiStatusSet, log } = make();
  for (const bad of [
    { documentId: 'x' },
    { documentId: '1', until: 1_600_000_000 },
    { documentId: '1', until: 1_700_000_000 + 400 * 86_400 },
    { documentId: '1', until: 1.5 },
  ]) {
    const got = await emojiStatusSet(bad);
    assert.deepEqual(
      [got.ok, got.code],
      [false, 'invalid'],
      JSON.stringify(bad)
    );
  }
  assert.equal(log.length, 0);
});

test('emojiStatusSet: Telegram refusing a non-Premium account is a code', async () => {
  const { emojiStatusSet } = make({ fail: 'PREMIUM_ACCOUNT_REQUIRED' });
  const got = await emojiStatusSet({ documentId: '1' });
  assert.deepEqual([got.ok, got.code], [false, 'premium']);
});

test('statusOf reads a plain and a collectible status; statusFields clears', () => {
  assert.deepEqual(statusOf({ documentId: 5n }), { id: '5' });
  assert.deepEqual(statusOf({ documentId: 5n, until: 9 }), {
    id: '5',
    until: 9,
  });
  assert.equal(statusOf({ className: 'EmojiStatusEmpty' }), null);
  assert.equal(statusOf(undefined), null);
  assert.deepEqual(statusFields({ emojiStatus: { documentId: 5n } }, 'emoji'), {
    emojiStatus: '5',
    emojiUntil: null,
  });
  assert.deepEqual(statusFields({ firstName: 'A' }, 'senderEmoji'), {
    senderEmojiStatus: null,
    senderEmojiUntil: null,
  });
  assert.deepEqual(statusFields(null, 'emoji'), {});
});

test('route validation: document ids and times', () => {
  const now = Date.now();
  const soon = Math.floor(now / 1000) + 3600;
  assert.equal(validSet({ documentId: null }), true);
  assert.equal(validSet({ documentId: null, until: soon }), false);
  assert.equal(validSet({ documentId: '123', until: soon }), true);
  assert.equal(validSet({ documentId: '123' }), true);
  for (const bad of [
    {},
    { documentId: 123 },
    { documentId: '' },
    { documentId: '12a' },
    { documentId: '1'.repeat(21) },
    { documentId: '1', until: Math.floor(now / 1000) - 5 },
    { documentId: '1', until: soon + 400 * 86_400 },
    { documentId: '1', until: String(soon) },
  ]) {
    assert.equal(validSet(bad), false, JSON.stringify(bad));
  }
  assert.equal(validUntil(undefined), true);
});

test('routes ask the account, and refuse a bad body', async () => {
  const seen = [];
  const account = {
    emojiStatuses: async () => ({ ok: true }),
    emojiStatusSet: async (body) => (seen.push(body), { ok: true }),
  };
  assert.equal(await postRoute('emoji-statuses', {}, account), 200);
  assert.equal(await postRoute('emoji-statuses', {}, {}), 400);
  assert.equal(
    await postRoute('emoji-status-set', { documentId: '5' }, account),
    200
  );
  assert.deepEqual(seen, [{ documentId: '5' }]);
  assert.equal(
    await postRoute('emoji-status-set', { documentId: 'x' }, account),
    400
  );
  assert.equal(await postRoute('emoji-status-set', {}, account), 400);
});

test('page: a status shows until its time and is hidden after', () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(activeStatus({ id: '5' }, now), { id: '5', until: 0 });
  assert.equal(activeStatus({ id: '5', until: 1_700_000_100 }, now).id, '5');
  assert.equal(activeStatus({ id: '5', until: 1_699_999_999 }, now), null);
  assert.equal(activeStatus({ id: 'x' }, now), null);
  assert.equal(activeStatus(null, now), null);
  assert.equal(untilOf(3600, now), 1_700_003_600);
  assert.equal(untilOf(null, now), undefined);
  assert.deepEqual(
    DURATIONS.map((d) => d.seconds),
    [3600, 7200, 28_800, 172_800, null]
  );
  assert.deepEqual(
    statusOfLink(
      { senderEmojiStatus: '7', senderEmojiUntil: 9 },
      'senderEmoji'
    ),
    {
      id: '7',
      until: 9,
    }
  );
  assert.equal(statusOfLink({ senderEmojiStatus: null }, 'senderEmoji'), null);
});

test("the chat list row carries the other person's status", () => {
  const at = new Date().toISOString();
  const message = (extra) => ({
    id: 'msg:telegram:5:1',
    source: 'telegram',
    chat: '5',
    chatType: 'personal_chat',
    chatName: 'Ann',
    sender: '5',
    senderName: 'Ann',
    body: 'hi',
    timestamp: at,
    ...extra,
  });
  const [fromMessage] = summarizeChats([message({ senderEmojiStatus: '77' })]);
  assert.deepEqual(fromMessage.emojiStatus, { id: '77' });
  const person = {
    id: 'person:telegram:5',
    emojiStatus: '88',
    emojiUntil: 1_900_000_000,
  };
  const [fromPerson] = summarizeChats([message({}), person]);
  assert.deepEqual(fromPerson.emojiStatus, { id: '88', until: 1_900_000_000 });
  const [none] = summarizeChats([message({})]);
  assert.equal(none.emojiStatus, undefined);
});
