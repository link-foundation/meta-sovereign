// Data-archive imports for Facebook/Messenger, Instagram, X and LinkedIn
// (R-Z10). Fixtures follow the networks' documented export layouts with
// invented data; nothing here is a real user's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { assertMode } from './helpers/mode.js';
import { createMemoryStore } from '../src/storage/index.js';
import { importDownloadedFile } from '../src/sources/auto-import/index.js';
import { openZipFile } from '../src/sources/archive/zip-file.js';
import { fixDeep, fixMojibake } from '../src/sources/archive/text.js';
import { facebookSource } from '../src/sources/facebook.js';
import { linkedinSource } from '../src/sources/linkedin.js';

// --- fixtures ---------------------------------------------------------

// ZIP writer: deflated entries, optional ZIP64 end records (CRC left 0).
const makeZip = (files, { zip64 = false, stored = false } = {}) => {
  const parts = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(content);
    const data = stored ? raw : deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const count = Object.keys(files).length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const tail = [cd];
  if (zip64) {
    const rec = Buffer.alloc(56);
    rec.writeUInt32LE(0x06064b50, 0);
    rec.writeBigUInt64LE(44n, 4);
    rec.writeBigUInt64LE(BigInt(count), 24);
    rec.writeBigUInt64LE(BigInt(count), 32);
    rec.writeBigUInt64LE(BigInt(cd.length), 40);
    rec.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + cd.length), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(rec, locator);
    eocd.writeUInt16LE(0xffff, 8);
    eocd.writeUInt16LE(0xffff, 10);
    eocd.writeUInt32LE(0xffffffff, 12);
    eocd.writeUInt32LE(0xffffffff, 16);
  } else {
    eocd.writeUInt16LE(count, 8);
    eocd.writeUInt16LE(count, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
  }
  return Buffer.concat([...parts, ...tail, eocd]);
};

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'z10-'));

const writeIn = async (dir, name, content) => {
  const file = path.join(dir, name);
  await fs.writeFile(file, content);
  return file;
};

// Facebook writes UTF-8 bytes as latin-1 escapes inside its JSON.
const mojibake = (text) => Buffer.from(text, 'utf8').toString('latin1');

const THREAD = 'your_facebook_activity/messages/inbox/ivan_AbC123';
const fbThread = (messages, extra = {}) =>
  JSON.stringify({
    participants: [{ name: mojibake('Иван') }, { name: 'Me' }],
    messages,
    title: mojibake('Иван'),
    is_still_participant: true,
    thread_path: 'inbox/ivan_AbC123',
    ...extra,
  });

// --- text repairs -----------------------------------------------------

test('fixMojibake decodes latin-1 escaped UTF-8 only when it round-trips', () => {
  assert.equal(fixMojibake(mojibake('Привет, мир')), 'Привет, мир');
  assert.equal(fixMojibake(mojibake('😀 ok')), '😀 ok');
  assert.equal(fixMojibake('café'), 'café');
  assert.equal(fixMojibake('already Привет'), 'already Привет');
  assert.equal(fixMojibake('Ð'), 'Ð');
  assert.deepEqual(fixDeep({ a: [mojibake('é')] }), { a: ['é'] });
});

// --- Facebook / Messenger ---------------------------------------------

test('Facebook: messages in the same millisecond or other threads do not collide', async () => {
  const same = { sender_name: 'Me', timestamp_ms: 1700000000000, content: 'a' };
  const links = await facebookSource.parseArchive(
    fbThread([same, { ...same, content: 'b' }]),
    { entryName: `${THREAD}/message_1.json` }
  );
  const other = await facebookSource.parseArchive(fbThread([same]), {
    entryName: 'your_facebook_activity/messages/inbox/anna_Zz9/message_1.json',
  });
  const ids = new Set([...links, ...other].map((l) => l.id));
  assert.equal(ids.size, 3);
  assert.ok(links.every((l) => l.chat === 'ivan_AbC123'));
});

