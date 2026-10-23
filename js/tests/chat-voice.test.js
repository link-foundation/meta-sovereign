// Voice messages (R-Y108): the loudness heard becomes the waveform
// Telegram shows (100 values 0..31, the loudest 31), packed five bits
// each as Telegram keeps it — and read back the same way the chat reads
// a voice it shows; the time as Desktop shows it while recording; the
// recording sent as a voice note (Ogg, its length, its waveform, the
// reply), stored, its upload removed; the route refuses what is not a
// voice. Fake client; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { levelOf, recordedText, waveformOf } from '../src/web/chat-voice.js';
import { decodeWaveform } from '../src/web/message-parts.js';
import { packWaveform } from '../src/sources/telegram-upload.js';
import { createActions } from '../src/sources/telegram-actions.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

test('loudness: the peak away from silence, 0..1', () => {
  assert.equal(levelOf(new Uint8Array([128, 128, 128])), 0);
  assert.equal(levelOf(new Uint8Array([128, 192, 100])), 0.5);
  assert.equal(levelOf(new Uint8Array([0, 255])), 1);
  assert.equal(levelOf(null), 0);
});

test('the waveform: 100 stretches, each its loudest, the loudest 31', () => {
  const levels = Array.from({ length: 400 }, (_, i) => (i === 7 ? 1 : 0.5));
  const wave = waveformOf(levels);
  assert.equal(wave.length, 100);
  assert.equal(wave[1], 31, 'the stretch with the loudest');
  assert.equal(wave[0], 16);
  assert.ok(wave.every((v) => Number.isInteger(v) && v >= 0 && v <= 31));
  // Fewer samples than stretches: each sample spread.
  assert.equal(waveformOf([0.2, 0.4]).length, 100);
  assert.deepEqual(waveformOf([]), []);
  assert.ok(waveformOf([0, 0, 0]).every((v) => v === 0));
});

test('packed five bits each, read back as the chat reads it', () => {
  const values = Array.from({ length: 100 }, (_, i) => (i * 7) % 32);
  const packed = packWaveform(values);
  assert.equal(packed.length, 63);
  assert.deepEqual(
    decodeWaveform(packed.toString('base64')).slice(0, 100),
    values
  );
  // Out of range: kept within 0..31.
  assert.deepEqual(
    decodeWaveform(packWaveform([40, -3, 31]).toString('base64')).slice(0, 3),
    [31, 0, 31]
  );
});

test('the time while recording, as Desktop shows it', () => {
  assert.equal(recordedText(0), '0:00,00');
  assert.equal(recordedText(3450), '0:03,45');
  assert.equal(recordedText(65_010), '1:05,01');
});

class CustomFile {
  constructor(name, size, path) {
    Object.assign(this, { name, size, path });
  }
}
class DocumentAttributeAudio {
  constructor(args) {
    Object.assign(this, args);
  }
}

const setup = () => {
  const store = createMemoryStore();
  const sent = [];
  const client = {
    sendFile: async (peer, options) => {
      sent.push({ peer, ...options });
      return {
        id: 501,
        out: true,
        // A body stands for the voice: how a voice is shown is tested
        // with the chat's media.
        message: 'voice',
        date: 1_760_000_000,
        peerId: { userId: 42 },
      };
    },
  };
  const env = {
    store,
    live: createTelegramLive({ store, toLinks: telegramDialogLinks }),
    importer: async () => ({
      Api: { DocumentAttributeAudio },
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

test('a recording goes as a voice note: its length, waveform, reply; stored', async () => {
  const { store, sent, actions } = setup();
  const { token } = await actions.receiveUpload(
    Readable.from([Buffer.from('OggS-fake')]),
    { name: 'voice.ogg' }
  );
  const answer = await actions.sendVoice({
    chat: '42',
    token,
    duration: 3.4,
    waveform: [0, 31, 15],
    replyTo: 9,
  });
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.ids, [501]);
  const [call] = sent;
  assert.equal(call.peer, 'peer:42');
  assert.equal(call.voiceNote, true);
  assert.equal(call.mimeType, 'audio/ogg');
  assert.equal(call.replyTo, 9);
  assert.equal(call.file.name, 'voice.ogg');
  const [audio] = call.attributes;
  assert.equal(audio.voice, true);
  assert.equal(audio.duration, 3);
  assert.deepEqual(
    decodeWaveform(audio.waveform.toString('base64')).slice(0, 3),
    [0, 31, 15]
  );
  assert.ok(await store.get('msg:telegram:42:501'), 'stored');
  // The upload is gone: not sent twice.
  const again = await actions.sendVoice({ chat: '42', token, duration: 3 });
  assert.equal(again.ok, false);
  assert.equal(sent.length, 1);
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

test('the route takes a voice, refuses what is not one', async () => {
  const calls = [];
  const account = {
    sendVoice: async (body) => {
      calls.push(body);
      return { ok: true, ids: [1] };
    },
  };
  const token = 'a'.repeat(32);
  const good = await post(account, 'send-voice', {
    chat: '42',
    token,
    duration: 4,
    waveform: [1, 2, 3],
    replyTo: 5,
  });
  assert.equal(good.status, 200);
  assert.deepEqual(calls[0], {
    chat: '42',
    token,
    duration: 4,
    waveform: [1, 2, 3],
    replyTo: 5,
  });
  for (const bad of [
    { chat: '42', token: 'x', duration: 4 },
    { chat: '42', token, duration: -1 },
    { chat: '42', token, duration: 4, waveform: [32] },
    { chat: '42', token, duration: 4, waveform: new Array(101).fill(0) },
    { token, duration: 4 },
  ]) {
    assert.equal((await post(account, 'send-voice', bad)).status, 400);
  }
  assert.equal(calls.length, 1);
});
