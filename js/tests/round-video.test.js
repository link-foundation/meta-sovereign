// Round video messages (R-Y150): the page's pure helpers (ring and
// progress, durations, the square crop, the recorder's type and file
// name); a recorded clip sent as a video note — a document with
// DocumentAttributeVideo { roundMessage, duration, w, h } and no caption,
// stored, its upload removed; the route refuses what is not a clip. Fake
// client; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  RING_LENGTH,
  nextMode,
  ringDash,
  roundProgress,
} from '../src/web/chat-round.js';
import {
  roundFileName,
  roundSeconds,
  roundTimer,
  roundTypeOf,
  squareCrop,
} from '../src/web/chat-round-record.js';
import { clockOf } from '../src/web/chat-media.js';
import {
  roundAttribute,
  roundMime,
  roundOptions,
} from '../src/sources/telegram-round.js';
import { createActions } from '../src/sources/telegram-actions.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

test('the length shown on a circle, as m:ss', () => {
  assert.equal(clockOf(2.5), '0:03');
  assert.equal(clockOf(59), '0:59');
  assert.equal(clockOf(60), '1:00');
  assert.equal(clockOf(undefined), '0:00');
});

test('progress: 0..1, never out of range, 0 when the length is unknown', () => {
  assert.equal(roundProgress(1, 4), 0.25);
  assert.equal(roundProgress(9, 4), 1);
  assert.equal(roundProgress(-1, 4), 0);
  assert.equal(roundProgress(1, Infinity), 0);
  assert.equal(roundProgress(1, 0), 0);
  assert.equal(roundProgress(NaN, 4), 0);
});

test('the ring: its dash is the part done of the circumference', () => {
  assert.equal(ringDash(0), `0.00 ${RING_LENGTH.toFixed(2)}`);
  assert.equal(
    ringDash(0.5),
    `${(RING_LENGTH / 2).toFixed(2)} ${RING_LENGTH.toFixed(2)}`
  );
  assert.equal(ringDash(7), ringDash(1));
  assert.equal(ringDash('x'), ringDash(0));
});

test('a click plays, the next pauses, the next goes on', () => {
  assert.equal(nextMode('idle'), 'playing');
  assert.equal(nextMode('playing'), 'paused');
  assert.equal(nextMode('paused'), 'playing');
});

test('recording: whole seconds 1..60, the timer, the square crop', () => {
  assert.equal(roundSeconds(0), 1);
  assert.equal(roundSeconds(2400), 2);
  assert.equal(roundSeconds(75_000), 60);
  assert.equal(roundTimer(0), '0:00');
  assert.equal(roundTimer(7999), '0:07');
  assert.equal(roundTimer(60_000), '1:00');
  assert.deepEqual(squareCrop(640, 480), { sx: 80, sy: 0, side: 480 });
  assert.deepEqual(squareCrop(480, 640), { sx: 0, sy: 80, side: 480 });
  assert.deepEqual(squareCrop(0, 0), { sx: 0, sy: 0, side: 0 });
});

test('the recorder type: MP4 first where it is, else WebM; and the name', () => {
  assert.equal(
    roundTypeOf(() => true),
    'video/mp4;codecs=avc1,mp4a.40.2'
  );
  assert.equal(
    roundTypeOf((type) => type.startsWith('video/webm;codecs=vp8')),
    'video/webm;codecs=vp8,opus'
  );
  assert.equal(
    roundTypeOf(() => false),
    null
  );
  assert.equal(roundFileName('video/mp4;codecs=avc1'), 'round.mp4');
  assert.equal(roundFileName('video/webm;codecs=vp9,opus'), 'round.webm');
  assert.equal(roundMime('round.mp4'), 'video/mp4');
  assert.equal(roundMime('round.webm'), 'video/webm');
});

test('the options: seconds 1..60, a side, reply and timing', () => {
  assert.deepEqual(roundOptions({ duration: 3.4, size: 384, replyTo: 9 }), {
    seconds: 3,
    side: 384,
    extra: { replyTo: 9 },
  });
  assert.equal(roundOptions({ duration: 0 }).seconds, 1);
  assert.equal(roundOptions({ duration: 500 }).seconds, 60);
  assert.equal(roundOptions({ size: 99_999 }).side, 1280);
  assert.equal(roundOptions({}).side, 240);
  assert.deepEqual(roundOptions({ silent: true, scheduleDate: 5 }).extra, {
    silent: true,
    scheduleDate: 5,
  });
});

class Attr {
  constructor(args) {
    Object.assign(this, args);
  }
}
class CustomFile {
  constructor(name, size, path) {
    Object.assign(this, { name, size, path });
  }
}

