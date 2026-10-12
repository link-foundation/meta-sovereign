// Browser auto-import: archive readers, recipe-driven file import, the
// job manager (with a fake browser), the server routes and the
// Connections panel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createMemoryStore } from '../src/storage/index.js';
import { listSources } from '../src/sources/index.js';
import {
  autoImportRecipes,
  createAutoImportManager,
  probeBrowserAutomation,
  extractVisibleMessages,
  importDownloadedFile,
  parseCsv,
  readTarGzEntries,
  readZipEntries,
  scrapedRowsToLinks,
} from '../src/sources/auto-import/index.js';
import { startServer } from '../src/server/index.js';
import { isTrustedMutation } from '../src/server/routes-auto-import.js';
import { ProviderAutoImport } from '../src/web/connections/index.js';
import { providerCatalogue } from '../src/web/connection-guides.js';

// --- fixtures ---------------------------------------------------------

// Minimal ZIP writer (CRC left at 0: the reader does not verify it).
const makeZip = (files) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(content);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
};

const makeTarGz = (files) => {
  const blocks = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0);
    header.write(data.length.toString(8).padStart(11, '0'), 124);
    header.write('0', 156);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
};

const telegramExport = JSON.stringify({
  chats: {
    list: [
      {
        id: 7,
        name: 'Friends',
        messages: [
          {
            id: 1,
            type: 'message',
            from: 'Alice',
            text: 'hi',
            date: '2026-01-01T10:00:00',
          },
          {
            id: 2,
            type: 'message',
            from: 'Bob',
            text: 'hey',
            date: '2026-01-01T10:01:00',
          },
        ],
      },
    ],
  },
});

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-auto-import-'));

const writeTmp = async (name, content) => {
  const dir = await tmpDir();
  const file = path.join(dir, name);
  await fs.writeFile(file, content);
  return file;
};

// --- archive readers --------------------------------------------------

test('every source adapter has an auto-import recipe', () => {
  assert.deepEqual(Object.keys(autoImportRecipes).sort(), listSources().sort());
  for (const [id, recipe] of Object.entries(autoImportRecipes)) {
    assert.match(recipe.url, /^https:\/\//, `${id} url`);
    assert.ok(recipe.files instanceof RegExp, `${id} files`);
  }
});

test('readZipEntries lists and inflates files, skipping directories', () => {
  const zip = makeZip({ 'a/b.json': '{"x":1}', 'c.txt': 'hello' });
  const entries = readZipEntries(zip);
  assert.deepEqual(
    entries.map((e) => e.name),
    ['a/b.json', 'c.txt']
  );
  assert.equal(entries[0].read().toString(), '{"x":1}');
  assert.equal(entries[1].read().toString(), 'hello');
  assert.throws(() => readZipEntries(Buffer.from('not a zip')), /not a zip/);
});

test('readTarGzEntries reads ustar entries', () => {
  const entries = readTarGzEntries(
    makeTarGz({ 'repo/issues_000001.json': '[1]', 'b.txt': 'b' })
  );
  assert.deepEqual(
    entries.map((e) => [e.name, e.read().toString()]),
    [
      ['repo/issues_000001.json', '[1]'],
      ['b.txt', 'b'],
    ]
  );
});

test('parseCsv handles quotes, escaped quotes, newlines and BOM', () => {
  const rows = parseCsv(
    '\uFEFFFROM,CONTENT\r\nAlice,"Hi, ""you""\nthere"\nBob,ok\n'
  );
  assert.deepEqual(rows, [
    { FROM: 'Alice', CONTENT: 'Hi, "you"\nthere' },
    { FROM: 'Bob', CONTENT: 'ok' },
  ]);
});

// --- importDownloadedFile ---------------------------------------------

test('imports matching entries from a ZIP export and skips the rest', async () => {
  const store = createMemoryStore();
  const file = await writeTmp(
    'Telegram.zip',
    makeZip({ 'DataExport/result.json': telegramExport, 'photo.jpg': 'x' })
  );
  const reports = await importDownloadedFile({
    store,
    provider: 'telegram',
    filePath: file,
  });
  assert.deepEqual(reports, [
    { name: 'Telegram.zip:DataExport/result.json', imported: 2 },
  ]);
  const links = await store.query();
  assert.equal(links.length, 2);
  assert.ok(links.every((l) => l.handled?.by === 'source:telegram:live'));
});

test('adapts LinkedIn messages.csv and X window.YTD scripts', async () => {
  const store = createMemoryStore();
  const linkedin = await writeTmp(
    'Basic_LinkedInDataExport.zip',
    makeZip({
      'messages.csv':
        'CONVERSATION ID,FROM,DATE,CONTENT\nc1,Alice,2026-01-01 10:00:00 UTC,Hello\n',
    })
  );
  const [li] = await importDownloadedFile({
    store,
    provider: 'linkedin',
    filePath: linkedin,
  });
  assert.equal(li.imported, 1);
  const x = await writeTmp(
    'twitter.zip',
    makeZip({
      'data/direct-messages.js':
        'window.YTD.direct_messages.part0 = [{"dmConversation":{"conversationId":"1-2","messages":[{"messageCreate":{"id":"9","senderId":"1","text":"yo","createdAt":"2026-01-01T00:00:00.000Z"}}]}}]',
    })
  );
  const [dm] = await importDownloadedFile({
    store,
    provider: 'x',
    filePath: x,
  });
  assert.equal(dm.imported, 1);
  assert.equal((await store.get('msg:x:9')).body, 'yo');
});

test('reports a downloaded file without export data instead of throwing', async () => {
  const file = await writeTmp('invoice.pdf', '%PDF');
  const reports = await importDownloadedFile({
    store: createMemoryStore(),
    provider: 'telegram',
    filePath: file,
  });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].skipped, true);
  assert.equal(reports[0].imported, 0);
});

