import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { hhCommonFixture } from '../../experiments/issue-56/hh-common-fixture.mjs';
import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from '../src/server/index.js';
import { runCli } from '../src/cli/index.js';
import { openDualStore } from '../src/storage/index.js';
import { pullMessage, FETCHABLE } from '../src/web/connections/fetch-now.js';
import { translate, availableLocales } from '../src/web/i18n.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

test(
  'HH manual pull resumes across text/binary Lino API calls and exposes retained coverage',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put({
      id: 'secret:hh:access-token',
      token: 'fixture-token',
      tokens: ['secret'],
      children: [],
    });
    const fake = hhCommonFixture();
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      pulls: {
        hh: { ...fake, maxRequests: 2 },
        minGapMs: 0,
        intervals: { vk: 0, upwork: 0, peopleperhour: 0 },
      },
    });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(`${base}/api/pull`, {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire({ source: 'hh' }, type),
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type').includes(type), true);
        const answer = await readWireResponse(response);
        assert.equal(answer.ok, true);
        assert.equal(answer.history.scope, 'available-api-history');
        const status = await readWireResponse(
          await fetch(`${base}/api/pull/status`, { headers: { accept: type } })
        );
        assert.deepEqual(status.sources.hh.history, answer.history);
        assert.equal(JSON.stringify(answer).includes('fixture-token'), false);
      }
      assert.equal((await store.get('msg:hh:chat:41:2')).body, 'Vietnam.');
      assert.equal(
        fake.calls.some((c) => c.method !== 'GET'),
        false
      );
    } finally {
      await server.close();
    }
  }
);

test(
  'the real HH source-pull CLI persists its cursor, resumes and can restart',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ms-hh-common-cli-'));
    const fake = hhCommonFixture();
    const provider = createServer(async (req, res) => {
      const answer = await fake.fetchImpl(`http://127.0.0.1${req.url}`);
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(await answer.text());
    });
    await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
    const output = [];
    try {
      const base = [
        'source-pull',
        '--source=hh',
        '--token=fixture-token',
        `--base-url=http://127.0.0.1:${provider.address().port}`,
        '--limit=2',
        '--max-requests=2',
        `--store=${dir}`,
      ];
      assert.equal(
        await runCli(base, { log: (text) => output.push(JSON.parse(text)) }),
        0
      );
      assert.equal(output.at(-1).history.messagesRead, 2);
      assert.equal(
        await runCli(base, { log: (text) => output.push(JSON.parse(text)) }),
        0
      );
      assert.equal(output.at(-1).history.messagesRead, 3);
      assert.equal(
        await runCli([...base, '--restart-history'], {
          log: (text) => output.push(JSON.parse(text)),
        }),
        0
      );
      assert.equal(output.at(-1).history.messagesRead, 2);
      const store = await openDualStore(dir);
      try {
        assert.equal((await store.get('msg:hh:chat:41:2')).outgoing, true);
      } finally {
        await store.close();
      }
    } finally {
      await new Promise((resolve) => provider.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('shared fetch controls distinguish partial, available and capped HH history in every locale', () => {
  assert.equal(FETCHABLE.has('hh'), true);
  for (const locale of availableLocales) {
    for (const status of ['partial', 'complete', 'limited']) {
      const message = pullMessage(
        (key, args) => translate(locale.id, key, args),
        {
          ok: true,
          imported: 2,
          history: {
            scope: 'available-api-history',
            status,
            chatsRead: 1,
            messagesRead: 3,
          },
        }
      );
      assert.equal(message.tone, status === 'complete' ? 'ok' : 'wait');
      assert.equal(message.text.includes('pull.history.'), false);
      assert.equal(message.text.includes('{'), false);
    }
  }
});
