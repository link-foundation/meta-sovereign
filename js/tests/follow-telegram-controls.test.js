import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FollowTelegramControls } from '../src/web/follow-telegram-controls.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { followTelegramFixture } from './helpers/follow-telegram.mjs';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { followTelegramApi } from '../src/web/follow-telegram-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
  decodeWire,
} from '../src/transport/lino.js';

const cli = (f, createAccount = () => f.account) =>
  createAutomationCommands({ openStore: async () => f.store, createAccount });

test('CLI defaults to read-only previews and Lino output, and owns account shutdown', async () => {
  const f = followTelegramFixture();
  let stopped = 0;
  const commands = cli(f, () => ({
    ...f.account,
    stop: async () => {
      stopped++;
    },
  }));
  const lines = [];
  await commands.automations(
    { _: ['follow', 'telegram', 'join'], target: 'study_group', mute: 'true' },
    (v) => lines.push(v)
  );
  const preview = decodeWire(lines[0], LINO_TEXT);
  assert.equal(preview.ok, true);
  assert.equal(preview.options.mute, true);
  assert.equal(f.writes.length, 0);
  assert.equal(stopped, 1);
  assert.ok(!lines[0].trim().startsWith('{'));
  lines.length = 0;
  await commands.automations(
    {
      _: ['follow', 'telegram', 'preferences'],
      target: '-1007',
      archive: 'true',
      confirm: true,
      json: true,
    },
    (v) => lines.push(v)
  );
  assert.equal(JSON.parse(lines[0]).results[0].status, 'confirmed');
  assert.equal(f.writes[0].className, 'folders.EditPeerFolders');
  assert.equal(stopped, 2);
});

test('CLI rejects malformed flags before account startup and preserves cancellation receipts', async () => {
  const f = followTelegramFixture();
  let factories = 0;
  const commands = cli(f, () => {
    factories++;
    return f.account;
  });
  await commands.automations(
    { _: ['follow', 'telegram', 'join'], target: 'study_group', mute: 'maybe' },
    () => {}
  );
  assert.equal(factories, 0);
  f.state.member = false;
  f.state.reply = () => {
    process.emit('SIGINT');
    return undefined;
  };
  const lines = [];
  await commands.automations(
    {
      _: ['follow', 'telegram', 'join'],
      target: 'study_group',
      mute: true,
      confirm: true,
      json: true,
    },
    (v) => lines.push(v)
  );
  assert.equal(JSON.parse(lines[0]).code, 'cancelled');
  assert.equal(JSON.parse(lines[0]).results[0].status, 'unknown');
  assert.equal(f.writes.length, 1);
});

test(
  'text and binary Lino routes share exact plans, independent phases and scoped cancellation',
  { timeout: 15000 },
  async () => {
    const f = followTelegramFixture();
    const server = await startServer({
      store: f.store,
      telegramAccount: f.account,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const root = `http://127.0.0.1:${server.port}/api/automations/follow/telegram`;
        const request = async (action, input = {}) => {
          const response = await fetch(
            `${root}${action ? `/${action}` : '?limit=2'}`,
            action
              ? {
                  method: 'POST',
                  headers: { accept: type, 'content-type': type },
                  body: encodeWire(input, type),
                }
              : { headers: { accept: type } }
          );
          assert.equal(response.status, 200);
          assert.match(response.headers.get('content-type'), /lino/);
          return readWireResponse(response);
        };
        assert.equal((await request('')).chats[0].chat, '-1007');
        const old = await request('preview', {
          target: 'study_group',
          operation: 'preferences',
          mute: true,
          archive: false,
        });
        const current = await request('preview', {
          target: '-1007',
          operation: 'preferences',
          mute: true,
          archive: false,
        });
        assert.equal(
          (await request('cancel', { planId: old.planId })).ok,
          true
        );
        assert.equal(
          (await request('apply', { planId: old.planId, confirm: true })).code,
          'plan-expired'
        );
        const applied = await request('apply', {
          planId: current.planId,
          confirm: true,
        });
        assert.equal(applied.ok, true);
        assert.deepEqual(
          applied.results.map((row) => row.phase),
          ['mute', 'archive']
        );
        assert.equal(
          (await request('apply', { planId: current.planId, confirm: true }))
            .code,
          'plan-expired'
        );
      }
      assert.equal(
        f.writes.length,
        1,
        'fresh remote state avoids redundant writes'
      );
    } finally {
      await server.close();
    }
  }
);

