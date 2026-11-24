import test from 'node:test';
import assert from 'node:assert/strict';
import {
  followBacklinksFixture,
  backlinkInput,
} from './helpers/follow-backlinks.mjs';
import { createFollowBacklinks } from '../src/follow/backlinks.js';
import { backlinkConfig } from '../src/follow/backlink-shape.js';
import { isTombstone as isDeleted } from '../src/storage/soft-delete.js';

const writes = (f, method = 'messages.send') =>
  f.calls.filter((c) => c.method === method);
const timeout = () =>
  Object.assign(new Error('private diagnostic'), { name: 'TimeoutError' });

test('a read-only review freezes exact account, chats, backlink and cleanup settings', async () => {
  const f = await followBacklinksFixture();
  const input = backlinkInput();
  const plan = await f.service.preview(input);
  assert.equal(plan.owner, '7');
  assert.equal(plan.rows[0].chat, '2000000007');
  assert.equal(writes(f).length, 0);
  assert.equal((await f.service.list()).total, 0);
  input.chats[0] = '2000000008';
  plan.config.backlink = 'https://t.me/different_group';
  await assert.rejects(f.service.apply({ planId: plan.planId }), {
    code: 'confirmation-required',
  });
  const queued = await f.service.apply({ planId: plan.planId, confirm: true });
  await f.service.idle();
  assert.equal(queued.config.backlink, 'https://t.me/study_group');
  assert.equal(writes(f)[0].params.peer_id, '2000000007');
  assert.equal(
    (await f.service.status({ jobId: queued.id })).status,
    'confirmed'
  );
  await assert.rejects(
    f.service.apply({ planId: plan.planId, confirm: true }),
    { code: 'plan-expired' }
  );
  await f.service.stop();
});

test('delivery and full-window positive observations precede only acknowledged incoming cleanup', async () => {
  const f = await followBacklinksFixture();
  const job = await f.post();
  assert.equal(job.status, 'confirmed');
  assert.equal(job.rows[0].status, 'survived');
  assert.equal(job.rows[0].checks, 2);
  assert.equal(job.rows[0].checkedAt - job.rows[0].sentAt, 2000);
  const deletion = writes(f, 'messages.delete')[0];
  assert.equal(deletion.params.message_ids, '1,4');
  assert.equal(deletion.params.delete_for_all, '0');
  assert.equal(deletion.params.peer_id, '2000000007');
  assert.deepEqual(job.rows[0].cleanup.confirmed, ['1', '4']);
  assert.ok(isDeleted(await f.store.get('msg:vk:1')));
  assert.ok(!isDeleted(await f.store.get('msg:vk:2')));
  assert.ok(!isDeleted(await f.store.get('msg:vk:3')));
  assert.ok(
    f.calls.findIndex((c) => c === deletion) >
      f.calls.findLastIndex((c) => c.method === 'messages.getById')
  );
  await f.service.stop();
});

test('removed posts retain rejected chat receipts and skip notices without deletion or false survival', async () => {
  for (const skipNotice of [false, true]) {
    const f = await followBacklinksFixture();
    f.state.removed = true;
    f.state.skipNotice = skipNotice;
    const job = await f.post();
    assert.equal(job.status, 'rejected');
    assert.equal(job.rows[0].status, 'rejected');
    assert.equal(job.rows[0].skipRetry, skipNotice);
    assert.equal(writes(f, 'messages.delete').length, 0);
    assert.equal(job.rows[0].cleanup, undefined);
    await f.service.stop();
  }
});

test('an ambiguous send is never repeated through a new reviewed plan or reopened controller', async () => {
  const f = await followBacklinksFixture();
  f.state.response = (call) => {
    if (call.method === 'messages.send') {
      throw new Error('network connection lost after delivery');
    }
  };
  const first = await f.post();
  assert.equal(first.status, 'unknown');
  assert.equal(first.rows[0].status, 'unknown');
  assert.equal(writes(f).length, 1);
  const second = createFollowBacklinks(f.options);
  const plan = await second.preview(backlinkInput());
  const queued = await second.apply({ planId: plan.planId, confirm: true });
  await second.idle();
  assert.equal((await second.status({ jobId: queued.id })).status, 'unknown');
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f, 'messages.delete').length, 0);
  await second.stop();
  await f.service.stop();
});

