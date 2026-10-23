// Notification sounds and automatic media download (R-Y181): saved
// ringtones listed, added from an upload and removed; a chat's sound
// written with its notification settings; the routes' validation; the
// page's sound choice and playback; the download rules. Fake clients;
// nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createRingtones,
  mimeOfName,
  ringtoneRow,
} from '../src/sources/telegram-ringtones.js';
import {
  chatFields,
  createNotifySettings,
  soundText,
  validChatChange,
} from '../src/sources/telegram-notify-settings.js';
import {
  named,
  CustomFile,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';
import { withChat, rulesFrom } from '../src/web/notify-rules.js';
import {
  chimeWav,
  forgetRingtones,
  playNotifySound,
  soundOf,
} from '../src/web/notify-sound.js';
import { soundOptions } from '../src/web/chat-notify-sound.js';
import { ringtoneProblem } from '../src/web/settings-sounds.js';
import {
  DEFAULTS,
  allowedFor,
  readAutoDownload,
  scopeOfKind,
  settingsFrom,
  withChoice,
  writeAutoDownload,
} from '../src/web/auto-download.js';
import { photoBytes } from '../src/web/chat-photo.js';
import { videoMode } from '../src/web/chat-media.js';

const Api = {
  InputDocument: named('InputDocument'),
  InputNotifyPeer: named('InputNotifyPeer'),
  InputPeerNotifySettings: named('InputPeerNotifySettings'),
  NotificationSoundNone: named('NotificationSoundNone'),
  NotificationSoundRingtone: named('NotificationSoundRingtone'),
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
  account: {
    GetSavedRingtones: named('GetSavedRingtones'),
    UploadRingtone: named('UploadRingtone'),
    SaveRingtone: named('SaveRingtone'),
    GetNotifySettings: named('GetNotifySettings'),
    UpdateNotifySettings: named('UpdateNotifySettings'),
  },
};

const doc = (id, name, extra = {}) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: 5n,
  fileReference: 'ref',
  size: 4000,
  dcId: 2,
  mimeType: 'audio/mpeg',
  attributes: [
    { className: 'DocumentAttributeFilename', fileName: name },
    { className: 'DocumentAttributeAudio', duration: 3 },
  ],
  ...extra,
});

const makeRingtones = ({ answer, mediaDir = null } = {}) => {
  const log = [];
  const dropped = [];
  const client = fakeClient(
    answer ??
      ((request) =>
        request.className === 'GetSavedRingtones'
          ? { ringtones: [doc(11, 'ding.mp3'), doc(12, 'bell.ogg')] }
          : request.className === 'UploadRingtone'
            ? doc(13, 'new.mp3')
            : true),
    log
  );
  client.downloadFile = async () => Buffer.from('audio-bytes');
  const actions = createRingtones(
    { importer: async () => ({ Api, CustomFile, helpers }) },
    {
      userClient: async () => client,
      mediaDir,
      uploads: {
        uploadOf: (token) =>
          token === 'tok'
            ? { path: '/x/data', name: 'new.mp3', size: 4000 }
            : token === 'big'
              ? { path: '/x/big', name: 'big.mp3', size: 400_000 }
              : token === 'txt'
                ? { path: '/x/t', name: 'notes.txt', size: 10 }
                : null,
        dropUpload: async (token) => dropped.push(token),
      },
    }
  );
  return { actions, log, dropped };
};

test('saved ringtones are listed with their names and lengths', async () => {
  const { actions, log } = makeRingtones();
  const answer = await actions.ringtoneList();
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.ringtones, [
    { id: '11', title: 'ding', duration: 3, size: 4000 },
    { id: '12', title: 'bell', duration: 3, size: 4000 },
  ]);
  assert.equal(answer.limits.seconds, 5);
  assert.equal(log[0].className, 'GetSavedRingtones');
  assert.deepEqual(ringtoneRow(doc(1, 'a.b.mp3')).title, 'a.b');
});