test('the attribute is a round DocumentAttributeVideo', () => {
  const attr = roundAttribute(
    { DocumentAttributeVideo: Attr },
    roundOptions({ duration: 4, size: 384 })
  );
  assert.equal(attr.roundMessage, true);
  assert.equal(attr.duration, 4);
  assert.equal(attr.w, 384);
  assert.equal(attr.h, 384);
});

const setup = () => {
  const store = createMemoryStore();
  const sent = [];
  const client = {
    sendFile: async (peer, options) => {
      sent.push({ peer, ...options });
      return {
        id: 601,
        out: true,
        // A body stands for the clip; how it is shown is tested elsewhere.
        message: 'round',
        date: 1_760_000_000,
        peerId: { userId: 42 },
      };
    },
  };
  const env = {
    store,
    live: createTelegramLive({ store, toLinks: telegramDialogLinks }),
    importer: async () => ({
      Api: { DocumentAttributeVideo: Attr },
      client: { uploads: { CustomFile } },
    }),
    log: () => {},
    queue: { run: (_key, _priority, task) => task() },
    connection: {
      open: async () => ({ client }),
      withPeer: (_client, chat, use) => use(`peer:${chat}`),
    },
    peers: {
      input: async (chat) => `peer:${chat}`,
      dialog: async (chat) => ({ id: chat, isUser: true }),
    },
    catchUp: { observeResult: () => {} },
    channels: { observe: async () => {} },
  };
  const actions = createActions(env, {
    credentials: async () => ({ kind: 'user' }),
    toLinks: telegramDialogLinks,
    writeChanged: async (s, links) => {
      for (const link of links) {
        await s.put(link);
      }
      return links.length;
    },
  });
  return { store, sent, actions };
};

test('a clip goes as a video note: round, its length and side, no caption', async () => {
  const { store, sent, actions } = setup();
  const { token } = await actions.receiveUpload(
    Readable.from([Buffer.from('webm-bytes')]),
    { name: 'round.webm' }
  );
  const answer = await actions.sendRound({
    chat: '42',
    token,
    duration: 7.6,
    size: 384,
    replyTo: 9,
  });
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.ids, [601]);
  const [call] = sent;
  assert.equal(call.peer, 'peer:42');
  assert.equal(call.file.name, 'round.webm');
  assert.equal(call.mimeType, 'video/webm');
  assert.equal(call.replyTo, 9);
  assert.equal(call.caption, undefined);
  assert.equal(call.voiceNote, undefined);
  assert.equal(call.attributes.length, 1);
  const [video] = call.attributes;
  assert.equal(video.roundMessage, true);
  assert.equal(video.duration, 8);
  assert.equal(video.w, 384);
  assert.equal(video.h, 384);
  assert.ok(await store.get('msg:telegram:42:601'), 'stored');
  // The upload is gone: not sent twice.
  const again = await actions.sendRound({ chat: '42', token, duration: 3 });
  assert.equal(again.ok, false);
  assert.equal(sent.length, 1);
});

test('an MP4 clip keeps its type', async () => {
  const { sent, actions } = setup();
  const { token } = await actions.receiveUpload(
    Readable.from([Buffer.from('mp4-bytes')]),
    { name: 'round.mp4' }
  );
  await actions.sendRound({ chat: '42', token, duration: 2 });
  assert.equal(sent[0].mimeType, 'video/mp4');
  assert.equal(sent[0].file.name, 'round.mp4');
});

const post = async (account, route, body) => {
  const path = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = text;
    },
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status, payload: JSON.parse(res.body) };
};

test('the route takes a clip, refuses what is not one', async () => {
  const calls = [];
  const account = {
    sendRound: async (body) => {
      calls.push(body);
      return { ok: true, ids: [1] };
    },
  };
  const token = 'b'.repeat(32);
  const good = await post(account, 'send-round', {
    chat: '42',
    token,
    duration: 4,
    size: 384,
    replyTo: 5,
  });
  assert.equal(good.status, 200);
  assert.deepEqual(calls[0], {
    chat: '42',
    token,
    duration: 4,
    size: 384,
    replyTo: 5,
  });
  for (const bad of [
    { chat: '42', token: 'x', duration: 4 },
    { chat: '42', token, duration: -1 },
    { chat: '42', token, duration: 90 },
    { chat: '42', token, duration: 4, size: 5000 },
    { chat: '42', token, duration: 4, size: 1.5 },
    { chat: 'abc', token, duration: 4 },
    { token, duration: 4 },
  ]) {
    assert.equal((await post(account, 'send-round', bad)).status, 400);
  }
  assert.equal(calls.length, 1);
});
