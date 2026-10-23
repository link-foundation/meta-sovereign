// Export chat history (R-Y186): the request checked, the folder checked
// (relative, inside the store, symlinks), the JSON in Telegram Desktop's
// shape, the HTML pages split every 1000 messages, the media folders, the
// size-limit and kind skips, the date range, Cancel, a flood wait, one
// export at a time, nothing logged of the messages, and the routes. Fake
// clients and a temp directory; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createHistoryExport,
  parseExport,
} from '../src/sources/telegram-export.js';
import { createFetchQueue, NO_PACE } from '../src/sources/telegram-history.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createHtmlWriter } from '../src/sources/telegram-export-html.js';
import {
  checkFolder,
  dayOf,
  defaultFolder,
  localIso,
} from '../src/sources/telegram-export-paths.js';
import {
  entitiesOf,
  textFieldsOf,
} from '../src/sources/telegram-export-shape.js';
import { postRoute } from './helpers/telegram-route.js';
import {
  Api,
  FIXTURE,
  fakeClient,
  helpers,
  localDate,
  msg,
} from './helpers/export-fakes.mjs';

const setup = async (messages, hooks, extra = {}) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-export-'));
  const storeDir = path.join(dir, 'store');
  await fs.mkdir(storeDir, { recursive: true });
  const { client, log } = fakeClient(messages, hooks);
  const store = createMemoryStore();
  const events = [];
  let clock = Date.parse('2026-02-01T10:00:00');
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    queue: createFetchQueue({ pace: NO_PACE, now: () => clock }),
    store,
    log: (e) => events.push(e),
    sleep: async (ms) => {
      clock += ms;
    },
  };
  const actions = createHistoryExport(env, {
    userClient: async () => client,
    mediaDir: path.join(storeDir, 'media', 'telegram'),
    home: dir,
    now: () => clock,
    ...extra,
  });
  return { dir, storeDir, actions, log, store, events, env };
};

const MEDIA_ALL = {
  photos: true,
  videos: true,
  voice: true,
  roundVideo: true,
  stickers: true,
  gifs: true,
  files: true,
};

const requestFor = (dir, patch = {}) => ({
  chat: '7',
  chatName: 'Alice Liddell',
  media: MEDIA_ALL,
  sizeLimitMb: 1,
  formats: ['json', 'html'],
  folder: path.join(dir, 'out'),
  ...patch,
});