// --- page capture -----------------------------------------------------

const fakeNode = ({ attrs = {}, classes = [], children = {} }) => ({
  getAttribute: (name) => attrs[name] ?? null,
  classList: { contains: (cls) => classes.includes(cls) },
  closest: () => null,
  querySelector: (selector) => children[selector] ?? null,
});

test('extractVisibleMessages reads a WhatsApp-like DOM', () => {
  const cfg = autoImportRecipes.whatsapp.scrape;
  const text = (value) => ({ textContent: value });
  const messages = [
    fakeNode({
      attrs: { 'data-id': 'm1' },
      children: {
        [cfg.meta]: fakeNode({
          attrs: { [cfg.metaAttribute]: '[10:00, 1/2/2026] Alice: ' },
        }),
        [cfg.text]: text('Hello'),
      },
    }),
    fakeNode({
      attrs: { 'data-id': 'm2' },
      classes: ['message-out'],
      children: { [cfg.text]: text('Hi Alice') },
    }),
    fakeNode({ attrs: { 'data-id': 'm3' }, children: {} }),
  ];
  const previous = globalThis.document;
  globalThis.document = {
    title: 'WhatsApp',
    querySelector: (selector) => (selector === cfg.chat ? text('Alice') : null),
    querySelectorAll: () => messages,
  };
  try {
    const rows = extractVisibleMessages(cfg);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].sender, 'me');
    const links = scrapedRowsToLinks('whatsapp', rows);
    assert.equal(links[0].sender, 'Alice');
    assert.equal(links[0].chat, 'Alice');
    assert.equal(links[0].id, 'msg:whatsapp:web-Alice-m1');
    assert.equal(links[1].body, 'Hi Alice');
  } finally {
    globalThis.document = previous;
  }
});

// --- manager with a fake browser --------------------------------------

const fakeLauncher =
  (calls, rows = []) =>
  async (options) => {
    calls.push(options);
    const downloads = new EventEmitter();
    const closeListeners = [];
    const session = {
      downloads,
      commander: { evaluate: async () => rows },
      onClose: (listener) => closeListeners.push(listener),
      close: async () => {
        session.closed = true;
      },
      closeWindow: () => closeListeners.forEach((fn) => fn()),
    };
    calls.sessions = [...(calls.sessions ?? []), session];
    return session;
  };

