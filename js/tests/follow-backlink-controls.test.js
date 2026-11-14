import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  followBacklinksFixture,
  backlinkInput,
} from './helpers/follow-backlinks.mjs';
import { followBacklinkCommands } from '../src/cli/follow-backlink-commands.js';
import { followBacklinkApi } from '../src/web/follow-backlink-api.js';
import { FollowBacklinkControls } from '../src/web/follow-backlink-controls.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const args = (extra = {}) => ({
  _: ['follow', 'backlinks', 'post'],
  chats: '2000000007',
  backlink: backlinkInput().backlink,
  'monitor-ms': '2000',
  'interval-ms': '1000',
  ...extra,
});
test('CLI previews without writes in default Lino; explicit JSON confirmation returns a completed receipt', async () => {
  const f = await followBacklinksFixture();
  const lines = [];
  const run = (input) =>
    followBacklinkCommands({
      args: input,
      store: f.store,
      followBacklinks: f.service,
      log: (line) => lines.push(line),
    });
  assert.equal(await run(args()), 0);
  assert.equal(decodeWire(lines[0], LINO_TEXT).rows[0].status, 'ready');
  assert.equal(f.calls.filter((c) => c.method === 'messages.send').length, 0);
  const g = await followBacklinksFixture();
  assert.equal(
    await followBacklinkCommands({
      args: args({ confirm: true, json: true }),
      store: g.store,
      followBacklinks: g.service,
      log: (line) => lines.push(line),
    }),
    0
  );
  assert.equal(JSON.parse(lines[1]).status, 'confirmed');
  assert.equal(g.calls.filter((c) => c.method === 'messages.send').length, 1);
  assert.equal(g.calls.filter((c) => c.method === 'messages.delete').length, 0);
});
test(
  'real text and binary Lino HTTP routes preserve frozen reviews, scoped cancellation and saved receipts',
  { timeout: 15000 },
  async () => {
    const f = await followBacklinksFixture();
    const server = await startServer({
      store: f.store,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      follow: { backlinks: f.options },
    });
    try {
      const root = `http://127.0.0.1:${server.port}/api/automations/follow/backlinks`;
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const request = async (suffix, body) => {
          const response = await fetch(`${root}${suffix}`, {
            headers: {
              accept: type,
              ...(body ? { 'content-type': type } : {}),
            },
            ...(body ? { method: 'POST', body: encodeWire(body, type) } : {}),
          });
          assert.match(response.headers.get('content-type'), /lino/);
          return readWireResponse(response);
        };
        const old = await request('/preview', backlinkInput());
        const plan = await request(
          '/preview',
          backlinkInput({ deleteIncoming: false })
        );
        assert.equal(
          (await request('/cancel', { planId: old.planId })).ok,
          true
        );
        assert.equal(
          (await request('/apply', { planId: old.planId, confirm: true })).code,
          'plan-expired'
        );
        assert.equal(
          (await request('/apply', { planId: plan.planId })).code,
          'confirmation-required'
        );
        const job = await request('/apply', {
          planId: plan.planId,
          confirm: true,
        });
        // The server owns a separate controller over the same fixture store.
        let result;
        for (let n = 0; n < 100; n++) {
          result = await request(`/status?jobId=${job.id}`);
          if (!['queued', 'running'].includes(result.status)) {
            break;
          }
        }
        assert.equal(result.status, 'confirmed');
        const api = followBacklinkApi({ remote: { get: async () => result } });
        assert.equal(
          (await api.followBacklinkStatus({ jobId: job.id })).status,
          'confirmed'
        );
        assert.equal((await request('?limit=1')).jobs.length, 1);
        assert.equal((await request('?limit=no')).code, 'bad-request');
        assert.equal((await request('/cancel', { jobId: job.id })).ok, false);
      }
      assert.equal(
        f.calls.filter((c) => c.method === 'messages.send').length,
        1,
        'saved positive receipt prevents duplicate sends'
      );
    } finally {
      await server.close();
      await f.service.stop();
    }
  }
);
test('remote API refuses contradictory delivery and cleanup receipts rather than manufacturing success', async () => {
  const f = await followBacklinksFixture();
  const original = await f.post();
  const variants = [
    (v) => {
      v.rows[0].status = 'unknown';
    },
    (v) => {
      v.rows[0].cleanup.status = 'unknown';
    },
    (v) => {
      v.rows[0].cleanup.confirmed = [];
    },
    (v) => {
      v.rows[0].messageId = '';
    },
    (v) => {
      v.rows[0].checkedAt = v.rows[0].sentAt;
    },
    (v) => {
      v.rows[0].chat = '2000000008';
    },
  ];
  for (const change of variants) {
    const value = globalThis.structuredClone(original);
    change(value);
    const api = followBacklinkApi({
      remote: { get: async () => value, post: async () => value },
    });
    await assert.rejects(api.followBacklinkStatus({ jobId: original.id }), {
      code: 'read-failed',
    });
    await assert.rejects(
      api.followBacklinkApply({ planId: 'review', confirm: true }),
      { code: 'outcome-unknown' }
    );
  }
  await f.service.stop();
});
test('common controls expose all timing, cleanup and retry settings in every supported locale', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const html = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        {
          value: { locale, t: (key, params) => translate(locale, key, params) },
        },
        React.createElement(FollowBacklinkControls, { api: {} })
      )
    );
    assert.match(html, /data-follow-backlinks/);
    for (const key of [
      'source',
      'chats',
      'backlink',
      'monitorMs',
      'intervalMs',
      'delayMs',
      'deleteIncoming',
      'historyLimit',
      'attempts',
      'retryDelayMs',
      'retryMaxDelayMs',
    ]) {
      assert.ok(html.includes(`data-follow-backlink-field="${key}"`));
    }
    assert.ok(!html.includes('followBacklink.'));
    assert.ok(!html.includes('data-follow-backlink-action="apply"'));
  }
});