const finished = async (actions) => {
  for (let i = 0; i < 4000; i += 1) {
    const { job } = await actions.exportStatus();
    if (job && !['running', 'cancelling'].includes(job.state)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('export did not finish');
};

const readJson = async (dir) =>
  JSON.parse(await fs.readFile(path.join(dir, 'out', 'result.json'), 'utf8'));

test('parseExport takes only a strict request', () => {
  const good = requestFor('/tmp/x');
  assert.equal(parseExport(good).ok, true);
  assert.deepEqual(parseExport(good).value.formats, ['html', 'json']);
  const bads = [
    { ...good, chat: 'abc' },
    { ...good, media: { photos: 'yes' } },
    { ...good, media: { ...MEDIA_ALL, bombs: true } },
    { ...good, sizeLimitMb: 0 },
    { ...good, sizeLimitMb: 4001 },
    { ...good, sizeLimitMb: 1.5 },
    { ...good, formats: [] },
    { ...good, formats: ['pdf'] },
    { ...good, formats: ['html', 'html'] },
    { ...good, from: '2026-13-01' },
    { ...good, from: '2026-02-03', to: '2026-02-01' },
    { ...good, chatName: 'x'.repeat(257) },
  ];
  for (const bad of bads) {
    assert.deepEqual(parseExport(bad).code, 'bad-request', JSON.stringify(bad));
  }
  assert.equal(
    parseExport({ ...good, sizeLimitMb: undefined }).value.sizeLimitMb,
    8
  );
});

test("the default folder is Desktop's, and a typed one is checked", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-export-home-'));
  const now = Date.parse('2026-10-23T09:00:00');
  assert.equal(
    defaultFolder(now, home),
    path.join(home, 'Downloads', 'Telegram Desktop', 'ChatExport_2026-10-23')
  );
  const store = path.join(home, 'store');
  await fs.mkdir(store, { recursive: true });
  const opts = { storeDir: store, home };
  assert.equal(
    (await checkFolder('relative/dir', opts)).code,
    'relative-folder'
  );
  assert.equal((await checkFolder('./x', opts)).code, 'relative-folder');
  assert.equal((await checkFolder('', opts)).code, 'bad-folder');
  assert.equal((await checkFolder(42, opts)).code, 'bad-folder');
  assert.equal(
    (await checkFolder(path.parse(home).root, opts)).code,
    'bad-folder'
  );
  assert.equal((await checkFolder(store, opts)).code, 'inside-store');
  assert.equal(
    (await checkFolder(path.join(store, 'media', 'x'), opts)).code,
    'inside-store'
  );
  assert.equal(
    (await checkFolder(path.join(store, '..', 'store', 'a'), opts)).code,
    'inside-store'
  );
  // A link into the store does not hide it.
  const link = path.join(home, 'link');
  await fs.symlink(store, link);
  assert.equal(
    (await checkFolder(path.join(link, 'sub'), opts)).code,
    'inside-store'
  );
  assert.deepEqual(await checkFolder(path.join(home, 'out'), opts), {
    ok: true,
    folder: path.join(home, 'out'),
  });
  assert.equal(
    (await checkFolder('~/exports', opts)).folder,
    path.join(home, 'exports')
  );
});

test('exportDefaults gives a free default folder', async () => {
  const { actions, dir } = await setup([]);
  const first = await actions.exportDefaults();
  assert.equal(first.ok, true);
  assert.match(first.folder, /ChatExport_\d{4}-\d{2}-\d{2}$/);
  assert.ok(first.folder.startsWith(dir));
  await fs.mkdir(first.folder, { recursive: true });
  const second = await actions.exportDefaults();
  assert.equal(second.folder, `${first.folder} (1)`);
});

test('a folder that is relative or inside the store is refused, nothing written', async () => {
  const { actions, dir, storeDir, log } = await setup(FIXTURE);
  const relative = await actions.exportStart(
    requestFor(dir, { folder: 'out' })
  );
  assert.equal(relative.code, 'relative-folder');
  const inside = await actions.exportStart(
    requestFor(dir, { folder: path.join(storeDir, 'media', 'telegram', 'x') })
  );
  assert.equal(inside.code, 'inside-store');
  assert.equal(log.history.length, 0);
  assert.equal((await actions.exportStatus()).job, null);
  await assert.rejects(
    fs.access(path.join(storeDir, 'media', 'telegram', 'x'))
  );
});

test("the JSON export has Desktop's shape, oldest first", async () => {
  const { actions, dir } = await setup(FIXTURE);
  const started = await actions.exportStart(requestFor(dir));
  assert.equal(started.ok, true);
  const job = await finished(actions);
  assert.equal(job.state, 'done');
  assert.equal(job.messages, 10);
  const data = await readJson(dir);
  assert.deepEqual(
    [data.name, data.type, data.id],
    ['Alice Liddell', 'personal_chat', 7]
  );
  assert.deepEqual(
    data.messages.map((m) => m.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  const [first, second] = data.messages;
  assert.equal(first.type, 'message');
  assert.equal(first.from, 'Alice Liddell');
  assert.equal(first.from_id, 'user7');
  assert.equal(first.date, localIso(localDate(1) * 1000));
  assert.equal(first.date_unixtime, String(localDate(1)));
  assert.equal(first.text, 'Hello <b>world</b>');
  assert.deepEqual(first.text_entities, [
    { type: 'plain', text: 'Hello <b>world</b>' },
  ]);
  assert.equal(second.reply_to_message_id, 1);
  assert.match(second.photo, /^photos\/photo_1@\d{2}-01-2026_12-00-00\.jpg$/);
  assert.equal(second.width, 800);
  assert.deepEqual(second.text, [{ type: 'bold', text: 'bold' }, ' caption']);
  assert.deepEqual(second.text_entities, [
    { type: 'bold', text: 'bold' },
    { type: 'plain', text: ' caption' },
  ]);
  const service = data.messages[8];
  assert.equal(service.type, 'service');
  assert.equal(service.action, 'invite_members');
  assert.deepEqual(service.members, ['Alice Liddell']);
  const last = data.messages[9];
  assert.equal(last.forwarded_from, 'Somebody');
  assert.equal(last.from, 'Me');
  assert.equal(last.from_id, 'user1');
});

test("files go to Desktop's folders, each message links its own", async () => {
  const { actions, dir } = await setup(FIXTURE);
  await actions.exportStart(requestFor(dir, { sizeLimitMb: 10 }));
  await finished(actions);
  const { messages } = await readJson(dir);
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
  assert.match(byId[3].file, /^voice_messages\/audio_1@.*\.ogg$/);
  assert.equal(byId[3].media_type, 'voice_message');
  assert.equal(byId[3].duration_seconds, 7);
  assert.match(byId[4].file, /^video_files\/video_1@.*\.mp4$/);
  assert.equal(byId[4].media_type, 'video_file');
  assert.match(byId[5].file, /^stickers\/sticker_1@.*\.webp$/);
  assert.equal(byId[5].sticker_emoji, '\u{1F600}');
  assert.equal(byId[6].file, 'files/report.pdf');
  assert.equal(byId[6].file_name, 'report.pdf');
  assert.match(byId[7].file, /^round_video_messages\/video_1@.*\.mp4$/);
  assert.equal(byId[7].media_type, 'video_message');
  assert.match(byId[8].file, /^video_files\/animation_2@.*\.mp4$/);
  assert.equal(byId[8].media_type, 'animation');
  for (const id of [2, 3, 4, 5, 6, 7, 8]) {
    const target = byId[id].file ?? byId[id].photo;
    assert.ok((await fs.stat(path.join(dir, 'out', target))).size > 0, target);
  }
  // No half-written downloads are left behind.
  const left = await fs.readdir(path.join(dir, 'out', 'files'));
  assert.deepEqual(left, ['report.pdf']);
});

test('files over the size limit and kinds turned off are noted, not downloaded', async () => {
  const { actions, dir, log } = await setup(FIXTURE);
  await actions.exportStart(
    requestFor(dir, {
      sizeLimitMb: 1,
      media: { ...MEDIA_ALL, stickers: false, photos: false },
    })
  );
  const job = await finished(actions);
  const { messages } = await readJson(dir);
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
  assert.equal(
    byId[4].file,
    '(File exceeds maximum size. Change data exporting settings to download.)'
  );
  assert.equal(byId[4].file_size, 3 * 1024 * 1024);
  assert.equal(
    byId[5].file,
    '(File not included. Change data exporting settings to download.)'
  );
  assert.equal(
    byId[2].photo,
    '(File not included. Change data exporting settings to download.)'
  );
  assert.equal(job.skipped, 3);
  assert.equal(job.files, 4);
  assert.equal(log.downloads.length, 4);
  await assert.rejects(fs.access(path.join(dir, 'out', 'stickers')));
  await assert.rejects(fs.access(path.join(dir, 'out', 'photos')));
});

test('the date range keeps only its days', async () => {
  const { actions, dir } = await setup(FIXTURE);
  await actions.exportStart(
    requestFor(dir, {
      from: dayOf(localDate(3) * 1000),
      to: dayOf(localDate(5) * 1000),
    })
  );
  const job = await finished(actions);
  assert.equal(job.state, 'done');
  assert.equal(job.total, null);
  const { messages } = await readJson(dir);
  assert.deepEqual(
    messages.map((m) => m.id),
    [3, 4, 5]
  );
});

test('the HTML pages are written with the media linked and the text escaped', async () => {
  const { actions, dir } = await setup(FIXTURE);
  await actions.exportStart(
    requestFor(dir, { formats: ['html'], sizeLimitMb: 10 })
  );
  await finished(actions);
  const html = await fs.readFile(
    path.join(dir, 'out', 'messages.html'),
    'utf8'
  );
  assert.match(html, /<title>Exported Data<\/title>/);
  assert.match(html, /Alice Liddell/);
  assert.match(html, /Hello &lt;b&gt;world&lt;\/b&gt;/);
  assert.ok(!html.includes('<b>world'));
  assert.match(html, /<strong>bold<\/strong> caption/);
  assert.match(html, /<img class="photo" src="photos\/photo_1@/);
  assert.match(html, /<audio controls src="voice_messages\//);
  assert.match(html, /href="files\/report\.pdf"/);
  assert.match(html, /id="message9"/);
  assert.ok(
    (await fs.stat(path.join(dir, 'out', 'css', 'style.css'))).size > 100
  );
  await assert.rejects(fs.access(path.join(dir, 'out', 'result.json')));
});

test('a thousand messages make a page; the next page is linked', async () => {
  const many = Array.from({ length: 1001 }, (_, i) =>
    msg(i + 1, 1 + (i % 20), { message: `m${i + 1}` })
  );
  const { actions, dir } = await setup(many);
  await actions.exportStart(requestFor(dir, { formats: ['html', 'json'] }));
  const job = await finished(actions);
  assert.equal(job.messages, 1001);
  assert.equal(job.total, 1001);
  const one = await fs.readFile(path.join(dir, 'out', 'messages.html'), 'utf8');
  const two = await fs.readFile(
    path.join(dir, 'out', 'messages2.html'),
    'utf8'
  );
  assert.match(one, /id="message1000"/);
  assert.ok(!one.includes('id="message1001"'));
  assert.match(one, /href="messages2\.html"/);
  assert.match(two, /id="message1001"/);
  assert.ok(!two.includes('href="messages3.html"'));
  assert.equal((await readJson(dir)).messages.length, 1001);
});

test('the HTML writer splits pages and links forward', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-export-html-'));
  const writer = await createHtmlWriter({ dir, title: 'T', perPage: 2 });
  for (let id = 1; id <= 5; id += 1) {
    await writer.add(
      {
        id,
        type: 'message',
        date: '2026-01-01T10:00:00',
        date_unixtime: '1',
        from: 'A',
        from_id: 'user1',
      },
      [{ text: `t${id}`, covers: [] }]
    );
  }
  await writer.close();
  assert.equal(writer.pages(), 3);
  const third = await fs.readFile(path.join(dir, 'messages3.html'), 'utf8');
  assert.match(third, /id="message5"/);
  assert.ok(!third.includes('Next messages'));
  const second = await fs.readFile(path.join(dir, 'messages2.html'), 'utf8');
  assert.match(second, /messages3\.html/);
});

test('Cancel stops the export and keeps a valid partial result', async () => {
  const many = Array.from({ length: 250 }, (_, i) =>
    msg(i + 1, 1, { message: `m${i}` })
  );
  let actionsRef = null;
  const { actions, dir } = await setup(many, {
    onHistory: async (request, log) => {
      if (log.history.length === 2) {
        await actionsRef.exportCancel();
      }
    },
  });
  actionsRef = actions;
  await actions.exportStart(requestFor(dir));
  const job = await finished(actions);
  assert.equal(job.state, 'cancelled');
  assert.ok(job.messages > 0 && job.messages < 250, String(job.messages));
  const data = await readJson(dir);
  assert.equal(data.messages.length, job.messages);
  await fs.access(path.join(dir, 'out', 'messages.html'));
});

test('one export at a time', async () => {
  let release = null;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { actions, dir } = await setup(FIXTURE, {
    onHistory: () => gate,
  });
  const first = await actions.exportStart(requestFor(dir));
  assert.equal(first.ok, true);
  const second = await actions.exportStart(
    requestFor(dir, { folder: path.join(dir, 'other') })
  );
  assert.equal(second.code, 'busy');
  release();
  await finished(actions);
  const third = await actions.exportStart(
    requestFor(dir, { folder: path.join(dir, 'again') })
  );
  assert.equal(third.ok, true);
  await finished(actions);
});

test('Telegram asking to wait is waited out, then the export goes on', async () => {
  let thrown = false;
  const { actions, dir, events } = await setup(FIXTURE, {
    onHistory: () => {
      if (!thrown) {
        thrown = true;
        throw Object.assign(new Error('FLOOD_WAIT_2'), {
          errorMessage: 'FLOOD_WAIT_2',
        });
      }
    },
  });
  await actions.exportStart(
    requestFor(dir, {
      formats: ['json'],
      media: { ...MEDIA_ALL, photos: false },
    })
  );
  const job = await finished(actions);
  assert.equal(job.state, 'done');
  assert.equal(job.messages, 10);
  assert.ok(events.some((e) => e.event === 'telegram_export_waiting'));
});

test('a Telegram refusal ends the export as failed with a code', async () => {
  const { actions, dir } = await setup(FIXTURE, {
    onHistory: () => {
      throw Object.assign(new Error('CHANNEL_PRIVATE'), {
        errorMessage: 'CHANNEL_PRIVATE',
      });
    },
  });
  await actions.exportStart(requestFor(dir));
  const job = await finished(actions);
  assert.equal(job.state, 'failed');
  assert.equal(job.code, 'no-access');
});

test('progress is a link on the store; no message text is logged', async () => {
  const { actions, dir, store, events } = await setup(FIXTURE);
  await actions.exportStart(requestFor(dir));
  await finished(actions);
  const link = await store.get('export:telegram:7');
  assert.equal(link.kind, 'export');
  assert.equal(link.state, 'done');
  assert.equal(link.messages, 10);
  assert.equal(link.total, 10);
  assert.ok(link.files > 0);
  const logged = JSON.stringify(events);
  assert.ok(events.some((e) => e.event === 'telegram_export_end'));
  for (const secret of [
    'Hello',
    'forwarded',
    'bold caption',
    'Alice',
    'report.pdf',
  ]) {
    assert.ok(!logged.includes(secret), secret);
  }
});

test('only reads are asked of Telegram', async () => {
  const { actions, dir, log } = await setup(FIXTURE);
  await actions.exportStart(requestFor(dir));
  await finished(actions);
  assert.ok(log.history.every((r) => r.className === 'GetHistory'));
  assert.ok(log.downloads.every((d) => d.options.outputFile.endsWith('.part')));
});

test('the status reveals the folder only once finished', async () => {
  const opened = [];
  let release = null;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { actions, dir } = await setup(
    FIXTURE,
    { onHistory: () => gate },
    {
      reveal: async (folder) => opened.push(folder),
    }
  );
  assert.equal((await actions.exportReveal()).code, 'no-export');
  await actions.exportStart(requestFor(dir));
  assert.equal((await actions.exportReveal()).code, 'no-export');
  release();
  await finished(actions);
  assert.equal((await actions.exportReveal()).ok, true);
  assert.deepEqual(opened, [path.join(dir, 'out')]);
});

test('entities overlap into pieces; unknown ones are dropped', () => {
  const raw = {
    message: 'abcdef',
    entities: [
      { className: 'MessageEntityBold', offset: 0, length: 4 },
      { className: 'MessageEntityItalic', offset: 2, length: 4 },
      {
        className: 'MessageEntityTextUrl',
        offset: 5,
        length: 1,
        url: 'https://x.y',
      },
      { className: 'MessageEntityUnknownThing', offset: 0, length: 6 },
    ],
  };
  assert.equal(entitiesOf(raw).length, 3);
  const fields = textFieldsOf(raw);
  assert.deepEqual(
    fields.text_entities.map((e) => [e.type, e.text]),
    [
      ['bold', 'ab'],
      ['bold', 'cd'],
      ['italic', 'e'],
      ['italic', 'f'],
    ]
  );
});

test('the routes check the body, then ask the account', async () => {
  const calls = [];
  const account = {
    exportStart: async (body) => {
      calls.push(body);
      return { ok: true, job: { state: 'running' } };
    },
    exportStatus: async () => ({ ok: true, job: null }),
    exportCancel: async () => ({ ok: true, job: null }),
    exportDefaults: async () => ({ ok: true, folder: '/x', job: null }),
    exportReveal: async () => ({ ok: true }),
  };
  const good = requestFor('/tmp');
  assert.equal(await postRoute('export-start', good, account), 200);
  assert.equal(calls.length, 1);
  assert.equal(
    await postRoute('export-start', { ...good, folder: undefined }, account),
    400
  );
  assert.equal(
    await postRoute('export-start', { ...good, chat: 'x' }, account),
    400
  );
  assert.equal(
    await postRoute('export-start', { ...good, formats: [] }, account),
    400
  );
  assert.equal(calls.length, 1);
  for (const route of [
    'export-status',
    'export-cancel',
    'export-defaults',
    'export-reveal',
  ]) {
    assert.equal(await postRoute(route, {}, account), 200, route);
    assert.equal(await postRoute(route, {}, {}), 400, route);
  }
});
