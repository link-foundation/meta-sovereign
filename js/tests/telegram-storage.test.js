// Local storage management, reaction notifications, resetting the
// notification settings and the automatic-download preset (R-Y215): the
// cache counted and cleared inside a temp folder only, the limits, the
// requests built, the routes' strict validation and the page's pure
// helpers. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createStorage,
  expired,
  kindOfFile,
  kindOfMime,
  limitsFrom,
  validClear,
  validLimits,
} from '../src/sources/telegram-storage.js';
import {
  createNotifyExtras,
  fromOf,
  presetOf,
  reactionRowOf,
} from '../src/sources/telegram-notify-extras.js';
import { assertMode } from './helpers/mode.js';
import { DEFAULTS, settingsFromPreset } from '../src/web/auto-download.js';
import { bytesText } from '../src/web/settings-storage.js';
import {
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const DAY = 24 * 3600 * 1000;

// A temp media folder holding a cache of every kind, and a file beside it
// that must never be touched.
const withCache = async (use) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-'));
  const dir = path.join(base, 'media', 'telegram');
  const put = async (name, size, type) => {
    const file = path.join(dir, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.alloc(size));
    if (type) {
      await fs.writeFile(`${file}.type`, type);
    }
    return file;
  };
  await put('100/1-m', 1000, 'image/jpeg');
  await put('100/2-file', 5000, 'video/mp4');
  await put('100/3-file', 300, 'audio/ogg');
  await put('-1005/4-file', 200, 'application/pdf');
  await put('stickers/s1', 50, 'image/webp');
  await put('avatars/9-s', 20, 'image/jpeg');
  const outside = path.join(base, 'store.db');
  await fs.writeFile(outside, 'database');
  try {
    await use({ base, dir, put, outside });
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
};

const storage = (dir) =>
  createStorage({ now: () => NOW }, { mediaDir: dir, timer: false });

test('the cache is counted by kind and by chat from names and recorded types', async () => {
  await withCache(async ({ dir }) => {
    const usage = await storage(dir).storageUsage();
    assert.equal(usage.ok, true);
    assert.equal(usage.kinds.photos.files, 1);
    assert.equal(usage.kinds.videos.files, 1);
    assert.equal(usage.kinds.voice.files, 1);
    assert.equal(usage.kinds.files.files, 1);
    assert.equal(usage.kinds.stickers.files, 1);
    assert.equal(usage.kinds.other.files, 1);
    assert.equal(usage.total.files, 6);
    // The .type file goes with its file in the size.
    assert.equal(usage.kinds.photos.bytes, 1000 + 'image/jpeg'.length);
    assert.deepEqual(
      usage.chats.map((c) => c.chat),
      ['100', '-1005']
    );
    assert.deepEqual(usage.limits, { maxGb: 0, olderDays: 0 });
  });
});

test('clearing a kind removes only that kind, clear all only the cache', async () => {
  await withCache(async ({ dir, outside }) => {
    const s = storage(dir);
    const cleared = await s.storageClear({ kind: 'videos' });
    assert.equal(cleared.removed.files, 1);
    await assert.rejects(fs.stat(path.join(dir, '100/2-file')));
    await assert.rejects(fs.stat(path.join(dir, '100/2-file.type')));
    await fs.stat(path.join(dir, '100/1-m'));
    await s.storageClear({ all: true });
    assert.equal((await s.storageUsage()).total.files, 0);
    assert.equal(await fs.readFile(outside, 'utf8'), 'database');
  });
});

test('a symbolic link is neither counted nor followed out of the folder', async () => {
  await withCache(async ({ dir, base, outside }) => {
    const secret = path.join(base, 'secret');
    await fs.mkdir(secret);
    await fs.writeFile(path.join(secret, 'keep'), 'sessions');
    await fs.symlink(secret, path.join(dir, '100', 'linkdir'));
    await fs.symlink(outside, path.join(dir, '100', '9-file'));
    const s = storage(dir);
    assert.equal((await s.storageUsage()).total.files, 6);
    await s.storageClear({ all: true });
    assert.equal(await fs.readFile(outside, 'utf8'), 'database');
    assert.equal(
      await fs.readFile(path.join(secret, 'keep'), 'utf8'),
      'sessions'
    );
  });
});

test('bad requests and a missing folder change nothing', async () => {
  const none = createStorage({}, { mediaDir: null, timer: false });
  assert.equal((await none.storageUsage()).code, 'unavailable');
  await withCache(async ({ dir }) => {
    const s = storage(dir);
    for (const body of [
      {},
      { kind: 'x' },
      { all: false },
      { all: true, kind: 'photos' },
    ]) {
      assert.equal((await s.storageClear(body)).code, 'bad-request');
    }
    assert.equal(
      (await s.storageLimitsSet({ maxGb: 2, olderDays: 0 })).code,
      'bad-request'
    );
    assert.equal((await s.storageUsage()).total.files, 6);
  });
});

test('limits are kept, and the old and then the least recently used files go', async () => {
  await withCache(async ({ dir }) => {
    const old = new Date(NOW - 40 * DAY);
    await fs.utimes(path.join(dir, '100/1-m'), old, old);
    const s = storage(dir);
    assert.deepEqual((await s.storageLimits()).olderDays, 0);
    const set = await s.storageLimitsSet({ maxGb: 0, olderDays: 30 });
    assert.equal(set.olderDays, 30);
    assert.equal(set.removed.files, 1);
    // The limits file is private (R-Z2).
    await assertMode(path.join(dir, '.cache-limits.json'), 0o600);
    await assert.rejects(fs.stat(path.join(dir, '100/1-m')));
    // The limits file is not cache: it is not counted or cleared.
    assert.equal((await s.storageUsage()).total.files, 5);
    await s.storageClear({ all: true });
    assert.equal((await s.storageLimits()).olderDays, 30);
  });
});

test('expired picks by age, then least recently used until the rest fit', () => {
  const GB = 1024 ** 3;
  const files = [
    { bytes: GB, used: NOW - 10 * DAY },
    { bytes: GB, used: NOW - 1 * DAY },
    { bytes: GB, used: NOW - 5 * DAY },
    { bytes: 10, used: NOW - 400 * DAY },
  ];
  assert.deepEqual(expired(files, { maxGb: 0, olderDays: 365 }, NOW), [3]);
  assert.deepEqual(
    expired(files, { maxGb: 1, olderDays: 0 }, NOW).sort(),
    [0, 2, 3]
  );
  assert.deepEqual(expired(files, { maxGb: 0, olderDays: 0 }, NOW), []);
  assert.deepEqual(limitsFrom({ maxGb: 7, olderDays: 30 }), {
    maxGb: 0,
    olderDays: 30,
  });
  assert.equal(validLimits({ maxGb: 5, olderDays: 365 }), true);
  assert.equal(validLimits({ maxGb: 5 }), false);
  assert.equal(validClear({ all: true }), true);
  assert.equal(validClear({ kind: 'photos' }), true);
  assert.equal(validClear({ kind: 'nope' }), false);
});

test('kinds come from folders, names and recorded types', () => {
  assert.equal(kindOfFile(['stickers', 'a']), 'stickers');
  assert.equal(kindOfFile(['custom-emoji', 'a']), 'stickers');
  assert.equal(kindOfFile(['wallpapers', 'a']), 'other');
  assert.equal(kindOfFile(['100', '1-m']), 'photos');
  assert.equal(kindOfFile(['100', '1-file'], 'video/mp4'), 'videos');
  assert.equal(kindOfFile(['100', '1-file']), 'files');
  assert.equal(kindOfFile(['stories', '100', '5'], 'video/mp4'), 'videos');
  assert.equal(kindOfFile(['loose']), 'other');
  assert.equal(kindOfMime('audio/ogg; codecs=opus'), 'voice');
  assert.equal(kindOfMime('image/gif'), 'stickers');
  assert.equal(kindOfMime('application/zip'), 'files');
});

// ---- Reactions, reset, preset ----------------------------------------------

const Api = {
  account: {
    GetReactionsNotifySettings: named('GetReactionsNotifySettings'),
    SetReactionsNotifySettings: named('SetReactionsNotifySettings'),
    ResetNotifySettings: named('ResetNotifySettings'),
    GetAutoDownloadSettings: named('GetAutoDownloadSettings'),
  },
  ReactionsNotifySettings: named('ReactionsNotifySettings'),
  ReactionNotificationsFromContacts: named('ReactionNotificationsFromContacts'),
  ReactionNotificationsFromAll: named('ReactionNotificationsFromAll'),
  NotificationSoundDefault: named('NotificationSoundDefault'),
  NotificationSoundNone: named('NotificationSoundNone'),
};

const make = (answer) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: {},
  };
  return {
    actions: createNotifyExtras(env, { userClient: async () => client }),
    log,
  };
};

