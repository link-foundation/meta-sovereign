import test from 'node:test';
import assert from 'node:assert/strict';
import {
  telegramBacklinksFixture,
  telegramBacklinkInput,
} from './helpers/telegram-backlinks.mjs';
import { followBacklinkCommands } from '../src/cli/follow-backlink-commands.js';
import { followBacklinkApi } from '../src/web/follow-backlink-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

test('CLI creates and drains the selected Telegram user account for a read-only Lino review', async () => {
  const f = await telegramBacklinksFixture();
  const lines = [];
  const created = [];
  let stops = 0;
  try {
    const code = await followBacklinkCommands({
      args: {
        _: ['follow', 'backlinks', 'post'],
        source: 'telegram',
        chats: '-7',
        backlink: 'https://vk.me/join/valid_invite',
      },
      store: f.store,
      log: (s) => lines.push(s),
      createAccount: (options) => {
        created.push(options);
        return {
          ...f.account,
          stop: async () => {
            stops++;
            await f.account.stop();
          },
        };
      },
    });
    assert.equal(code, 0);
    assert.equal(created.length, 1);
    assert.equal(stops, 1);
    assert.equal(created[0].store, f.store);
    assert.equal(created[0].pollMs, 0);
    assert.equal(created[0].backfillMs, 0);
    const result = decodeWire(lines[0], LINO_TEXT);
    assert.equal(result.config.source, 'telegram');
    assert.equal(result.config.targetSource, 'vk');
    assert.equal(result.rows[0].chat, '-7');
    assert.equal(f.writes.length, 0);
  } finally {
    await f.close();
  }
});
test(
  'production HTTP routes resolve the server Telegram account and preserve both Lino formats through confirmed cleanup',
  { timeout: 15000 },
  async () => {
    const f = await telegramBacklinksFixture();
    // Omit the provider/account override: the production route must use ctx.telegramAccount.
    const { telegramAccount: _account, ...timing } = f.options;
    const server = await startServer({
      store: f.store,
      telegramAccount: f.account,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      follow: { backlinks: timing },
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
        const plan = await request('/preview', telegramBacklinkInput());
        assert.equal(plan.ok, true);
        assert.equal(plan.config.source, 'telegram');
        const job = await request('/apply', {
          planId: plan.planId,
          confirm: true,
        });
        let result;
        for (let n = 0; n < 100; n++) {
          result = await request(`/status?jobId=${job.id}`);
          if (!['queued', 'running'].includes(result.status)) {
            break;
          }
        }
        assert.equal(result.status, 'confirmed');
        assert.deepEqual(result.rows[0].cleanup.confirmed, ['1', '4']);
        const api = followBacklinkApi({ remote: { get: async () => result } });
        assert.equal(
          (await api.followBacklinkStatus({ jobId: job.id })).config.source,
          'telegram'
        );
      }
      assert.equal(
        f.writes.filter((r) => r.className === 'messages.SendMessage').length,
        1
      );
    } finally {
      await server.close();
      await f.close();
    }
  }
);
test('the common remote adapter keeps bounded Telegram refusal codes and rejects mixed-provider reviews', async () => {
  const api = followBacklinkApi({
    remote: {
      post: async () => ({
        ok: false,
        code: 'flood-wait',
        providerError: 'FLOOD_WAIT_42',
      }),
    },
  });
  await assert.rejects(api.followBacklinkPreview(telegramBacklinkInput()), {
    code: 'flood-wait',
    providerError: 'FLOOD_WAIT_42',
  });
  const f = await telegramBacklinksFixture();
  try {
    const plan = await f.service.preview(telegramBacklinkInput());
    plan.rows[0].chat = '2000000007';
    const invalid = followBacklinkApi({ remote: { post: async () => plan } });
    await assert.rejects(
      invalid.followBacklinkPreview(telegramBacklinkInput()),
      { code: 'read-failed' }
    );
  } finally {
    await f.close();
  }
});
