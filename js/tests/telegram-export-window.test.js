import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createHistoryExport,
  parseExport,
  MEDIA_KEYS,
} from '../src/sources/telegram-export.js';
import { createMarkdownWriter } from '../src/sources/telegram-export-markdown.js';
import { exportTarget } from '../src/sources/telegram-export-target.js';
import { createTelegramExportCommands } from '../src/cli/telegram-export-commands.js';
import { DEFAULT_FORM, formReady, requestOf } from '../src/web/chat-export.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { at, windowApi, windowClient } from './helpers/export-window-fakes.mjs';
import { helpers, photo } from './helpers/export-fakes.mjs';
import { postRoute } from './helpers/telegram-route.js';

const request = (folder, patch = {}) => ({
  chat: '-10099',
  folder,
  media: Object.fromEntries(MEDIA_KEYS.map((key) => [key, true])),
  formats: ['json', 'markdown'],
  scope: 'active',
  ...patch,
});
const fixture = async (t, histories, options = {}) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-export-window-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const provider = windowClient(histories, options);
  const events = [];
  const account = createHistoryExport(
    {
      importer: async () => ({ Api: windowApi, helpers }),
      connection: { withPeer: async (_client, chat, use) => use({ chat }) },
      store: createMemoryStore(),
      log: (event) => events.push(event),
    },
    { userClient: async () => provider.client, home: folder }
  );
  return { folder, account, events, ...provider };
};
const finished = async (account) => {
  for (let i = 0; i < 2000; i += 1) {
    const { job } = await account.exportStatus();
    if (!['running', 'cancelling'].includes(job?.state)) {
      return job;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2));
  }
  throw new Error('Fixture export did not finish');
};
const resultOf = async (folder) =>
  JSON.parse(await fs.readFile(path.join(folder, 'result.json'), 'utf8'));
const migration = (id = 1, chatId = 44n) =>
  at(id, 8, {
    className: 'MessageService',
    action: {
      className: 'MessageActionChannelMigrateFrom',
      chatId,
      title: 'Original team',
    },
  });

test('export accepts exact peer identities and refuses ambiguous/unsafe targets before reading', async () => {
  for (const [input, expected] of [
    ['7', '7'],
    [-44, '-44'],
    ['@export_team', '@export_team'],
    ['export_team', '@export_team'],
    ['https://t.me/export_team/123', '@export_team'],
    ['t.me/c/99/5', '-10099'],
  ]) {
    assert.equal(exportTarget(input), expected);
  }
  for (const invalid of [
    'Export team',
    'abc',
    '0',
    '007',
    'https://evil.test/export_team',
    't.me/+invite',
    2 ** 54,
  ]) {
    assert.equal(exportTarget(invalid), null);
  }
  const calls = [];
  for (const patch of [
    { scope: 'recent' },
    { gapHours: 0 },
    { gapHours: 169 },
    { gapHours: '4' },
    { maxLines: 31 },
    { maxLines: 1501 },
    { maxLines: 32.5 },
  ]) {
    const body = request('/tmp/fixture', patch);
    assert.equal(parseExport(body).ok, false);
    assert.equal(
      await postRoute('export-start', body, {
        exportStart: () => calls.push(body),
      }),
      400
    );
  }
  assert.equal(calls.length, 0);
  assert.equal(
    parseExport(request('/tmp/fixture', { gapHours: Infinity })).ok,
    false
  );
});

test(
  'active export detects an exact four-hour gap across pages and freezes the newest ID',
  { timeout: 10000 },
  async (t) => {
    const messages = [
      at(1, 0),
      at(2, 1),
      ...Array.from({ length: 102 }, (_, i) => at(i + 3, 5 + i / 60)),
    ];
    let appended = false;
    const f = await fixture(
      t,
      { '-10099': messages },
      {
        beforeHistory: (r) => {
          if (r.addOffset < 0 && !appended) {
            appended = true;
            messages.push(at(105, 8, { message: 'Arrived after discovery' }));
          }
        },
      }
    );
    assert.equal((await f.account.exportStart(request(f.folder))).ok, true);
    const job = await finished(f.account);
    assert.equal(job.state, 'done');
    assert.equal(job.messages, 102);
    assert.equal(job.total, null);
    const data = await resultOf(f.folder);
    assert.deepEqual(
      data.messages.map((m) => m.id),
      Array.from({ length: 102 }, (_, i) => i + 3)
    );
    assert(data.messages.every((m) => m.source_chat === '-10099'));
    assert(f.requests.some((r) => r.addOffset === 0 && r.offsetId === 5));
    assert(
      f.requests.every((r) => r.className !== 'GetHistory' || r.limit === 100)
    );
    assert(!JSON.stringify(f.events).includes('Arrived after discovery'));
  }
);