test('an upload is sent as a ringtone, then saved, and dropped', async () => {
  const { actions, log, dropped } = makeRingtones();
  const answer = await actions.ringtoneAdd({ token: 'tok' });
  assert.equal(answer.ok, true);
  assert.equal(answer.ringtone.id, '13');
  const classes = log.map((r) => r.className);
  assert.deepEqual(classes, ['UploadRingtone', 'SaveRingtone']);
  assert.equal(log[0].fileName, 'new.mp3');
  assert.equal(log[0].mimeType, 'audio/mpeg');
  assert.equal(log[1].unsave, false);
  assert.equal(log[1].id.className, 'InputDocument');
  assert.deepEqual(dropped, ['tok']);
});

test('a file that is no audio or too big is refused before Telegram', async () => {
  const { actions, log, dropped } = makeRingtones();
  assert.equal((await actions.ringtoneAdd({ token: 'txt' })).code, 'bad-type');
  assert.equal((await actions.ringtoneAdd({ token: 'big' })).code, 'too-big');
  assert.equal((await actions.ringtoneAdd({ token: 'nope' })).ok, false);
  assert.equal(log.length, 0);
  assert.deepEqual(dropped, ['txt', 'big', 'nope']);
  assert.equal(mimeOfName('a.OGG'), 'audio/ogg');
  assert.equal(mimeOfName('a.txt'), null);
});

test("Telegram's refusals of a ringtone become codes", async () => {
  const { actions } = makeRingtones({
    answer: () => telegramError('RINGTONE_DURATION_TOO_LONG'),
  });
  assert.equal((await actions.ringtoneAdd({ token: 'tok' })).code, 'too-long');
});

test('removing saves it with unsave; an unknown id is refused', async () => {
  const { actions, log } = makeRingtones();
  const answer = await actions.ringtoneRemove({ id: '12' });
  assert.deepEqual(answer, { ok: true });
  const save = log.find((r) => r.className === 'SaveRingtone');
  assert.equal(save.unsave, true);
  assert.equal(save.id.id, 12n);
  assert.equal((await actions.ringtoneRemove({ id: '99' })).code, 'unknown');
  assert.equal((await actions.ringtoneRemove({ id: 'x' })).ok, false);
});