test('Facebook: a zip imports threads, fixes text, copies media (0600) and is idempotent', async () => {
  const dir = await tmpDir();
  const photo = Buffer.from('fake-jpeg-bytes');
  const sha = createHash('sha256').update(photo).digest('hex');
  const newest = fbThread([
    {
      sender_name: mojibake('Иван'),
      timestamp_ms: 1700000002000,
      content: mojibake('Привет 😀'),
      photos: [{ uri: `${THREAD}/photos/p1.jpg`, creation_timestamp: 1 }],
      reactions: [
        { reaction: mojibake('👍'), actor: 'Me' },
        { reaction: mojibake('👍'), actor: mojibake('Иван') },
      ],
      type: 'Generic',
    },
    {
      sender_name: 'Me',
      timestamp_ms: 1700000001000,
      content: 'sticker next',
      sticker: { uri: `${THREAD}/stickers_used/s.png` },
      files: [{ uri: `${THREAD}/files/missing.pdf` }],
      share: { link: 'https://example.com/x', share_text: 'look' },
    },
  ]);
  const older = fbThread([
    {
      sender_name: 'Me',
      timestamp_ms: 1700000000000,
      content: 'oldest',
      is_unsent: true,
    },
  ]);
  const zip = makeZip({
    [`export-2026/${THREAD}/message_2.json`]: older,
    [`export-2026/${THREAD}/message_1.json`]: newest,
    [`export-2026/${THREAD}/photos/p1.jpg`]: photo,
    [`export-2026/${THREAD}/stickers_used/s.png`]: 'png',
    'export-2026/your_facebook_activity/posts/your_posts.json': '[]',
  });
  const file = await writeIn(dir, 'facebook.zip', zip);
  const store = createMemoryStore();
  const mediaDir = path.join(dir, 'media');
  const progress = [];
  const reports = await importDownloadedFile({
    store,
    provider: 'facebook',
    filePath: file,
    mediaDir,
    onProgress: (p) => progress.push(p),
  });
  assert.deepEqual(
    reports.map((r) => [r.name, r.imported]),
    [
      [`facebook.zip:export-2026/${THREAD}/message_1.json`, 2],
      [`facebook.zip:export-2026/${THREAD}/message_2.json`, 1],
    ]
  );
  assert.ok(progress.length >= 2);
  const links = await store.query();
  assert.equal(links.length, 3);
  const first = links.find((l) => l.body === 'Привет 😀');
  assert.equal(first.sender, 'Иван');
  assert.equal(first.chat, 'ivan_AbC123');
  assert.equal(first.chatName, 'Иван');
  assert.equal(first.chatType, 'private');
  assert.deepEqual(first.participants, ['Иван', 'Me']);
  assert.equal(first.timestamp, '2023-11-14T22:13:22.000Z');
  assert.deepEqual(first.reactions, [
    { emoji: '👍', count: 2, by: ['Me', 'Иван'] },
  ]);
  assert.equal(first.attachments[0].kind, 'photo');
  assert.equal(first.attachments[0].sha256, sha);
  assert.equal(first.attachments[0].path, `media/facebook/${sha}.jpg`);
  await assertMode(path.join(mediaDir, 'facebook', `${sha}.jpg`), 0o600);
  await assertMode(path.join(mediaDir, 'facebook'), 0o700);
  await assertMode(mediaDir, 0o700);
  const second = links.find((l) => l.body === 'sticker next');
  assert.deepEqual(
    second.attachments.map((a) => [a.kind, Boolean(a.path)]),
    [
      ['file', false],
      ['sticker', true],
      ['link', false],
    ]
  );
  assert.equal(links.find((l) => l.body === 'oldest').deleted, true);
  // Same archive again: same ids, nothing new, no media rewritten.
  await importDownloadedFile({
    store,
    provider: 'facebook',
    filePath: file,
    mediaDir,
  });
  assert.equal((await store.query()).length, 3);
  assert.equal((await fs.readdir(path.join(mediaDir, 'facebook'))).length, 2);
});