const waitFor = async (predicate) => {
  for (let i = 0; i < 100; i += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition not met');
};

test('manager imports downloads, captures chats and closes the browser', async () => {
  const store = createMemoryStore();
  const dataDir = await tmpDir();
  const calls = [];
  const manager = createAutoImportManager({
    store,
    dataDir,
    launcher: fakeLauncher(calls, [
      { id: '5', chat: 'Bob', sender: 'Bob', body: 'from the page' },
    ]),
  });
  const job = manager.start('telegram');
  assert.equal(job.state, 'launching');
  assert.equal(manager.start('telegram').id, job.id, 'one job per provider');
  await waitFor(() => manager.get(job.id).state === 'waiting');

  assert.equal(calls[0].url, autoImportRecipes.telegram.url);
  assert.equal(
    calls[0].userDataDir,
    path.join(dataDir, 'auto-import', 'profiles', 'telegram')
  );
  const mode = (await fs.stat(calls[0].userDataDir)).mode & 0o777;
  if (process.platform !== 'win32') {
    assert.equal(mode, 0o700);
  }

  const file = await writeTmp('result.json', telegramExport);
  calls.sessions[0].downloads.emit('completed', { path: file });
  await waitFor(() => manager.get(job.id).imported === 2);

  const captured = await manager.capture(job.id);
  assert.equal(captured.imported, 3);
  assert.equal(
    (await store.get('msg:telegram:web-Bob-5')).body,
    'from the page'
  );

  const stopped = await manager.stop(job.id);
  assert.equal(stopped.state, 'done');
  assert.equal(calls.sessions[0].closed, true);
  await assert.rejects(() => manager.capture(job.id), /not open/);
});

test('manager marks the job done when the user closes the window', async () => {
  const calls = [];
  const manager = createAutoImportManager({
    store: createMemoryStore(),
    dataDir: await tmpDir(),
    launcher: fakeLauncher(calls),
  });
  const job = manager.start('email');
  await waitFor(() => manager.get(job.id).state === 'waiting');
  assert.equal(manager.get(job.id).canCapture, false);
  await assert.rejects(() => manager.capture(job.id), /no page capture/);
  calls.sessions[0].closeWindow();
  await waitFor(() => manager.get(job.id).state === 'done');
});

test('manager reports launch failures and unknown providers', async () => {
  const manager = createAutoImportManager({
    store: createMemoryStore(),
    dataDir: await tmpDir(),
    launcher: async () => {
      throw new Error('Chrome not found');
    },
  });
  const job = manager.start('vk');
  await waitFor(() => manager.get(job.id).state === 'failed');
  assert.equal(manager.get(job.id).error, 'Chrome not found');
  assert.throws(
    () => manager.start('myspace'),
    (err) => err.status === 400
  );
  assert.throws(
    () => manager.get('nope'),
    (err) => err.status === 404
  );
});

test('probeBrowserAutomation explains why browser import is unavailable', async () => {
  const ok = async () => ({ launchBrowser: () => {} });
  assert.equal((await probeBrowserAutomation(ok, '22.12.0')).available, true);
  const old = await probeBrowserAutomation(ok, '20.19.4');
  assert.equal(old.available, false);
  assert.match(old.reason, /Node\.js 22\.12/);
  const missing = await probeBrowserAutomation(async () => {
    throw new Error('Cannot find package');
  }, '24.0.0');
  assert.match(missing.reason, /not installed/);
});

// --- server routes ----------------------------------------------------

test('isTrustedMutation requires JSON and a trusted Origin', () => {
  const req = (headers) => ({
    headers: { host: '127.0.0.1:8787', ...headers },
  });
  const jsonType = { 'content-type': 'application/json' };
  assert.equal(isTrustedMutation(req(jsonType)), true);
  assert.equal(
    isTrustedMutation(req({ ...jsonType, origin: 'http://127.0.0.1:8787' })),
    true
  );
  assert.equal(
    isTrustedMutation(req({ ...jsonType, origin: 'https://evil.example' })),
    false
  );
  assert.equal(isTrustedMutation(req({ 'content-type': 'text/plain' })), false);
  assert.equal(
    isTrustedMutation(
      req({ ...jsonType, origin: 'https://link-foundation.github.io' }),
      ['https://link-foundation.github.io']
    ),
    true
  );
});

test('server exposes auto-import status, jobs and guards mutations', async () => {
  const calls = [];
  const handle = await startServer({
    port: 0,
    storeDir: await tmpDir(),
    enableSync: false,
    autoImportLauncher: fakeLauncher(calls, [
      { id: '1', chat: 'Ann', sender: 'Ann', body: 'hello' },
    ]),
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const post = (p, body, headers = {}) =>
    fetch(`${base}${p}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    const status = await (await fetch(`${base}/api/auto-import`)).json();
    assert.equal(status.available, true);
    assert.equal(status.providers.whatsapp.canCapture, true);
    assert.equal(status.providers.email.canCapture, false);

    const foreign = await post(
      '/api/auto-import',
      { provider: 'whatsapp' },
      { origin: 'https://evil.example' }
    );
    assert.equal(foreign.status, 403);
    const plain = await fetch(`${base}/api/auto-import`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"provider":"whatsapp"}',
    });
    assert.equal(plain.status, 403);
    assert.equal(calls.length, 0, 'no browser launched by rejected calls');

    const unknown = await post('/api/auto-import', { provider: 'myspace' });
    assert.equal(unknown.status, 400);

    const started = await post('/api/auto-import', { provider: 'whatsapp' });
    assert.equal(started.status, 202);
    const job = await started.json();
    await waitFor(async () => {
      const r = await fetch(`${base}/api/auto-import/jobs/${job.id}`);
      return (await r.json()).state === 'waiting';
    });
    const captured = await (
      await post(`/api/auto-import/jobs/${job.id}/capture`, {})
    ).json();
    assert.equal(captured.imported, 1);
    const links = await (await fetch(`${base}/links`)).json();
    assert.ok(links.some((l) => l.id === 'msg:whatsapp:web-Ann-1'));

    const done = await (
      await post(`/api/auto-import/jobs/${job.id}/stop`, {})
    ).json();
    assert.equal(done.state, 'done');
    const missing = await fetch(`${base}/api/auto-import/jobs/nope`);
    assert.equal(missing.status, 404);
  } finally {
    await handle.close();
  }
});

// --- Connections panel ------------------------------------------------

test('ProviderAutoImport renders start, running and unavailable states', () => {
  const provider = providerCatalogue.whatsapp;
  const status = {
    available: true,
    providers: {
      whatsapp: { url: 'https://web.whatsapp.com/', canCapture: true },
    },
    jobs: [],
  };
  const idle = renderToStaticMarkup(
    React.createElement(ProviderAutoImport, {
      providerId: 'whatsapp',
      provider,
      initialStatus: status,
    })
  );
  assert.match(idle, /data-action="auto-import-start"/);
  assert.match(idle, /Capture this chat/);

  const running = renderToStaticMarkup(
    React.createElement(ProviderAutoImport, {
      providerId: 'whatsapp',
      provider,
      initialStatus: status,
      initialJob: {
        id: 'j1',
        provider: 'whatsapp',
        state: 'waiting',
        imported: 4,
        files: [{ name: 'page: Ann', imported: 4 }],
      },
    })
  );
  assert.match(running, /data-action="auto-import-capture"/);
  assert.match(running, /data-action="auto-import-finish"/);
  assert.doesNotMatch(running, /data-action="auto-import-start"/);
  assert.match(running, /page: Ann: 4/);

  const unavailable = renderToStaticMarkup(
    React.createElement(ProviderAutoImport, {
      providerId: 'email',
      provider: providerCatalogue.email,
      initialStatus: { available: false, reason: 'no browser' },
    })
  );
  assert.match(unavailable, /Browser import is unavailable: no browser/);
  assert.match(unavailable, /disabled=""/);
});