test(
  'an uncertain send remains protected after its real Lino store is closed and reopened',
  { timeout: 10000 },
  async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { createLinoTextStore } =
      await import('../src/storage/lino-store.js');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-backlink-reopen-'));
    const stores = [];
    const fixtures = [];
    try {
      const open = async () => {
        const store = await createLinoTextStore(path.join(dir, 'data.lino'));
        stores.push(store);
        const f = await followBacklinksFixture({ store });
        fixtures.push(f);
        return f;
      };
      const first = await open();
      first.state.response = (call) => {
        if (call.method === 'messages.send') {
          throw new Error('fixture unanswered write');
        }
      };
      assert.equal((await first.post()).status, 'unknown');
      await first.service.stop();
      await stores[0].close();
      const next = await open();
      assert.equal((await next.post()).status, 'unknown');
      assert.equal(writes(next).length, 0);
      assert.equal(writes(next, 'messages.delete').length, 0);
    } finally {
      for (const f of fixtures) {
        await f.service.stop();
      }
      for (const store of stores) {
        await store.close();
      }
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('a read timeout pauses after finite attempts and resumes monitoring without another send', async () => {
  const f = await followBacklinksFixture();
  let failures = 0;
  f.state.before = (call) => {
    if (call.method === 'messages.getById' && failures++ < 3) {
      throw timeout();
    }
  };
  const first = await f.post();
  assert.equal(first.status, 'paused');
  assert.equal(first.rows[0].status, 'monitoring');
  assert.equal(first.rows[0].code, 'timeout');
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f, 'messages.delete').length, 0);
  assert.deepEqual(f.sleeps.slice(0, 3), [1000, 10, 20]);
  const resumed = await f.service.resume({ jobId: first.id, confirm: true });
  assert.equal(
    resumed.status,
    'queued',
    'resume receipt must restart browser polling'
  );
  await f.service.idle();
  assert.equal(
    (await f.service.status({ jobId: first.id })).status,
    'confirmed'
  );
  assert.equal(writes(f).length, 1);
  await f.service.stop();
});

test('unusable or wrong-chat inspections pause without marking survival or deleting history', async () => {
  for (const response of [
    {},
    { items: null },
    { items: [{ id: 100, peer_id: 2000000008 }] },
  ]) {
    const f = await followBacklinksFixture();
    f.state.response = (call) =>
      call.method === 'messages.getById' ? response : undefined;
    const job = await f.post();
    assert.equal(job.status, 'paused');
    assert.equal(job.rows[0].status, 'monitoring');
    assert.equal(job.rows[0].code, 'provider-response');
    assert.equal(writes(f, 'messages.delete').length, 0);
    await f.service.stop();
  }
});

test('partial deletion acknowledges only actual IDs and is not replayed in another controller', async () => {
  const f = await followBacklinksFixture();
  f.state.response = (call) =>
    call.method === 'messages.delete' ? { 1: 1, 4: 0 } : undefined;
  const job = await f.post();
  assert.equal(job.status, 'unknown');
  assert.deepEqual(job.rows[0].cleanup.confirmed, ['1']);
  assert.ok(isDeleted(await f.store.get('msg:vk:1')));
  assert.ok(!isDeleted(await f.store.get('msg:vk:4')));
  const reopened = createFollowBacklinks(f.options);
  const plan = await reopened.preview(backlinkInput());
  const queued = await reopened.apply({ planId: plan.planId, confirm: true });
  await reopened.idle();
  assert.equal((await reopened.status({ jobId: queued.id })).status, 'unknown');
  assert.equal(writes(f, 'messages.delete').length, 1);
  assert.equal(writes(f).length, 1);
  await reopened.stop();
  await f.service.stop();
});

test('cleanup is opt-in and the backlink must remain present immediately before deletion', async () => {
  const f = await followBacklinksFixture();
  const first = await f.post({ deleteIncoming: false });
  assert.equal(first.status, 'confirmed');
  assert.equal(writes(f, 'messages.delete').length, 0);
  const g = await followBacklinksFixture();
  let inspections = 0;
  g.state.before = (call) => {
    if (call.method === 'messages.getById' && ++inspections === 3) {
      g.state.removed = true;
    }
  };
  const changed = await g.post();
  assert.equal(changed.status, 'paused');
  assert.equal(writes(g, 'messages.delete').length, 0);
  await f.service.stop();
  await g.service.stop();
});

test('account changes between review and apply stop writes and preserve prior receipts', async () => {
  const f = await followBacklinksFixture();
  const plan = await f.service.preview(backlinkInput());
  f.state.owner = 8;
  const queued = await f.service.apply({ planId: plan.planId, confirm: true });
  await f.service.idle();
  const job = await f.service.status({ jobId: queued.id });
  assert.equal(job.status, 'paused');
  assert.equal(job.rows[0].code, 'account-changed');
  assert.equal(writes(f).length, 0);
  await f.service.stop();
});