const current = {
  className: 'ReactionsNotifySettings',
  messagesNotifyFrom: new Api.ReactionNotificationsFromContacts(),
  pollVotesNotifyFrom: new Api.ReactionNotificationsFromAll(),
  sound: new Api.NotificationSoundNone(),
  showPreviews: true,
};

test('reactions are read as nobody, contacts or all, with previews and sound', async () => {
  const { actions } = make(() => current);
  assert.deepEqual(await actions.reactionNotifyGet(), {
    ok: true,
    messages: 'contacts',
    stories: 'nobody',
    previews: true,
    sound: false,
  });
  assert.equal(fromOf(new Api.ReactionNotificationsFromAll()), 'all');
  assert.equal(reactionRowOf({}).sound, true);
});

test('a reactions change keeps the rest as Telegram has it', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetReactionsNotifySettings' ? current : true
  );
  const row = await actions.reactionNotifySet({
    stories: 'all',
    previews: false,
  });
  assert.deepEqual(row, {
    ok: true,
    messages: 'contacts',
    stories: 'all',
    previews: false,
    sound: false,
  });
  const sent = log[1].settings;
  assert.equal(
    sent.messagesNotifyFrom.className,
    'ReactionNotificationsFromContacts'
  );
  assert.equal(
    sent.storiesNotifyFrom.className,
    'ReactionNotificationsFromAll'
  );
  assert.equal(
    sent.pollVotesNotifyFrom.className,
    'ReactionNotificationsFromAll'
  );
  assert.equal(sent.sound.className, 'NotificationSoundNone');
  assert.equal(sent.showPreviews, false);
  await actions.reactionNotifySet({ messages: 'nobody', sound: true });
  const next = log.at(-1).settings;
  assert.equal(next.messagesNotifyFrom, undefined);
  assert.equal(next.sound.className, 'NotificationSoundDefault');
});

