import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { FollowControls } from '../src/web/follow-controls.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { followLinksFixture } from './helpers/follow-links.mjs';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { followApi } from '../src/web/follow-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

test(
  'Follow cache survives Lino store reopen and cleared references remain cleared',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-follow-cache-'));
    const opened = [];
    try {
      const file = path.join(dir, 'data.lino');
      const open = async () => {
        const store = await createLinoTextStore(file);
        opened.push(store);
        return followApi({
          store,
          remote: { get: async () => null, report: async () => null },
        });
      };
      const first = await open();
      const { messages } = await followLinksFixture();
      await opened[0].putMany(messages);
      await first.extractFollowLinks();
      await opened[0].flush();
      const second = await open();
      assert.equal((await second.followLinks()).total, 4);
      await second.clearFollowLinks();
      await opened[1].flush();
      const third = await open();
      assert.equal((await third.followLinks()).total, 0);
      assert.ok(await opened[2].get(messages[0].id));
    } finally {
      for (const store of opened) {
        await store.close();
      }
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('all four locales render the shared Follow scope, privacy and capability guidance', () => {
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    const words = (key, vars) => translate(locale, key, vars);
    const markup = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { t: words } },
        React.createElement(FollowControls, { api: {} })
      )
    );
    for (const key of [
      'title',
      'hint',
      'filterHint',
      'extract',
      'clear',
      'limit',
    ]) {
      assert.ok(markup.includes(words(`follow.${key}`)), `${locale}: ${key}`);
    }
    assert.ok(!markup.includes('follow.title'));
  }
});

test(
  'CLI, offline UI, text and binary Lino APIs share incoming provenance, limits and filtered cache clearing',
  { timeout: 15000 },
  async () => {
    const { store, messages } = await followLinksFixture();
    const commands = createAutomationCommands({ openStore: async () => store });
    const lines = [];
    await commands.automations(
      { _: ['follow', 'extract'], json: true, limit: 1 },
      (line) => lines.push(line)
    );
    assert.equal(JSON.parse(lines[0]).coverage.limited, true);
    const offline = followApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    assert.equal((await offline.followLinks()).total, 2);
    assert.equal((await offline.extractFollowLinks({ limit: 0 })).added, 2);
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const root = `http://127.0.0.1:${server.port}/api/automations/follow`;
        const read = await fetch(`${root}?source=telegram&limit=1`, {
          headers: { accept: type },
        });
        const page = await readWireResponse(read);
        assert.equal(page.links.length, 1);
        assert.equal(page.total, 2);
        assert.equal(page.links[0].messageId, messages[1].id);
        const send = async (action, input) => {
          const response = await fetch(`${root}/${action}`, {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(input, type),
          });
          assert.equal(response.status, 200);
          return readWireResponse(response);
        };
        assert.equal((await send('clear', { source: 'vk' })).cleared, 2);
        assert.equal(
          (await send('extract', { source: 'vk', limit: 0 })).added,
          2
        );
        assert.ok(await store.get(messages[0].id));
      }
    } finally {
      await server.close();
    }
    assert.equal((await offline.clearFollowLinks()).cleared, 4);
    assert.ok(await store.get('secret:follow-fixture'));
  }
);

test('reported server failures never switch to the browser cache', async () => {
  const { store } = await followLinksFixture();
  const api = followApi({
    store,
    remote: {
      get: async () => ({
        error: 'server cache unavailable',
        code: 'storage-error',
      }),
      report: async () => ({
        status: 'failed',
        error: 'server busy',
        code: 'follow-cache-busy',
      }),
    },
  });
  await assert.rejects(api.followLinks(), { code: 'storage-error' });
  await assert.rejects(api.extractFollowLinks(), { code: 'follow-cache-busy' });
  await assert.rejects(api.clearFollowLinks(), { code: 'follow-cache-busy' });
  assert.equal(
    (await store.query((record) => record.id.startsWith('follow-link:')))
      .length,
    0
  );
});

test('an empty or malformed server response never mutates the browser cache', async () => {
  const { store } = await followLinksFixture();
  for (const status of [200, 400]) {
    const api = followApi({
      store,
      remote: {
        request: async () => ({
          ok: status === 200,
          status,
          json: async () => {
            throw new Error('empty response');
          },
        }),
        get: async () => null,
        report: async () => null,
      },
    });
    await assert.rejects(api.extractFollowLinks(), {
      code: 'follow-cache-response',
    });
    await assert.rejects(api.followLinks(), { code: 'follow-cache-response' });
    await assert.rejects(api.clearFollowLinks(), {
      code: 'follow-cache-response',
    });
  }
  assert.equal(
    (await store.query((record) => record.id.startsWith('follow-link:')))
      .length,
    0
  );
});