test('client transport retains partial receipts and refuses missing, malformed or contradictory server results', async () => {
  const f = followTelegramFixture();
  const list = await f.actions.followTelegramList();
  let value = list;
  const api = followTelegramApi({
    remote: { request: async () => ({ json: async () => value }) },
  });
  assert.equal((await api.followTelegramList()).chats.length, 1);
  for (const invalid of [
    null,
    {},
    { ...list, page: { ...list.page, complete: false } },
    { ...list, chats: [null] },
  ]) {
    value = invalid;
    await assert.rejects(api.followTelegramList());
  }
  value = {
    ok: false,
    planId: 'plan',
    chat: '-1007',
    results: [
      { phase: 'membership', status: 'confirmed' },
      { phase: 'mute', status: 'unknown', code: 'outcome-unknown' },
    ],
  };
  assert.deepEqual(await api.followTelegramApply({ planId: 'plan' }), value);
  for (const invalid of [
    null,
    { ok: true },
    { ...value, ok: true },
    { ...value, planId: 'different' },
    { ...value, results: [] },
  ]) {
    value = invalid;
    assert.equal(
      (await api.followTelegramApply({ planId: 'plan' })).code,
      'outcome-unknown'
    );
  }
  const absent = followTelegramApi({ remote: { request: async () => null } });
  await assert.rejects(absent.followTelegramPreview({}), {
    code: 'follow-server-required',
  });
  assert.equal(
    (await absent.followTelegramApply({ planId: 'plan' })).code,
    'outcome-unknown'
  );
});

test('all four locales render shared reviewed membership and independent preference controls', () => {
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    const t = (key, values) => translate(locale, key, values);
    const html = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { t } },
        React.createElement(FollowTelegramControls, { api: {} })
      )
    );
    for (const key of [
      'title',
      'hint',
      'target',
      'preview',
      'muteOn',
      'archiveOff',
      'leave',
    ]) {
      assert.ok(html.includes(t(`followTelegram.${key}`)), `${locale}:${key}`);
    }
    assert.ok(!html.includes('followTelegram.'));
  }
});

test(
  'uncertain intent remains protected after a real Lino file is closed and reopened',
  { timeout: 10000 },
  async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { createLinoTextStore } =
      await import('../src/storage/lino-store.js');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-follow-intent-'));
    const stores = [];
    try {
      const open = async () => {
        const store = await createLinoTextStore(path.join(dir, 'data.lino'));
        stores.push(store);
        const f = followTelegramFixture({ store });
        f.state.member = false;
        return f;
      };
      const first = await open();
      first.state.reply = () => undefined;
      const plan = await first.actions.followTelegramPreview({
        target: 'study_group',
      });
      assert.equal(
        (
          await first.actions.followTelegramApply({
            planId: plan.planId,
            confirm: true,
          })
        ).results[0].status,
        'unknown'
      );
      await stores[0].close();
      const second = await open();
      const next = await second.actions.followTelegramPreview({
        target: 'study_group',
      });
      assert.equal(next.phases[0].status, 'unknown');
      assert.equal(
        (
          await second.actions.followTelegramApply({
            planId: next.planId,
            confirm: true,
          })
        ).ok,
        false
      );
      assert.equal(second.writes.length, 0);
    } finally {
      for (const store of stores) {
        await store.close();
      }
      await rm(dir, { recursive: true, force: true });
    }
  }
);