test('a bad reactions change never reaches Telegram; errors become codes', async () => {
  const { actions, log } = make(() => telegramError('FLOOD_WAIT_5'));
  for (const body of [
    {},
    { messages: 'x' },
    { previews: 'yes' },
    { sound: 1 },
  ]) {
    assert.equal((await actions.reactionNotifySet(body)).code, 'bad-request');
  }
  assert.equal(log.length, 0);
  assert.equal((await actions.reactionNotifyGet()).ok, false);
});

test('reset sends account.resetNotifySettings; the preset is the medium one', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetAutoDownloadSettings'
      ? {
          medium: {
            disabled: false,
            photoSizeMax: 1048576,
            videoSizeMax: { value: 10485760n },
            fileSizeMax: 3145728n,
          },
        }
      : true
  );
  assert.deepEqual(await actions.notifyResetAll(), { ok: true });
  assert.equal(log[0].className, 'ResetNotifySettings');
  assert.deepEqual((await actions.autoDownloadPreset()).medium, {
    disabled: false,
    photoMax: 1048576,
    videoMax: 10485760,
    fileMax: 3145728,
  });
  assert.equal(presetOf({ disabled: true }).disabled, true);
});

test('the preset maps to the page settings for all three kinds of chat', () => {
  const MB = 1024 * 1024;
  const mapped = settingsFromPreset({
    disabled: false,
    photoMax: MB,
    videoMax: 9 * MB,
    fileMax: 3 * MB,
  });
  for (const scope of ['users', 'chats', 'broadcasts']) {
    assert.deepEqual(mapped[scope], {
      photos: true,
      videoMb: 10,
      fileMb: 3,
      voice: true,
    });
  }
  assert.equal(mapped.autoplayGif, DEFAULTS.autoplayGif);
  const off = settingsFromPreset({
    disabled: true,
    photoMax: MB,
    videoMax: MB,
    fileMax: MB,
  });
  assert.deepEqual(off.users, {
    photos: false,
    videoMb: 0,
    fileMb: 0,
    voice: false,
  });
  assert.deepEqual(settingsFromPreset(null), DEFAULTS);
  assert.equal(
    settingsFromPreset({ photoMax: 0, videoMax: 0, fileMax: 0 }).users.photos,
    false
  );
});

test('the page words a size', () => {
  assert.equal(bytesText(20), '20 B');
  assert.equal(bytesText(2048), '2 KB');
  assert.equal(bytesText(5 * 1024 * 1024), '5.0 MB');
  assert.equal(bytesText(3 * 1024 ** 3), '3.0 GB');
});

// ---- Routes -----------------------------------------------------------------

test('the routes validate strictly before the account is asked', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => (
        calls.push([name, body]),
        { ok: true }
      ),
    }
  );
  const cases = [
    ['storage-usage', {}, 200],
    ['storage-clear', { kind: 'photos' }, 200],
    ['storage-clear', { all: true }, 200],
    ['storage-clear', { kind: '../x' }, 400],
    ['storage-clear', {}, 400],
    ['storage-limits', {}, 200],
    ['storage-limits-set', { maxGb: 5, olderDays: 30 }, 200],
    ['storage-limits-set', { maxGb: 2, olderDays: 30 }, 400],
    ['storage-limits-set', { maxGb: 5 }, 400],
    ['reaction-notify', {}, 200],
    ['reaction-notify-set', { messages: 'contacts' }, 200],
    ['reaction-notify-set', { stories: 'everyone' }, 400],
    ['reaction-notify-set', {}, 400],
    ['notify-reset', {}, 200],
    ['auto-download-preset', {}, 200],
  ];
  for (const [route, body, status] of cases) {
    assert.equal(
      (await post(route, body, account)).status,
      status,
      `${route} ${JSON.stringify(body)}`
    );
  }
  assert.equal(calls.length, cases.filter((c) => c[2] === 200).length);
});
