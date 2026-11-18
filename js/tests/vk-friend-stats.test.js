import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Parser } from 'links-notation';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  readVkFriendStats,
  retainFriendAcceptance,
  friendStatPeriod,
} from '../src/automation/vk-friend-stats.js';
import { createVkFriendsCommands } from '../src/cli/vk-friends-commands.js';
import { createVkFriendsApi } from '../src/web/vk-friends-api.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { dictionaries } from '../src/web/locales/index.js';
import { friendsServer } from '../../experiments/issue-56/vk-friends-fixture.mjs';
import {
  acceptanceFixture,
  statsTime,
} from '../../experiments/issue-56/friend-stats-fixture.mjs';

test('acceptance statistics survive later relationship overwrite and never replace the initial count', async () => {
  const fixture = await acceptanceFixture();
  try {
    const answer = await fixture.run();
    assert.equal(answer.statistics.accounts[0].total, 2);
    await fixture.requestAgain();
    const summary = await fixture.summary();
    assert.equal(summary.total, 2);
    assert.deepEqual([summary.month, summary.week], [2, 2]);
    assert.equal(summary.initialFriendsCount, 1);
    assert.equal(
      (await fixture.store.get('provider-friend:vk:1:9')).outcome,
      'sent'
    );
    assert.equal(
      (
        await fixture.store.query((row) =>
          row.id.startsWith('provider-friend-acceptance:')
        )
      ).length,
      2
    );
    fixture.advance('2026-11-01T00:00:01Z');
    assert.deepEqual(
      [(await fixture.summary()).month, (await fixture.summary()).week],
      [0, 2]
    );
    fixture.advance('2026-11-02T00:00:00Z');
    assert.deepEqual(
      [(await fixture.summary()).total, (await fixture.summary()).week],
      [2, 0]
    );
  } finally {
    await fixture.close();
  }
});