test('removal during the history read stops cleanup at its final confirmation boundary', async () => {
  const f = await followBacklinksFixture();
  f.state.before = (call) => {
    if (call.method === 'messages.getHistory') {
      f.state.removed = true;
    }
  };
  assert.equal((await f.post()).status, 'paused');
  assert.equal(writes(f, 'messages.delete').length, 0);
  await f.service.stop();
});

test('shutdown drains a worker created while initial job persistence is still pending', async () => {
  const f = await followBacklinksFixture();
  const put = f.store.put.bind(f.store);
  let entered, release, saved, finish;
  const initial = new Promise((resolve) => {
    entered = resolve;
  });
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const worker = new Promise((resolve) => {
    saved = resolve;
  });
  const final = new Promise((resolve) => {
    finish = resolve;
  });
  let writes = 0;
  f.store.put = async (value) => {
    if (value.kind === 'follow-backlink-job') {
      if (++writes === 1) {
        entered();
        await barrier;
      } else if (writes === 2) {
        saved();
        await final;
      }
    }
    return put(value);
  };
  const plan = await f.service.preview(backlinkInput());
  const applying = f.service.apply({ planId: plan.planId, confirm: true });
  await initial;
  let closed = false;
  const closing = f.service.stop().then(() => {
    closed = true;
  });
  release();
  await applying;
  await worker;
  await Promise.resolve();
  assert.equal(closed, false);
  finish();
  await closing;
  assert.equal(f.calls.filter((c) => c.method === 'messages.send').length, 0);
});

test('shutdown owns an issued send until its receipt; cancellation prevents cleanup and more writes', async () => {
  const f = await followBacklinksFixture();
  let release;
  let issued;
  const started = new Promise((resolve) => {
    issued = resolve;
  });
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  f.state.before = async (call) => {
    if (call.method === 'messages.send') {
      issued();
      await barrier;
    }
  };
  const plan = await f.service.preview(
    backlinkInput({ chats: ['2000000007', '2000000008'] })
  );
  const queued = await f.service.apply({ planId: plan.planId, confirm: true });
  await started;
  let closed = false;
  const closing = f.service.stop().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  release();
  await closing;
  const job = await f.store.get(queued.id);
  assert.equal(job.status, 'paused');
  assert.equal(job.rows[0].status, 'monitoring');
  assert.equal(job.rows[0].messageId, '100');
  assert.equal(job.rows[1].status, 'ready');
  assert.equal(writes(f).length, 1);
  assert.equal(writes(f, 'messages.delete').length, 0);
  await assert.rejects(f.service.preview(backlinkInput()), { code: 'stopped' });
});

test('durable intent flush precedes the provider write; failed persistence cannot send', async () => {
  const f = await followBacklinksFixture();
  let flushes = 0;
  f.store.flush = async () => {
    flushes += 1;
  };
  f.state.before = (call) => {
    if (call.method === 'messages.send') {
      assert.ok(flushes >= 3);
    }
  };
  await f.post({ deleteIncoming: false });
  const g = await followBacklinksFixture();
  const put = g.store.put;
  g.store.put = async (link) => {
    if (link.kind === 'follow-backlink-intent') {
      throw new Error('fixture storage failure');
    }
    return put(link);
  };
  const job = await g.post();
  assert.equal(job.status, 'paused');
  assert.equal(writes(g).length, 0);
  await f.service.stop();
  await g.service.stop();
});

test('configuration validates bounded work, exact VK group peers and supported invite links', () => {
  for (const extra of [
    { source: 'telegram' },
    { chats: [] },
    { chats: ['7'] },
    { chats: ['2000000000'] },
    { chats: ['3000000000'] },
    { chats: Array(101).fill('2000000007') },
    { monitorMs: 0 },
    { monitorMs: Infinity },
    { intervalMs: null },
    { historyLimit: 201 },
    { deleteIncoming: 'true' },
    { retry: { attempts: 11 } },
    { backlink: 'javascript:alert(1)' },
    { backlink: 'https://t.me/study_group/123' },
    { backlink: 'https://vk.me/join/abcdefghi?redirect=other' },
  ]) {
    assert.throws(() => backlinkConfig(backlinkInput(extra)));
  }
  assert.equal(
    backlinkConfig(
      backlinkInput({ backlink: 'https://vk.me/join/abcdefghijk' })
    ).targetSource,
    'vk'
  );
});