test(
  'active export crosses a migration without mixing overlapping message IDs',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t, {
      '-10099': [migration(), at(2, 9)],
      '-44': [at(1, 1), at(2, 7.9)],
    });
    await f.account.exportStart(
      request(f.folder, { chat: 'https://t.me/export_team' })
    );
    assert.equal((await finished(f.account)).state, 'done');
    const data = await resultOf(f.folder);
    assert.equal(data.name, 'Export team');
    assert.deepEqual(
      data.messages.map((m) => [m.source_chat, m.id]),
      [
        ['-44', 2],
        ['-10099', 1],
        ['-10099', 2],
      ]
    );
    assert.equal(data.messages[1].chat_id, '44');
    assert.equal(data.messages[1].action_details.chatId, '44');
  }
);

test(
  'all-history export includes the old basic group even if the migration marker was deleted',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(
      t,
      { '-10099': [at(2, 9)], '-44': [at(1, 1), at(2, 2)] },
      { migrated: { '-10099': 44n } }
    );
    await f.account.exportStart(request(f.folder, { scope: 'all' }));
    const job = await finished(f.account);
    assert.equal(job.state, 'done');
    assert.equal((await resultOf(f.folder)).messages.length, 3);
    assert.equal(job.total, null);
    assert.deepEqual(
      (await resultOf(f.folder)).messages.map((m) => [m.source_chat, m.id]),
      [
        ['-44', 1],
        ['-44', 2],
        ['-10099', 2],
      ]
    );
  }
);

test(
  'inaccessible migrated history fails honestly and leaves valid partial output',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t, { '-10099': [migration(), at(2, 9)] });
    await f.account.exportStart(request(f.folder, { scope: 'all' }));
    const job = await finished(f.account);
    assert.equal(job.state, 'failed');
    assert.equal(job.code, 'no-access');
    assert.equal((await resultOf(f.folder)).messages.length, 0);
    JSON.parse(
      await fs.readFile(path.join(f.folder, 'history-1.json'), 'utf8')
    );
  }
);

test(
  'HTML keeps migrated peer anchors and reply targets distinct',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t, {
      '-10099': [migration(), at(2, 9, { replyTo: { replyToMsgId: 1 } })],
      '-44': [at(1, 1), at(2, 2, { replyTo: { replyToMsgId: 1 } })],
    });
    await f.account.exportStart(
      request(f.folder, { scope: 'all', formats: ['html', 'json'] })
    );
    assert.equal((await finished(f.account)).state, 'done');
    const html = await fs.readFile(
      path.join(f.folder, 'messages.html'),
      'utf8'
    );
    for (const id of ['message-44:1', 'message-44:2', 'message1', 'message2']) {
      assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
    }
    assert(html.includes('href="#message-44:1"'));
    assert(html.includes('href="#message1"'));
  }
);

test(
  'cancellation during active discovery closes valid empty files and performs no downloads',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(
      t,
      {
        '-10099': Array.from({ length: 102 }, (_, i) =>
          at(i + 1, i / 60, { media: photo })
        ),
      },
      {
        beforeHistory: async (r) => {
          if (r.offsetId && r.addOffset === 0) {
            await account.exportCancel();
          }
        },
      }
    );
    const account = f.account;
    await account.exportStart(request(f.folder));
    const job = await finished(account);
    assert.equal(job.state, 'cancelled');
    assert.equal(job.messages, 0);
    assert.equal(job.files, 0);
    assert.equal((await resultOf(f.folder)).messages.length, 0);
  }
);

test(
  'Markdown and structured parts keep the 1500-line cap, original text and valid reciprocal links',
  { timeout: 10000 },
  async (t) => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-export-parts-'));
    t.after(() => fs.rm(folder, { recursive: true, force: true }));
    const writer = await createMarkdownWriter({
      folder,
      meta: { name: 'Review\nteam', id: 99 },
    });
    const large = {
      id: 7,
      source_chat: '-44',
      from: 'Alice',
      date: '2026-01-01T08:00:00',
      text: Array.from({ length: 1570 }, (_, i) => `line ${i}`).join('\n'),
      file: 'files/report (#1).pdf',
      file_name: 'report (#1).pdf',
    };
    await writer.add(large);
    await writer.add({
      ...large,
      id: 8,
      source_chat: '-10099',
      text: '<script> [link](https://evil.test)',
      file: '(File not included)',
    });
    await writer.close();
    await writer.close();
    const files = (await fs.readdir(folder)).sort();
    assert.deepEqual(files, [
      'history-1.json',
      'history-1.md',
      'history-2.json',
      'history-2.md',
    ]);
    const parts = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(folder, file), 'utf8');
      assert(content.split('\n').length <= 1500, `${file} line cap`);
      if (file.endsWith('.json')) {
        parts.push(JSON.parse(content));
      }
    }
    const records = parts
      .flatMap((p) => p.messages)
      .filter((m) => !m.continuation);
    assert.deepEqual(records[0], large);
    assert.deepEqual(
      records.map((m) => [m.source_chat, m.id]),
      [
        ['-44', 7],
        ['-10099', 8],
      ]
    );
    assert.equal(parts[0].metadata.nextPart, 'history-2.json');
    assert.equal(parts[1].metadata.previousPart, 'history-1.json');
    assert.equal(parts[1].messages[0].originalPart, 'history-1.json');
    const md = await fs.readFile(path.join(folder, 'history-2.md'), 'utf8');
    assert(md.includes('continued** · [Original](history-1.md)'));
    assert(md.includes('files/report%20%28%231%29.pdf'));
    assert(md.includes('(File not included)'));
    assert(!md.includes('<script>'));
  }
);

