// A message is drawn the way Telegram's own apps draw it: each person in
// their colour, formatted text with safe links, every kind of media, the
// header's members and who is online, runs of one sender's messages,
// avatars and files read once from Telegram, and the page's own errors
// in the server's log (R-Y42 … R-Y48).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { peerColorIndex, peerColorClass } from '../src/web/peer-color.js';
import { textTree, hrefOf } from '../src/web/message-text.js';
import { decodeWaveform, parseMedia } from '../src/web/message-parts.js';
import { infoLine } from '../src/web/chat-info.js';
import { mediaLabel } from '../src/web/chat-message.js';
import { messageRuns } from '../src/web/chat-view.js';
import { translate } from '../src/web/i18n.js';
import { errorEntry, installClientLog } from '../src/web/client-log.js';
import { byteRange } from '../src/server/routes-telegram.js';
import { clientEntry } from '../src/server/routes-client-log.js';
import { createAvatarReader } from '../src/sources/telegram-avatars.js';
import { createChatInfoReader } from '../src/sources/telegram-chat-info.js';

const t = (key, vars) => translate('en', key, vars);

// A queue that runs at once, as the account's would when idle.
const queue = { run: (_key, _priority, job) => job() };

test('peer colours follow Telegram: chosen colour, else raw id mod 7', () => {
  assert.equal(peerColorIndex('364876854'), 364876854 % 7);
  // A channel's -100N and a basic group's -N use N.
  assert.equal(peerColorIndex('-1001234567'), 1234567 % 7);
  assert.equal(peerColorIndex('-4321'), 4321 % 7);
  assert.equal(peerColorIndex('364876854', { color: 5 }), 5);
  // Not a number: a stable hash, the same each time.
  const a = peerColorIndex('alice@example');
  assert.equal(peerColorIndex('alice@example'), a);
  assert.ok(a >= 0 && a < 7);
  assert.equal(
    peerColorClass(null, { name: 'Bob' }).slice(0, 11),
    'peer-color-'
  );
});

test('text keeps its entities, nested, and links only to the web, mail, phone', () => {
  const text = 'Hello bold world https://x.org';
  const tree = textTree(text, [
    { className: 'MessageEntityBold', offset: 6, length: 10 },
    { className: 'MessageEntityItalic', offset: 11, length: 5 },
    { className: 'MessageEntityUrl', offset: 17, length: 13 },
  ]);
  assert.equal(tree[0], 'Hello ');
  assert.equal(tree[1].kind, 'bold');
  assert.deepEqual(tree[1].children[0], 'bold ');
  assert.equal(tree[1].children[1].kind, 'italic');
  assert.equal(tree[3].kind, 'url');
  assert.equal(hrefOf(tree[3]), 'https://x.org');
  assert.equal(
    hrefOf({ kind: 'link', text: 'x', url: 'javascript:alert(1)' }),
    null
  );
  assert.equal(
    hrefOf({ kind: 'mention', text: '@durov' }),
    'https://t.me/durov'
  );
  // Another network's text: its links are found.
  const found = textTree('see https://a.b/c. ok');
  assert.equal(found[1].kind, 'url');
  assert.equal(found[1].text, 'https://a.b/c');
});

test('a voice note waveform is 5-bit samples, as tdesktop decodes it', () => {
  assert.deepEqual(decodeWaveform('H3wA'), [31, 0, 31, 0]);
  assert.deepEqual(decodeWaveform(null), []);
});

const doc = (attributes, mimeType = 'application/octet-stream') => ({
  media: {
    className: 'MessageMediaDocument',
    document: { attributes, mimeType, size: 10, thumbs: [] },
  },
});