test('Instagram threads (your_instagram_activity) import as instagram links', async () => {
  const dir = await tmpDir();
  const base = 'your_instagram_activity/messages/inbox/maria_77';
  const zip = makeZip({
    [`${base}/message_1.json`]: JSON.stringify({
      participants: [{ name: 'Maria' }, { name: 'Me' }, { name: 'Zed' }],
      messages: [
        {
          sender_name: 'Maria',
          timestamp_ms: 1700000000000,
          content: mojibake('Привет'),
          videos: [{ uri: `${base}/videos/v.mp4` }],
        },
      ],
      title: 'Trio',
    }),
    [`${base}/videos/v.mp4`]: 'video',
  });
  const file = await writeIn(dir, 'instagram.zip', zip);
  const store = createMemoryStore();
  await importDownloadedFile({
    store,
    provider: 'facebook',
    filePath: file,
    mediaDir: path.join(dir, 'media'),
  });
  const [link] = await store.query();
  assert.equal(link.source, 'instagram');
  assert.match(link.id, /^msg:instagram:maria_77:1700000000000:/);
  assert.equal(link.body, 'Привет');
  assert.equal(link.chatType, 'group');
  assert.match(
    link.attachments[0].path,
    /^media\/instagram\/[0-9a-f]{64}\.mp4$/
  );
});

test('Facebook HTML export threads are read too', async () => {
  const html = `<html><head><title>Anna</title></head><body>
    <div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder">
      <div class="_3-96 _2pio _2lek _2lel _a6-h">Anna</div>
      <div class="_3-96 _2let _a6-p"><div><div></div><div>Tom &amp; Jerry<br/>second line
        <img src="photos/a.jpg"/></div>
        <ul class="_tqp _a6-q"><li>👍Me</li></ul></div></div>
      <div class="_3-94 _2lem _a6-o">Nov 14, 2023 10:13:20 pm</div>
    </div></body></html>`;
  const links = await facebookSource.parseArchive(html, {
    entryName: 'messages/inbox/anna_Q1/message_1.html',
  });
  assert.equal(links.length, 1);
  assert.equal(links[0].chat, 'anna_Q1');
  assert.equal(links[0].sender, 'Anna');
  assert.equal(links[0].body, 'Tom & Jerry\nsecond line');
  // The export names no zone: read in this machine's zone (R-Z10).
  assert.equal(
    links[0].timestamp,
    new Date(2023, 10, 14, 22, 13, 20).toISOString()
  );
  assert.deepEqual(links[0].reactions, [{ emoji: '👍', count: 1, by: ['Me'] }]);
  assert.equal(links[0].attachments[0].name, 'a.jpg');
});

// --- X ---------------------------------------------------------------

const ytd = (name, value) =>
  `window.YTD.${name}.part0 = ${JSON.stringify(value)}`;

