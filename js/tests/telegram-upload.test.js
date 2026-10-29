// Files and photos (R-Y99): the page uploads each file, kept in a
// temporary folder; then they go to Telegram — photos as photos (albums
// of up to ten), other files as files, the caption with the first, a
// picture Telegram will not take as a photo as a file — what Telegram
// answers is stored and the files are removed. Fake client; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';

import { createActions } from '../src/sources/telegram-actions.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import {
  ALBUM_SIZE,
  batchesOf,
  safeName,
} from '../src/sources/telegram-upload.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { isPicture, sizeText } from '../src/web/chat-attach.js';
import { failureText } from '../src/web/chat-failure.js';

class CustomFile {
  constructor(name, size, path) {
    Object.assign(this, { name, size, path });
  }
}

const setup = ({ fail = null, onTransfer = () => {} } = {}) => {
  const store = createMemoryStore();
  const sent = [];
  let next = 100;
  const message = (file, caption) => ({
    id: (next += 1),
    out: true,
    message: caption,
    date: 1_760_000_000,
    peerId: { userId: 42 },
    _file: file.name,
  });
  const client = {
    sendFile: async (peer, options) => {
      const files = [options.file].flat();
      for (const _file of files) {
        for (const part of [0, 0.5, 1]) {
          options.progressCallback?.(part);
          onTransfer();
        }
      }
      sent.push({
        peer,
        ...options,
        files: files.map((f) => ({
          name: f.name,
          size: f.size,
          there: existsSync(f.path),
          isCustom: f instanceof CustomFile,
        })),
      });
      const error = fail?.(options, sent.length);
      if (error) {
        throw Object.assign(new Error(error), { errorMessage: error });
      }
      return Array.isArray(options.file)
        ? files.map((f, i) => message(f, i === 0 ? options.caption : ''))
        : message(options.file, options.caption);
    },
  };
  const env = {
    store,
    live: createTelegramLive({ store, toLinks: telegramDialogLinks }),
    importer: async () => ({ Api: {}, client: { uploads: { CustomFile } } }),
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
  const up = async (name, bytes = 'x'.repeat(10)) => {
    const answer = await actions.receiveUpload(
      Readable.from([Buffer.from(bytes)]),
      {
        name,
      }
    );
    return answer.token;
  };
  return { store, sent, actions, up };
};

test('provider progress follows actual bytes across files and disappears after completion', async () => {
  const seen = [];
  const { actions, up } = setup({
    onTransfer: () => seen.push(actions.uploadProgress({ tokens }).progress),
  });
  const tokens = [
    await up('one.jpg', '1234567890'),
    await up('two.jpg', '1234567890'.repeat(3)),
  ];
  assert.equal(actions.uploadProgress({ tokens }).progress, 0);
  await actions.sendFiles({ chat: '42', tokens });
  assert.deepEqual(seen, [0, 0.125, 0.25, 0.25, 0.625, 1]);
  assert.equal(actions.uploadProgress({ tokens }).ok, false);
});

test('a photo goes as a photo with its caption and reply; stored; file removed (R-Y99)', async () => {
  const { store, sent, actions, up } = setup();
  const token = await up('cat.jpg', 'jpegbytes');
  const answer = await actions.sendFiles({
    chat: '42',
    tokens: [token],
    caption: 'look *at* this',
    replyTo: 7,
  });
  assert.equal(answer.ok, true);
  assert.equal(sent.length, 1);
  const [call] = sent;
  assert.equal(call.peer, 'peer:42');
  assert.equal(call.forceDocument, false);
  assert.equal(call.parseMode, false, 'the caption as typed');
  assert.equal(call.caption, 'look *at* this');
  assert.equal(call.replyTo, 7);
  assert.equal(call.clearDraft, true);
  assert.deepEqual(call.files, [
    { name: 'cat.jpg', size: 9, there: true, isCustom: true },
  ]);
  const link = await store.get(`msg:telegram:42:${answer.ids[0]}`);
  assert.equal(link.body, 'look *at* this');
  // The upload is gone, and cannot be sent twice.
  const again = await actions.sendFiles({ chat: '42', tokens: [token] });
  assert.equal(again.ok, false);
  assert.equal(sent.length, 1);
});

test('a formatted caption goes as text plus formatting (R-Y101)', async () => {
  const { sent, actions, up } = setup();
  await actions.sendFiles({
    chat: '42',
    tokens: [await up('a.jpg'), await up('b.jpg')],
    caption: '**big** day',
  });
  const [album] = sent;
  assert.equal(album.caption, '**big** day');
  const [text] = album.parseMode.parse(album.caption);
  assert.equal(text, 'big day', 'GramJS takes our parse');
});

test('photos together go as one album, other files apart; caption once (R-Y99)', async () => {
  const { sent, actions, up } = setup();
  const tokens = [
    await up('a.jpg'),
    await up('b.png'),
    await up('c.jpeg'),
    await up('report.pdf'),
    await up('d.jpg'),
  ];
  const answer = await actions.sendFiles({
    chat: '42',
    tokens,
    caption: 'trip',
  });
  assert.equal(answer.ok, true);
  assert.equal(answer.ids.length, 5);
  assert.deepEqual(
    sent.map((s) => [s.files.map((f) => f.name), s.forceDocument, s.caption]),
    [
      [['a.jpg', 'b.png', 'c.jpeg'], false, 'trip'],
      [['report.pdf'], true, ''],
      [['d.jpg'], false, ''],
    ]
  );
  assert.equal(sent[1].replyTo, undefined, 'only the first answers');
});

test('not compressed, not grouped: every file alone, as a file (R-Y99)', async () => {
  const { sent, actions, up } = setup();
  const tokens = [await up('a.jpg'), await up('b.jpg')];
  await actions.sendFiles({ chat: '42', tokens, asPhoto: false, group: false });
  assert.deepEqual(
    sent.map((s) => [s.files.length, s.forceDocument]),
    [
      [1, true],
      [1, true],
    ]
  );
});

test('a picture Telegram will not take as a photo goes as a file (R-Y99)', async () => {
  const { sent, actions, up } = setup({
    fail: (options, n) => (n === 1 ? 'PHOTO_INVALID_DIMENSIONS' : null),
  });
  const answer = await actions.sendFiles({
    chat: '42',
    tokens: [await up('panorama.jpg')],
  });
  assert.equal(answer.ok, true);
  assert.deepEqual(
    sent.map((s) => s.forceDocument),
    [false, true]
  );
});

test("Telegram's refusal comes back as the composer's code; files removed (R-Y99)", async () => {
  const { actions, up } = setup({ fail: () => 'CHAT_WRITE_FORBIDDEN' });
  const token = await up('a.jpg');
  await assert.rejects(
    actions.sendFiles({ chat: '42', tokens: [token] }),
    (error) => error.code === 'write-forbidden'
  );
  assert.equal(
    (await actions.sendFiles({ chat: '42', tokens: [token] })).ok,
    false
  );
});

test('a file larger than allowed is refused while it streams (R-Y99)', async () => {
  const { actions } = setup();
  await assert.rejects(
    actions.receiveUpload(Readable.from([Buffer.alloc(64)]), {
      name: 'big.bin',
      max: 16,
    }),
    (error) => error.code === 'too-large'
  );
});

test('albums hold ten at most; names keep no folders (R-Y99)', () => {
  const files = Array.from({ length: 23 }, (_, i) => ({ name: `${i}.jpg` }));
  assert.deepEqual(
    batchesOf(files, { asPhoto: true, group: true }).map((b) => b.files.length),
    [ALBUM_SIZE, ALBUM_SIZE, 3]
  );
  // GIFs are not photos (they go as animations).
  assert.deepEqual(
    batchesOf([{ name: 'a.gif' }, { name: 'b.jpg' }], {
      asPhoto: true,
      group: true,
    }).map((b) => b.photo),
    [false, true]
  );
  assert.equal(safeName('../../etc/passwd'), 'passwd');
  assert.equal(safeName('C:\\Users\\me\\photo.jpg'), 'photo.jpg');
  assert.equal(safeName('..'), 'file');
  assert.equal(safeName('a\u0000b.txt'), 'ab.txt');
});

const call = async (path, { body, type, origin, account }) => {
  const req = Readable.from([Buffer.from(body)]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': type,
    host: '127.0.0.1:8787',
    ...(origin ? { origin } : {}),
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
  await handleTelegramRoutes(req, res, path.split('?')[0], {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status, payload: JSON.parse(res.body) };
};

test('the upload takes bytes from the app only; send-files checks its body (R-Y99)', async () => {
  const { actions } = setup();
  const account = {
    receiveUpload: actions.receiveUpload,
    sendFiles: async (body) => ({ ok: true, ids: [], body }),
  };
  const ok = await call('/api/telegram/upload?name=a%20b.png', {
    body: 'png!',
    type: 'application/octet-stream',
    account,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.payload.name, 'a b.png');
  assert.equal(ok.payload.size, 4);
  assert.match(ok.payload.token, /^[a-f0-9]{32}$/);
  // A form on another site can post text/plain without asking: refused.
  const plain = await call('/api/telegram/upload?name=x', {
    body: 'x',
    type: 'text/plain',
    account,
  });
  assert.equal(plain.status, 403);
  const elsewhere = await call('/api/telegram/upload?name=x', {
    body: 'x',
    type: 'application/octet-stream',
    origin: 'https://evil.example',
    account,
  });
  assert.equal(elsewhere.status, 403);

  const send = (body) =>
    call('/api/telegram/send-files', {
      body: JSON.stringify(body),
      type: 'application/json',
      account,
    });
  assert.equal((await send({ chat: '42', tokens: [] })).status, 400);
  assert.equal((await send({ chat: '42', tokens: ['../x'] })).status, 400);
  assert.equal(
    (await send({ chat: 'x', tokens: [ok.payload.token] })).status,
    400
  );
  const sent = await send({
    chat: '42',
    tokens: [ok.payload.token],
    caption: 'hi',
    asPhoto: false,
    replyTo: 5,
  });
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.payload.body, {
    chat: '42',
    tokens: [ok.payload.token],
    caption: 'hi',
    asPhoto: false,
    group: true,
    replyTo: 5,
  });
});

test('the send box: sizes in words, pictures known, too large explained (R-Y99)', () => {
  assert.equal(sizeText(512), '512 B');
  assert.equal(sizeText(2048), '2.0 KB');
  assert.equal(sizeText(3.4 * 1024 * 1024), '3.4 MB');
  assert.equal(sizeText(150 * 1024 * 1024), '150 MB');
  assert.equal(isPicture({ type: 'image/png' }), true);
  assert.equal(isPicture({ type: 'application/pdf' }), false);
  assert.equal(
    failureText((key) => key, { code: 'too-large' }),
    'chat.failure.tooLarge'
  );
});