test('every kind of document and card is told apart', () => {
  const kinds = [
    [
      doc([{ className: 'DocumentAttributeSticker', alt: '🙂' }], 'image/webp'),
      'sticker',
    ],
    [
      doc(
        [
          { className: 'DocumentAttributeAnimated' },
          { className: 'DocumentAttributeVideo', w: 2, h: 1 },
        ],
        'video/mp4'
      ),
      'gif',
    ],
    [
      doc(
        [
          {
            className: 'DocumentAttributeVideo',
            roundMessage: true,
            w: 1,
            h: 1,
          },
        ],
        'video/mp4'
      ),
      'round',
    ],
    [
      doc(
        [{ className: 'DocumentAttributeVideo', w: 16, h: 9, duration: 5 }],
        'video/mp4'
      ),
      'video',
    ],
    [
      doc(
        [{ className: 'DocumentAttributeAudio', voice: true, duration: 3 }],
        'audio/ogg'
      ),
      'voice',
    ],
    [
      doc(
        [{ className: 'DocumentAttributeAudio', title: 'Song' }],
        'audio/mpeg'
      ),
      'audio',
    ],
    [
      doc(
        [{ className: 'DocumentAttributeFilename', fileName: 'a.pdf' }],
        'application/pdf'
      ),
      'file',
    ],
  ];
  for (const [raw, type] of kinds) {
    assert.equal(parseMedia(raw).type, type, type);
  }
  const sticker = parseMedia(kinds[0][0]);
  assert.equal(sticker.stickerFormat, 'webp');
  assert.equal(sticker.emoji, '🙂');
  assert.equal(parseMedia(kinds[3][0]).aspectRatio, 16 / 9);
  assert.equal(parseMedia(kinds[6][0]).filename, 'a.pdf');

  const poll = parseMedia({
    media: {
      className: 'MessageMediaPoll',
      poll: {
        question: { text: 'Q?' },
        answers: [
          { text: { text: 'A' }, option: { bytes: 'AA==' } },
          { text: { text: 'B' }, option: { bytes: 'AQ==' } },
        ],
      },
      results: {
        totalVoters: 3,
        results: [{ option: { bytes: 'AQ==' }, voters: 3 }],
      },
    },
  });
  assert.equal(poll.question, 'Q?');
  assert.deepEqual(
    poll.answers.map((a) => a.voters),
    [null, 3]
  );
  assert.equal(
    parseMedia({
      media: { className: 'MessageMediaGeo', geo: { lat: 1, long: 2 } },
    }).kind,
    'place'
  );
  assert.equal(
    parseMedia({
      media: {
        className: 'MessageMediaContact',
        firstName: 'A',
        lastName: 'B',
      },
    }).name,
    'A B'
  );
  assert.equal(
    parseMedia({ media: { className: 'MessageMediaDice', value: 4 } }).value,
    4
  );
});

test('a reply to media names the media, as Telegram does', () => {
  assert.equal(
    mediaLabel(t, { kind: 'document', type: 'voice' }),
    'Voice message'
  );
  assert.equal(mediaLabel(t, { kind: 'photo' }), 'Photo');
  assert.equal(mediaLabel(t, { kind: 'poll', question: 'Q?' }), '📊 Q?');
  assert.equal(mediaLabel(t, { kind: 'dice', emoticon: '🎯' }), '🎯');
  assert.equal(mediaLabel(t, null), '');
});

test('the header says members and who is online, or when someone was seen', () => {
  const chatTime = () => '12:00';
  assert.equal(
    infoLine(
      t,
      { kind: 'group', members: 1364, online: 23 },
      { kind: 'group', chatTime }
    ),
    '1,364 members, 23 online'
  );
  assert.equal(
    infoLine(
      t,
      { kind: 'group', members: 5, online: 1 },
      { kind: 'group', chatTime }
    ),
    '5 members'
  );
  assert.equal(
    infoLine(t, { kind: 'channel', members: 1 }, { kind: 'channel', chatTime }),
    '1 subscriber'
  );
  assert.equal(
    infoLine(t, { kind: 'user', online: true }, { kind: 'user', chatTime }),
    'online'
  );
  assert.equal(
    infoLine(
      t,
      { kind: 'user', lastSeen: 'recently' },
      { kind: 'user', chatTime }
    ),
    'last seen recently'
  );
  assert.equal(
    infoLine(
      t,
      { kind: 'user', lastSeen: '2026-10-20T12:00:00Z' },
      { kind: 'user', chatTime }
    ),
    'last seen 12:00'
  );
  assert.equal(infoLine(t, null, { kind: 'group', chatTime }), null);
});

test('one sender’s messages within ten minutes on one day form a run', () => {
  const m = (id, sender, time) => ({
    id,
    sender,
    timestamp: `2026-10-20T${time}:00.000Z`,
  });
  const runs = messageRuns([
    m('a', '1', '10:00'),
    m('b', '1', '10:05'),
    m('c', '1', '10:20'),
    m('d', '2', '10:21'),
  ]);
  assert.deepEqual(runs.get('a'), { first: true, last: false });
  assert.deepEqual(runs.get('b'), { first: false, last: true });
  assert.deepEqual(runs.get('c'), { first: true, last: true });
  assert.deepEqual(runs.get('d'), { first: true, last: true });
});

test('a player’s byte range is read as HTTP says', () => {
  assert.deepEqual(byteRange('bytes=0-', 100), [0, 99]);
  assert.deepEqual(byteRange('bytes=10-19', 100), [10, 19]);
  assert.deepEqual(byteRange('bytes=-10', 100), [90, 99]);
  assert.deepEqual(byteRange('bytes=90-500', 100), [90, 99]);
  assert.equal(byteRange('bytes=100-', 100), null);
  assert.equal(byteRange('bytes=-', 100), null);
  assert.equal(byteRange('items=0-1', 100), null);
});