test('scoped Lino projections update current periods while preserving historical files and private modes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-friend-stats-'));
  const fixture = await acceptanceFixture({ storeDir: directory });
  const root = join(directory, 'stats/vk-friends/1');
  const month = join(root, 'months/2026-10.lino');
  const week = join(root, 'weeks/2026-10-26.lino');
  try {
    await fixture.run();
    const old = await Promise.all(
      [month, week].map(async (path) => ({
        path,
        text: await readFile(path, 'utf8'),
        modified: (await stat(path)).mtimeMs,
      }))
    );
    await fixture.job.preview();
    fixture.advance('2026-11-02T00:00:01Z');
    fixture.adapter.relations.set(9, 2);
    await fixture.run();
    for (const entry of old) {
      assert.equal(await readFile(entry.path, 'utf8'), entry.text);
      assert.equal((await stat(entry.path)).mtimeMs, entry.modified);
    }
    for (const [name, count] of [
      ['total.lino', 3],
      ['months/2026-11.lino', 1],
      ['weeks/2026-11-02.lino', 1],
    ]) {
      const path = join(root, name);
      const text = await readFile(path, 'utf8');
      const tree = new Parser().parse(text);
      assert.equal(
        tree.find((link) => link.id === 'acceptedFriends').values[0].id,
        String(count)
      );
      assert.equal(text.includes('o:'), false);
      if (process.platform !== 'win32') {
        assert.equal((await stat(path)).mode & 0o777, 0o600);
      }
    }
    assert.equal((await fixture.summary()).initialFriendsCount, 1);
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a refused period projection preserves the accepted receipt and repairs on the next review without replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-friend-stats-refused-'));
  const fixture = await acceptanceFixture({ storeDir: directory });
  const weeks = join(directory, 'stats/vk-friends/1/weeks');
  try {
    const plan = (await fixture.job.preview()).plan;
    await rm(weeks, { recursive: true });
    await writeFile(weeks, 'Fixture obstructed directory');
    await assert.rejects(
      fixture.job.run({ planId: plan.planId, confirm: true })
    );
    assert.equal(fixture.adapter.effects.length, 1);
    assert.equal((await fixture.summary()).total, 1);
    await assert.rejects(
      fixture.job.run({ planId: plan.planId, confirm: true }),
      /current reviewed/
    );
    await rm(weeks);
    await fixture.job.preview();
    assert.match(
      await readFile(join(weeks, '2026-10-26.lino'), 'utf8'),
      /acceptedFriends: 1/
    );
    assert.equal(fixture.adapter.effects.length, 1);
  } finally {
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('unknown, refused and outgoing-sent results never become accepted statistics', async () => {
  for (const mode of ['unknown', 'refused', 'unconfirmed']) {
    const fixture = await acceptanceFixture();
    try {
      fixture.adapter.mode(mode);
      await fixture.run();
      assert.equal((await fixture.summary()).total, 0, mode);
    } finally {
      await fixture.close();
    }
  }
});

test('failed acceptance-history writes retain confirmed ledger evidence and cannot replay the consumed action', async () => {
  const fixture = await acceptanceFixture();
  const put = fixture.store.put.bind(fixture.store);
  let lastId;
  fixture.store.put = async (row) => {
    lastId = row.id;
    return put(row);
  };
  fixture.store.flush = async () => {
    if (lastId.startsWith('provider-friend-acceptance:')) {
      throw new Error('Fixture stats write refused');
    }
  };
  try {
    await assert.rejects(fixture.run(), /stats write refused/);
    assert.equal(fixture.adapter.effects.length, 1);
    assert.equal((await fixture.summary()).total, 1);
    const planId = (await fixture.store.get('provider-job-plan:vk:friends'))
      .planId;
    await assert.rejects(
      fixture.job.run({ planId, confirm: true }),
      /current reviewed/
    );
    fixture.store.flush = async () => {};
    const saved = await fixture.store.get('provider-job:vk:friends');
    await fixture.store.put({
      ...(saved ?? {
        enabled: false,
        everyMinutes: 20,
        maxFriends: 10000,
        batchSize: 23,
      }),
      id: 'provider-job:vk:friends',
      priorityIds: [9],
    });
    await fixture.job.preview(); // Positively settle person 9 while still a friend.
    fixture.adapter.relations.set(9, 0);
    fixture.store.flush = async () => {
      if (lastId.startsWith('provider-friend-acceptance:')) {
        throw new Error('Fixture stats write refused');
      }
    };
    await assert.rejects(fixture.run(), /stats write refused/);
    assert.equal(fixture.adapter.effects.length, 1);
    assert.equal(
      (await fixture.store.get('provider-friend:vk:1:9')).outcome,
      'accepted'
    );
    assert.equal((await fixture.summary()).total, 1);
  } finally {
    await fixture.close();
  }
});

test('canonical Lino restart retains idempotent receipts, legacy uncertainty and independent accounts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-friend-stats-restart-'));
  let store = await createLinoTextStore(join(directory, 'state.lino'));
  const fixture = await acceptanceFixture({ store });
  try {
    await fixture.run();
    const row = await store.get('provider-friend:vk:1:9');
    await retainFriendAcceptance(store, row);
    await store.put({
      ...row,
      id: 'provider-friend:vk:2:9',
      accountId: 2,
      planId: 'legacy-fixture',
      confirmedAt: null,
    });
    await fixture.close();
    await store.close();
    store = await createLinoTextStore(join(directory, 'state.lino'));
    const stats = await readVkFriendStats(store, statsTime);
    assert.deepEqual(
      stats.accounts.map((account) => [
        account.accountId,
        account.total,
        account.month,
        account.undated,
      ]),
      [
        [1, 2, 2, 0],
        [2, 1, 0, 1],
      ]
    );
    await retainFriendAcceptance(
      store,
      await store.get('provider-friend:vk:2:9')
    );
    assert.equal(
      (await readVkFriendStats(store, statsTime)).accounts[1].total,
      1
    );
    assert.deepEqual(friendStatPeriod(Date.parse('2027-01-01T00:00:00Z')), {
      month: '2027-01',
      week: '2026-12-28',
    });
  } finally {
    await fixture.close();
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI status, offline reads and both compact Lino API transports share acknowledged statistics', async () => {
  const fixture = await acceptanceFixture();
  let server;
  try {
    await fixture.run();
    const output = [];
    const command = createVkFriendsCommands({
      openReadOnly: async () => fixture.store,
    });
    assert.equal(
      await command['vk-friends']({ _: ['status'] }, (value) =>
        output.push(JSON.parse(value))
      ),
      0
    );
    assert.equal(output[0].statistics.accounts[0].total, 2);
    const local = createVkFriendsApi({
      get: async () => null,
      local: async () => fixture.store,
    });
    const offline = await local.vkFriendStats();
    assert.equal(offline.accounts[0].total, 2);
    assert.equal(offline.cached, true);
    server = await friendsServer();
    await server.store.putMany(await fixture.store.query());
    for (const accept of [LINO_TEXT, LINO_BINARY]) {
      const response = await fetch(`${server.base}/api/vk/friends/stats`, {
        headers: { accept },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type').split(';')[0], accept);
      const answer = await readWireResponse(response);
      assert.equal(answer.accounts[0].total, 2);
      assert.equal(Object.hasOwn(answer, 'plan'), false);
      assert.equal(
        (await fetch(`${server.base}/api/vk/friends/stats`, { method: 'POST' }))
          .status,
        405
      );
    }
    for (const language of ['en', 'ru', 'hi', 'zh']) {
      assert.ok(
        dictionaries[language]['vkFriendStats.summary'].includes('{count}')
      );
    }
    assert.equal(server.effects.length, 0);
  } finally {
    await server?.close();
    await fixture.close();
  }
});