test(
  'active export downloads real media paths and respects the date filter within the active range',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t, {
      '-10099': [at(1, 23), at(2, 24), at(3, 25, { media: photo })],
    });
    await f.account.exportStart(
      request(f.folder, { from: '2026-01-02', to: '2026-01-02', maxLines: 32 })
    );
    assert.equal((await finished(f.account)).state, 'done');
    const data = await resultOf(f.folder);
    assert.deepEqual(
      data.messages.map((m) => m.id),
      [2, 3]
    );
    const relative = data.messages[1].photo;
    assert((await fs.stat(path.join(f.folder, relative))).size > 0);
    assert(
      decodeURIComponent(
        await fs.readFile(path.join(f.folder, 'history-1.md'), 'utf8')
      ).includes(relative)
    );
  }
);

test(
  'export diagnostics default off and expose boundary metadata without content when enabled',
  { timeout: 10000 },
  async (t) => {
    for (const debug of [false, true]) {
      const f = await fixture(t, {
        '-10099': [at(1, 1), at(2, 8, { message: 'Private export content' })],
      });
      await f.account.exportStart(request(f.folder, { debug }));
      assert.equal((await finished(f.account)).state, 'done');
      const diagnostics = f.events.filter((event) => event.level === 'debug');
      assert.equal(diagnostics.length, debug ? 1 : 0);
      if (debug) {
        assert.equal(diagnostics[0].event, 'telegram_export_boundary');
        assert.equal(diagnostics[0].minId, 2);
      }
      assert(!JSON.stringify(f.events).includes('Private export content'));
    }
  }
);

test('Chat/Operator export form maps the active and Markdown controls without weakening validation', () => {
  const form = {
    ...DEFAULT_FORM,
    folder: '/tmp/export',
    scope: 'active',
    format: 'markdown',
    gapHours: '4',
    maxLines: '1500',
  };
  assert.equal(formReady(form), true);
  const body = requestOf({ chat: '-10099', name: 'Export team' }, form);
  assert.equal(parseExport(body).ok, true);
  assert.deepEqual(body.formats, ['markdown']);
  assert.equal(body.scope, 'active');
  assert.equal(body.gapHours, 4);
  for (const patch of [
    { gapHours: '' },
    { maxLines: 1501 },
    { scope: 'typo' },
  ]) {
    assert.equal(formReady({ ...form, ...patch }), false);
  }
  assert.equal(DEFAULT_FORM.scope, 'all');
  assert.equal(DEFAULT_FORM.format, 'html');
});

test('Telegram export CLI keeps resources open through completion and validates before opening a store', async () => {
  const lifecycle = [];
  let captured;
  let poll = 0;
  const commands = createTelegramExportCommands({
    openStore: async () => {
      lifecycle.push('open');
      return { close: async () => lifecycle.push('close') };
    },
    createAccount: () => ({
      exportStart: async (value) => {
        captured = value;
        lifecycle.push('start');
        return { ok: true };
      },
      exportStatus: async () => ({
        ok: true,
        job: { state: ++poll < 2 ? 'running' : 'done' },
      }),
      stop: async () => lifecycle.push('stop'),
    }),
    sleep: async () => lifecycle.push('wait'),
  });
  const output = [];
  assert.equal(
    await commands['telegram-export'](
      { chat: '@export_team', folder: '/tmp/fixture' },
      (line) => output.push(line)
    ),
    0
  );
  assert.deepEqual(lifecycle, ['open', 'start', 'wait', 'stop', 'close']);
  assert.equal(captured.scope, 'active');
  assert.deepEqual(captured.formats, ['markdown']);
  assert.equal(JSON.parse(output[0]).job.state, 'done');
  lifecycle.length = 0;
  assert.equal(
    await commands['telegram-export'](
      { chat: '@export_team', folder: '/tmp/fixture', 'max-lines': '5000' },
      () => {}
    ),
    1
  );
  assert.deepEqual(lifecycle, []);
});