test('a ringtone file is downloaded once and kept', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-ring-'));
  try {
    const { actions, log } = makeRingtones({ mediaDir: dir });
    const first = await actions.ringtoneFile({ id: '11' });
    assert.equal(first.buffer.toString(), 'audio-bytes');
    assert.equal(first.mimeType, 'audio/mpeg');
    const before = log.length;
    const again = await actions.ringtoneFile({ id: '11' });
    assert.equal(again.buffer.toString(), 'audio-bytes');
    assert.equal(log.length, before);
    assert.equal(await actions.ringtoneFile({ id: 'zz' }), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the routes validate their bodies', async () => {
  const calls = [];
  const account = {
    ringtoneList: async () => ({ ok: true, ringtones: [] }),
    ringtoneAdd: async (b) => calls.push(['add', b]) && { ok: true },
    ringtoneRemove: async (b) => calls.push(['remove', b]) && { ok: true },
  };
  assert.equal((await post('ringtones', {}, account)).status, 200);
  assert.equal((await post('ringtone-add', {}, account)).status, 400);
  assert.equal(
    (await post('ringtone-add', { token: '../x' }, account)).status,
    400
  );
  assert.equal(
    (await post('ringtone-add', { token: 'ab12' }, account)).status,
    200
  );
  assert.equal(
    (await post('ringtone-remove', { id: 'x' }, account)).status,
    400
  );
  assert.equal(
    (await post('ringtone-remove', { id: '12' }, account)).status,
    200
  );
  assert.deepEqual(calls, [
    ['add', { token: 'ab12' }],
    ['remove', { id: '12' }],
  ]);
  assert.equal(
    (await post('notify-chat-set', { chat: '5', sound: 'loud' }, account))
      .status,
    400
  );
});

// --- A chat's sound -------------------------------------------------------

const makeNotify = (current = {}) => {
  const log = [];
  const client = fakeClient(
    (request) => (request.className === 'GetNotifySettings' ? current : true),
    log
  );
  const actions = createNotifySettings(
    {
      now: () => 1_700_000_000_000,
      importer: async () => ({ Api, helpers }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client }
  );
  return { actions, log };
};

test('a chat sound is none, a ringtone, or default (no field)', async () => {
  const { actions, log } = makeNotify({ showPreviews: false });
  const none = await actions.notifyChatSet({ chat: '42', sound: 'none' });
  assert.equal(none.sound, 'none');
  const write = log.filter((r) => r.className === 'UpdateNotifySettings');
  assert.equal(write[0].settings.sound.className, 'NotificationSoundNone');
  assert.equal(write[0].settings.showPreviews, false);
  const ring = await actions.notifyChatSet({ chat: '42', sound: '77' });
  assert.equal(ring.sound, '77');
  assert.equal(write.length, 1);
  const writes = log.filter((r) => r.className === 'UpdateNotifySettings');
  assert.equal(writes[1].settings.sound.className, 'NotificationSoundRingtone');
  assert.equal(writes[1].settings.sound.id, 77n);
  const plain = await actions.notifyChatSet({ chat: '42', sound: 'default' });
  assert.equal(plain.sound, 'default');
  const last = log.filter((r) => r.className === 'UpdateNotifySettings').at(-1);
  assert.equal('sound' in last.settings, false);
});

test("a chat's own sound is read, and kept when other things change", async () => {
  const sound = { className: 'NotificationSoundRingtone', id: 77n };
  const { actions, log } = makeNotify({ otherSound: sound, muteUntil: 0 });
  const row = await actions.notifyChat({ chat: '42' });
  assert.equal(row.sound, '77');
  assert.equal(row.exception, true);
  await actions.notifyChatSet({ chat: '42', previews: 'on' });
  const write = log.find((r) => r.className === 'UpdateNotifySettings');
  assert.equal(write.settings.sound, sound);
  assert.equal(soundText({ className: 'NotificationSoundNone' }), 'none');
  assert.equal(soundText(undefined), 'default');
});

test('sound alone is a valid change; a bad one is not', () => {
  assert.equal(validChatChange({ chat: '5', sound: 'none' }), true);
  assert.equal(validChatChange({ chat: '5', sound: '123' }), true);
  assert.equal(validChatChange({ chat: '5', sound: 'loud' }), false);
  assert.deepEqual(chatFields({ muteUntil: 5 }, { sound: 'default' }, 0), {
    muteUntil: 5,
  });
});

// --- The page ------------------------------------------------------------

test('a chat plays its own sound; default when it has none', () => {
  const rules = rulesFrom({
    ok: true,
    scopes: {},
    exceptions: [
      { chat: '5', name: 'A', scope: 'users', state: 'custom', sound: 'none' },
      { chat: '6', name: 'B', scope: 'users', state: 'custom', sound: '77' },
    ],
  });
  assert.equal(soundOf({ source: 'telegram', chat: '5' }, rules), 'none');
  assert.equal(soundOf({ source: 'telegram', chat: '6' }, rules), '77');
  assert.equal(soundOf({ source: 'telegram', chat: '7' }, rules), 'default');
  assert.equal(soundOf({ source: 'matrix', chat: '5' }, rules), 'default');
  const next = withChat(
    rules,
    { chat: '8', exception: true, muteUntil: 0, sound: '9' },
    { name: 'C', scope: 'users' }
  );
  assert.equal(next.exceptions.get('8').sound, '9');
});

test('none plays nothing; a ringtone is fetched once; the default chimes', async () => {
  forgetRingtones();
  const played = [];
  const player = async (src) => played.push(src) && true;
  let asked = 0;
  const api = {
    telegramRingtoneUrl: async ({ id }) => {
      asked += 1;
      return `/api/telegram/ringtone?id=${id}`;
    },
  };
  assert.equal(await playNotifySound(api, 'none', player), 'none');
  assert.equal(played.length, 0);
  assert.equal(await playNotifySound(api, '77', player), '77');
  assert.equal(await playNotifySound(api, '77', player), '77');
  assert.equal(asked, 1);
  assert.deepEqual(played, [
    '/api/telegram/ringtone?id=77',
    '/api/telegram/ringtone?id=77',
  ]);
  globalThis.URL.createObjectURL = () => 'blob:chime';
  assert.equal(await playNotifySound(api, 'default', player), 'default');
  assert.equal(played.at(-1), 'blob:chime');
  assert.equal(String.fromCharCode(...chimeWav().slice(0, 4)), 'RIFF');
});

test('the sound list is default, none and the ringtones', () => {
  const t = (key) => key;
  assert.deepEqual(
    soundOptions(t, [{ id: '1', title: 'ding' }]).map((o) => o.value),
    ['default', 'none', '1']
  );
});

test('a file is checked against the ringtone limits in words', () => {
  const limits = { sizeBytes: 1000, seconds: 5 };
  assert.equal(
    ringtoneProblem({ type: 'audio/mpeg', size: 10 }, limits, 2),
    null
  );
  assert.equal(
    ringtoneProblem({ type: 'text/plain', size: 10 }, limits, 0),
    'bad-type'
  );
  assert.equal(
    ringtoneProblem({ type: 'audio/mpeg', size: 2000 }, limits, 1),
    'too-big'
  );
  assert.equal(
    ringtoneProblem({ type: 'audio/mpeg', size: 10 }, limits, 9),
    'too-long'
  );
});

// --- Automatic download --------------------------------------------------

test('the defaults and what a bad keep falls back to', () => {
  assert.deepEqual(settingsFrom(null), settingsFrom(undefined));
  assert.equal(settingsFrom({ users: { videoMb: -3 } }).users.videoMb, 10);
  assert.equal(settingsFrom({ autoplayGif: 'x' }).autoplayGif, true);
  assert.equal(DEFAULTS.autoplayVideo, false);
});

test('photos, videos, files and voice follow each scope separately', () => {
  let s = settingsFrom(null);
  s = withChoice(s, 'chats', { photos: false, videoMb: 1, fileMb: 0 });
  s = withChoice(s, 'broadcasts', { voice: false });
  const MB = 1024 * 1024;
  assert.equal(allowedFor(s, 'users', 'photo'), true);
  assert.equal(allowedFor(s, 'chats', 'photo'), false);
  assert.equal(allowedFor(s, 'chats', 'video', 2 * MB), false);
  assert.equal(allowedFor(s, 'chats', 'video', MB / 2), true);
  assert.equal(allowedFor(s, 'users', 'video', 11 * MB), false);
  assert.equal(allowedFor(s, 'chats', 'file', 10), false);
  assert.equal(allowedFor(s, 'users', 'file', 4 * MB), false);
  assert.equal(allowedFor(s, 'users', 'file', MB), true);
  assert.equal(allowedFor(s, 'broadcasts', 'voice'), false);
  assert.equal(allowedFor(s, 'users', 'voice'), true);
  assert.equal(scopeOfKind('channel'), 'broadcasts');
  assert.equal(scopeOfKind('group'), 'chats');
  assert.equal(scopeOfKind('private'), 'users');
});

test('the choices are kept in storage and read back', () => {
  const kept = new Map();
  const storage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, v),
  };
  assert.deepEqual(readAutoDownload(storage), settingsFrom(null));
  const next = withChoice(settingsFrom(null), null, { autoplayVideo: true });
  writeAutoDownload(next, storage);
  assert.equal(readAutoDownload(storage).autoplayVideo, true);
  storage.setItem('metaSovereignAutoDownload', '{broken');
  assert.deepEqual(readAutoDownload(storage), settingsFrom(null));
});

test('autoplay settings decide what plays by itself', () => {
  const on = { autoplayGif: true, autoplayVideo: true, allowed: true };
  assert.deepEqual(videoMode(true, false, on), {
    gifAuto: true,
    quiet: true,
    fetchNear: true,
  });
  assert.equal(videoMode(false, false, on).quiet, true);
  assert.equal(videoMode(false, true, on).quiet, false);
  const off = { autoplayGif: false, autoplayVideo: false, allowed: false };
  assert.deepEqual(videoMode(true, false, off), {
    gifAuto: false,
    quiet: false,
    fetchNear: false,
  });
  assert.equal(
    videoMode(false, false, { ...off, allowed: true }).fetchNear,
    true
  );
});

test('a photo reports its biggest size', () => {
  assert.equal(photoBytes({ sizes: [{ size: 10 }, { size: 900 }, {}] }), 900);
  assert.equal(photoBytes(null), 0);
});