test('X: group DMs, media, reactions, names and account.js are imported', async () => {
  const dir = await tmpDir();
  const one = ytd('direct_messages', [
    {
      dmConversation: {
        conversationId: '11-22',
        messages: [
          {
            messageCreate: {
              id: '900',
              senderId: '11',
              recipientId: '22',
              text: 'see https://t.co/abc',
              urls: [
                { url: 'https://t.co/abc', expanded: 'https://example.com' },
              ],
              mediaUrls: [
                'https://ton.twitter.com/i/ton/data/dm/900/1/pic.jpg',
              ],
              reactions: [
                { senderId: '22', reactionKey: 'funny', createdAt: 'x' },
              ],
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        ],
      },
    },
  ]);
  const group = ytd('direct_messages_group', [
    {
      dmConversation: {
        conversationId: '5555',
        messages: [
          {
            joinConversation: {
              initiatingUserId: '11',
              participantsSnapshot: ['11', '22', '33'],
            },
          },
          { conversationNameUpdate: { name: 'Crew', createdAt: 'x' } },
          {
            messageCreate: {
              id: '901',
              senderId: '33',
              text: 'hello group',
              createdAt: '2026-01-02T00:00:00.000Z',
            },
          },
        ],
      },
    },
  ]);
  const zip = makeZip({
    'data/account.js': ytd('account', [
      {
        account: {
          accountId: '11',
          username: 'me',
          accountDisplayName: 'Me Myself',
        },
      },
    ]),
    'data/direct-messages-group.js': group,
    'data/direct-messages.js': one,
    'data/direct_messages_media/900-pic.jpg': 'jpgbytes',
  });
  const file = await writeIn(dir, 'twitter.zip', zip);
  const store = createMemoryStore();
  const reports = await importDownloadedFile({
    store,
    provider: 'x',
    filePath: file,
    mediaDir: path.join(dir, 'media'),
  });
  assert.equal(reports.length, 3);
  assert.ok(reports.every((r) => !r.error));
  const dm = await store.get('msg:x:900');
  assert.equal(dm.body, 'see https://example.com');
  assert.equal(dm.senderName, 'Me Myself');
  assert.equal(dm.outgoing, true);
  assert.equal(dm.chatType, 'private');
  assert.equal(dm.attachments[0].kind, 'photo');
  assert.match(dm.attachments[0].path, /^media\/x\/[0-9a-f]{64}\.jpg$/);
  assert.deepEqual(dm.reactions, [{ emoji: '😂', count: 1, by: ['22'] }]);
  const g = await store.get('msg:x:901');
  assert.equal(g.chat, '5555');
  assert.equal(g.chatName, 'Crew');
  assert.equal(g.chatType, 'group');
  assert.deepEqual(g.participants, ['11', '22', '33']);
  assert.equal(g.outgoing, false);
  await importDownloadedFile({ store, provider: 'x', filePath: file });
  assert.equal((await store.query()).length, 2);
});

// --- LinkedIn --------------------------------------------------------

test('LinkedIn: quoted newlines, same-second messages, folders and participants', async () => {
  const dir = await tmpDir();
  const csv =
    'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER,ATTACHMENTS\r\n' +
    'c1,,Alice,https://www.linkedin.com/in/alice,"Me, Bob",,2026-01-01 10:00:00 UTC,Hi,"line one\r\nline ""two""",INBOX,\r\n' +
    'c1,,Alice,https://www.linkedin.com/in/alice,"Me, Bob",,2026-01-01 10:00:00 UTC,,second,INBOX,https://media.example/f.pdf\r\n' +
    'c2,Deal,Me,https://www.linkedin.com/in/me,Carol,,2026-01-02 11:30:00 UTC,,reply,SENT,\r\n';
  const file = await writeIn(dir, 'messages.csv', csv);
  const store = createMemoryStore();
  const [report] = await importDownloadedFile({
    store,
    provider: 'linkedin',
    filePath: file,
  });
  assert.equal(report.imported, 3);
  const links = await store.query();
  assert.equal(new Set(links.map((l) => l.id)).size, 3);
  const first = links.find((l) => l.body.startsWith('line one'));
  assert.equal(first.body, 'line one\r\nline "two"');
  assert.equal(first.timestamp, '2026-01-01T10:00:00.000Z');
  assert.equal(first.sender, 'https://www.linkedin.com/in/alice');
  assert.equal(first.senderName, 'Alice');
  assert.equal(first.folder, 'inbox');
  assert.equal(first.outgoing, false);
  assert.equal(first.chatType, 'group');
  assert.deepEqual(first.participants, ['Alice', 'Me', 'Bob']);
  const sent = links.find((l) => l.body === 'reply');
  assert.equal(sent.folder, 'sent');
  assert.equal(sent.outgoing, true);
  assert.equal(sent.chatName, 'Deal');
  assert.equal(
    links.find((l) => l.body === 'second').attachments[0].url,
    'https://media.example/f.pdf'
  );
  await importDownloadedFile({ store, provider: 'linkedin', filePath: file });
  assert.equal((await store.query()).length, 3);
});

test('LinkedIn: a date with no zone is read in the machine zone, UTC stays UTC', async () => {
  const row = { CONVERSATION_ID: 'c', FROM: 'A' };
  const [local, utc] = await linkedinSource.parseArchive({
    messages: [
      { ...row, DATE: '2026-01-01 10:00:00' },
      { ...row, DATE: '2026-01-01 10:00:00 UTC' },
    ],
  });
  assert.equal(local.timestamp, new Date(2026, 0, 1, 10, 0, 0).toISOString());
  assert.equal(utc.timestamp, '2026-01-01T10:00:00.000Z');
});

test('LinkedIn: direct parseArchive keeps ids unique without an import context', async () => {
  const row = {
    CONVERSATION_ID: 'c',
    FROM: 'A',
    DATE: '2026-01-01 10:00:00 UTC',
  };
  const links = await linkedinSource.parseArchive({
    messages: [row, row, row],
  });
  assert.equal(new Set(links.map((l) => l.id)).size, 3);
});

// --- robustness ------------------------------------------------------

test('a broken file is an error row and the other files still import', async () => {
  const dir = await tmpDir();
  const zip = makeZip({
    'messages/inbox/a_1/message_1.json': '{ not json',
    'messages/inbox/b_2/message_1.json': fbThread([
      { sender_name: 'Me', timestamp_ms: 5, content: 'ok' },
    ]),
  });
  const file = await writeIn(dir, 'fb.zip', zip);
  const store = createMemoryStore();
  const reports = await importDownloadedFile({
    store,
    provider: 'facebook',
    filePath: file,
  });
  assert.equal(reports.length, 2);
  assert.ok(reports[0].error);
  assert.equal(reports[1].imported, 1);
  assert.equal((await store.query()).length, 1);
});

test('a failing store write stops the import with a clear error', async () => {
  const dir = await tmpDir();
  const zip = makeZip({
    'messages/inbox/a_1/message_1.json': fbThread([
      { sender_name: 'Me', timestamp_ms: 5, content: 'one' },
    ]),
    'messages/inbox/b_2/message_1.json': fbThread([
      { sender_name: 'Me', timestamp_ms: 6, content: 'two' },
    ]),
  });
  const file = await writeIn(dir, 'fb.zip', zip);
  let calls = 0;
  const store = {
    async put() {
      calls += 1;
      throw Object.assign(new Error('disk is full'), { code: 'STORE_FULL' });
    },
  };
  const reports = await importDownloadedFile({
    store,
    provider: 'facebook',
    filePath: file,
  });
  assert.equal(calls, 1);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].aborted, true);
  assert.equal(reports[0].code, 'STORE_FULL');
  assert.match(reports[0].error, /disk is full/);
});

test('the zip reader streams entries and reads ZIP64 end records', async () => {
  const dir = await tmpDir();
  const big = Buffer.alloc(3 * 1024 * 1024, 'abc');
  for (const zip64 of [false, true]) {
    const file = await writeIn(
      dir,
      `z${zip64}.zip`,
      makeZip({ 'a/big.bin': big, 'b.txt': 'hello' }, { zip64 })
    );
    const zip = await openZipFile(file);
    try {
      assert.deepEqual(
        zip.entries.map((e) => e.name),
        ['a/big.bin', 'b.txt']
      );
      let size = 0;
      for await (const chunk of await zip.entries[0].stream()) {
        size += chunk.length;
      }
      assert.equal(size, big.length);
      assert.equal((await zip.entries[1].read()).toString(), 'hello');
    } finally {
      await zip.close();
    }
  }
});