test('the page’s errors reach the log as their shape only', () => {
  const entry = clientEntry({
    level: 'error',
    event: 'unhandled_rejection',
    error: 'x'.repeat(1000),
    stack: 'Error\n    at f (http://127.0.0.1:8787/app.min.js:1:2)',
    view: 'chat',
    text: 'what the user read',
    count: 3,
    nested: { a: 1 },
  });
  assert.equal(entry.event, 'client_unhandled_rejection');
  assert.equal(entry.error.length, 300);
  assert.equal(entry.stack, 'Error\n    at f (/app.min.js:1:2)');
  assert.equal(entry.count, 3);
  assert.equal('text' in entry, false);
  assert.equal('nested' in entry, false);
  assert.equal(clientEntry({ event: 'Bad Name' }), null);
  assert.equal(clientEntry({ level: 'loud', event: 'ok' }).level, 'info');

  const listeners = {};
  const sent = [];
  const target = {
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    },
    removeEventListener: (name) => delete listeners[name],
  };
  const stop = installClientLog({
    target,
    send: (e) => sent.push(e),
    view: () => 'chat',
  });
  const boom = new Error('boom');
  listeners.error({ error: boom });
  listeners.error({ error: boom });
  listeners.unhandledrejection({ reason: 'nope' });
  stop();
  assert.deepEqual(listeners, {});
  return Promise.resolve().then(() => {
    assert.equal(sent.length, 2);
    assert.deepEqual(
      { ...sent[1], stack: null },
      { ...errorEntry('unhandled_rejection', 'nope', 'chat'), stack: null }
    );
  });
});

test('an avatar is read once, kept on disk, and "no photo" is remembered', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-avatar-'));
  let downloads = 0;
  const client = {
    downloadProfilePhoto: async (peer) => {
      downloads += 1;
      return String(peer?.peer ?? peer) === '7' ? Buffer.from('jpeg') : null;
    },
  };
  const events = [];
  const reader = createAvatarReader({
    dir,
    queue,
    client: async () => client,
    peers: { input: async () => null },
    log: (e) => events.push(e.event),
  });
  const [one, two] = await Promise.all([
    reader.read({ peer: '7' }),
    reader.read({ peer: '7' }),
  ]);
  assert.equal(one.buffer.toString(), 'jpeg');
  assert.equal(two.buffer.toString(), 'jpeg');
  assert.equal(downloads, 1, 'one download for two rows asking at once');
  assert.equal((await reader.read({ peer: '7' })).mimeType, 'image/jpeg');
  assert.equal(downloads, 1, 'then read from disk');

  assert.equal(await reader.read({ peer: '8' }), null);
  assert.equal(await reader.read({ peer: '8' }), null);
  assert.equal(downloads, 2, '"no photo" is not asked again');
  assert.equal(await reader.read({ peer: '../etc' }), null);
  assert.ok(events.includes('telegram_avatar'));
});

test('an avatar Telegram asks to wait for is not remembered as missing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-avatar-'));
  let calls = 0;
  const reader = createAvatarReader({
    dir,
    queue,
    client: async () => ({
      downloadProfilePhoto: async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error('FLOOD_WAIT_5'), {
            errorMessage: 'FLOOD_WAIT_5',
          });
        }
        return Buffer.from('jpeg');
      },
    }),
    peers: { input: async () => null },
  });
  assert.equal(await reader.read({ peer: '9' }), null);
  assert.equal((await reader.read({ peer: '9' })).buffer.toString(), 'jpeg');
});

const fakeApi = () => {
  const Api = {};
  for (const name of ['InputUser', 'InputChannel', 'InputPeerChannel']) {
    Api[name] = class {
      constructor(args) {
        Object.assign(this, args);
      }
    };
  }
  const request = (kind) =>
    class {
      constructor(args) {
        Object.assign(this, args, { kind });
      }
    };
  Api.channels = { GetFullChannel: request('full-channel') };
  Api.messages = {
    GetOnlines: request('onlines'),
    GetFullChat: request('full-chat'),
  };
  Api.users = { GetFullUser: request('full-user') };
  return Api;
};

test('a group’s members and online count, kept a minute', async () => {
  const Api = fakeApi();
  let asked = 0;
  const client = {
    invoke: async (request) => {
      asked += 1;
      if (request.kind === 'full-channel') {
        return {
          fullChat: { participantsCount: 1364, pinnedMsgId: 77, about: '' },
          chats: [{ title: 'Group', megagroup: true }],
        };
      }
      if (request.kind === 'onlines') {
        return { onlines: 23 };
      }
      throw new Error(`unexpected ${request.kind}`);
    },
  };
  const reader = createChatInfoReader({
    queue,
    client: async () => client,
    peers: {
      input: async () =>
        new Api.InputPeerChannel({ channelId: 1n, accessHash: 2n }),
    },
    importer: async () => ({
      Api,
      helpers: { returnBigInt: (v) => BigInt(v) },
    }),
  });
  const info = await reader.read({ chat: '-1001' });
  // A supergroup is a channel to Telegram, one that is not a broadcast.
  assert.equal(info.kind, 'channel');
  assert.equal(info.broadcast, false);
  assert.equal(info.members, 1364);
  assert.equal(info.online, 23);
  assert.equal(info.pinned, 77);
  const before = asked;
  await reader.read({ chat: '-1001' });
  assert.equal(asked, before, 'kept a minute');
  assert.equal(await reader.read({ chat: 'nope' }), null);
});
