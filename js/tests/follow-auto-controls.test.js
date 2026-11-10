import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { followAutoFixture } from './helpers/follow-auto.mjs';
import { followBacklinkCommands } from '../src/cli/follow-backlink-commands.js';
import { followBacklinkApi } from '../src/web/follow-backlink-api.js';
import { automaticReview } from '../src/web/follow-auto-controls.js';
import { translate } from '../src/web/i18n.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const cli = {
  _: ['follow', 'backlinks', 'post'],
  chats: '2000000007',
  backlink: 'https://t.me/study_group',
  'auto-follow': true,
  'max-retries': '2',
  'max-links': '5',
  'join-delay-ms': '0',
  'monitor-ms': '2000',
  'interval-ms': '1000',
};
test('CLI prints the frozen automatic review in default Lino and runs only with explicit confirmation', async () => {
  for (const confirm of [false, true]) {
    const f = await followAutoFixture();
    const lines = [];
    try {
      assert.equal(
        await followBacklinkCommands({
          args: { ...cli, confirm },
          store: f.vk.store,
          followBacklinks: f.service,
          log: (line) => lines.push(line),
        }),
        0
      );
      const result = decodeWire(lines[0], LINO_TEXT);
      assert.equal(result.config.autoFollow.maxRetries, 2);
      assert.equal(result.followingAccount.owner, '7');
      assert.equal(
        result.rows[0].following.links[0].status,
        confirm ? 'confirmed' : 'ready'
      );
      assert.equal(f.member.writes.length, confirm ? 3 : 0);
    } finally {
      await f.close();
    }
  }
});
test(
  'production text and binary Lino routes preserve automatic plans, account scopes and durable phase receipts',
  { timeout: 15000 },
  async () => {
    const f = await followAutoFixture();
    const server = await startServer({
      store: f.vk.store,
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
          return readWireResponse(response);
        };
        const plan = await request('/preview', f.input());
        const api = followBacklinkApi({ remote: { post: async () => plan } });
        assert.equal(
          (await api.followBacklinkPreview(f.input())).rows[0].following
            .links[0].review.owner,
          '7'
        );
        const queued = await request('/apply', {
          planId: plan.planId,
          confirm: true,
        });
        let result;
        for (let i = 0; i < 100; i++) {
          result = await request(`/status?jobId=${queued.id}`);
          if (!['queued', 'running'].includes(result.status)) {
            break;
          }
        }
        assert.equal(result.status, 'confirmed', JSON.stringify(result));
        assert.equal(
          result.rows[0].following.links[0].result.results.length,
          3
        );
        const client = followBacklinkApi({
          remote: { get: async () => result },
        });
        assert.equal(
          (await client.followBacklinkStatus({ jobId: queued.id })).status,
          'confirmed'
        );
      }
      assert.equal(
        f.vk.calls.filter((c) => c.method === 'messages.send').length,
        1
      );
      assert.equal(
        f.member.writes.filter((r) => r.className === 'channels.JoinChannel')
          .length,
        1
      );
    } finally {
      await server.close();
      await f.close();
    }
  }
);
test('remote automatic receipts reject missing account, contradictory membership and truncated confirmed preference receipts', async () => {
  const f = await followAutoFixture();
  try {
    const original = await f.post();
    const changes = [
      (value) => {
        delete value.followingAccount;
      },
      (value) => {
        value.followingAccount.owner = '8';
      },
      (value) => {
        value.rows[0].following.links[0] = null;
      },
      (value) => {
        value.rows[0].following.links[0].review.phases = [null];
      },
      (value) => {
        value.rows[0].following.links[0].result.results.pop();
      },
      (value) => {
        const link = value.rows[0].following.links[0];
        link.review.phases = link.review.phases.slice(0, 1);
        link.result.results = link.result.results.slice(0, 1);
      },
      (value) => {
        value.rows[0].following.links[0].result.results[0].status = 'unknown';
      },
      (value) => {
        value.rows[0].following.links[0].result = null;
      },
      (value) => {
        value.rows[0].following.links.push(value.rows[0].following.links[0]);
      },
      (value) => {
        value.rows[0].attempts = [null];
        value.rows[0].round = 1;
      },
    ];
    for (const change of changes) {
      const result = globalThis.structuredClone(original);
      change(result);
      const api = followBacklinkApi({
        remote: { get: async () => result, post: async () => result },
      });
      await assert.rejects(api.followBacklinkStatus({ jobId: original.id }), {
        code: 'read-failed',
      });
      await assert.rejects(
        api.followBacklinkApply({ planId: 'review', confirm: true }),
        { code: 'outcome-unknown' }
      );
    }
  } finally {
    await f.close();
  }
});
test('automatic reviews translate account, scan limits, preferences and phase outcomes in all supported locales', async () => {
  const f = await followAutoFixture();
  try {
    const plan = await f.service.preview(f.input());
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const html = renderToStaticMarkup(
        React.createElement(
          'article',
          {},
          automaticReview(plan, (key, params) => translate(locale, key, params))
        )
      );
      assert.match(html, /data-follow-auto-policy/);
      assert.match(html, /https:\/\/t.me\/study_first/);
      assert.ok(!html.includes('followBacklink.'), locale);
      assert.ok(!html.includes('followTelegram.'), locale);
    }
  } finally {
    await f.close();
  }
});
test('confirmed skipped phases never display an incomplete-following warning', async () => {
  const f = await followAutoFixture();
  try {
    await f.post();
    const result = await f.post();
    assert.equal(result.status, 'confirmed');
    assert.equal(
      result.rows[0].following.links[0].result.results[0].status,
      'skipped'
    );
    const html = renderToStaticMarkup(
      React.createElement(
        'article',
        {},
        automaticReview(result, (key, params) => translate('en', key, params))
      )
    );
    assert.ok(!html.includes('Following is not fully confirmed'), html);
  } finally {
    await f.close();
  }
});
test('saved automatic results expose the actual IDs of prior removed posts in each locale', async () => {
  const f = await followAutoFixture();
  try {
    f.vk.state.removed = true;
    const result = await f.post();
    assert.equal(result.rows[0].attempts.length, 2);
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const html = renderToStaticMarkup(
        React.createElement(
          'article',
          {},
          automaticReview(result, (key, params) =>
            translate(locale, key, params)
          )
        )
      );
      assert.match(html, /data-follow-auto-attempts/);
      assert.ok(html.includes('100') && html.includes('101'));
      assert.ok(!html.includes('followBacklink.'), locale);
    }
  } finally {
    await f.close();
  }
});
