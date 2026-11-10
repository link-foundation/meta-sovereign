import test from 'node:test';
import assert from 'node:assert/strict';
import { followBacklinksFixture } from './helpers/follow-backlinks.mjs';
import { createFollowBacklinks } from '../src/follow/backlinks.js';
import { isTombstone } from '../src/storage/soft-delete.js';

const chat = '2000000007';
const deletion = (f) =>
  f.calls.filter((call) => call.method === 'messages.delete');
const timeout = () =>
  Object.assign(new Error('private diagnostic'), { code: 'ETIMEDOUT' });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const adapterFor = async (f) => {
  const adapter = await f.options.provider();
  await adapter.describe(chat);
  return adapter;
};

test(
  'VK incoming cleanup rejects outgoing, service, deleted, missing, duplicate and wrong-chat messages before any write',
  { timeout: 5000 },
  async () => {
    for (const rows of [
      [{ id: 1, peer_id: Number(chat), out: 1 }],
      [
        {
          id: 1,
          peer_id: Number(chat),
          out: 0,
          action: { type: 'chat_create' },
        },
      ],
      [{ id: 1, peer_id: Number(chat), out: 0, deleted: 1 }],
      [{ id: 1, peer_id: Number(chat), out: 0, is_unavailable: 1 }],
      [{ id: 1, peer_id: 2000000008, out: 0 }],
      [],
      [{ id: 2, peer_id: Number(chat), out: 0 }],
      [
        { id: 1, peer_id: Number(chat), out: 0 },
        { id: 1, peer_id: Number(chat), out: 0 },
      ],
    ]) {
      const f = await followBacklinksFixture();
      try {
        const adapter = await adapterFor(f);
        f.state.response = (call) =>
          call.method === 'messages.getById' ? { items: rows } : undefined;
        await assert.rejects(adapter.deleteIncoming({ chat, ids: ['1'] }), {
          code: 'provider-response',
        });
        assert.equal(deletion(f).length, 0);
      } finally {
        await f.service.stop();
      }
    }
  }
);

test(
  'VK incoming cleanup validates distinct canonical IDs before reading or deleting',
  { timeout: 5000 },
  async () => {
    const f = await followBacklinksFixture();
    try {
      const adapter = await adapterFor(f);
      const before = f.calls.length;
      for (const ids of [
        [],
        ['1', '1'],
        [1, '1'],
        ['01'],
        [null],
        Array.from({ length: 201 }, (_, i) => String(i + 1)),
      ]) {
        await assert.rejects(adapter.deleteIncoming({ chat, ids }), {
          code: 'bad-request',
        });
      }
      assert.equal(f.calls.length, before);
    } finally {
      await f.service.stop();
    }
  }
);

test(
  'VK cleanup rechecks its bound account after reading incoming messages',
  { timeout: 5000 },
  async () => {
    const f = await followBacklinksFixture();
    try {
      const adapter = await adapterFor(f);
      f.state.before = (call) => {
        if (call.method === 'messages.getById') {
          f.state.owner = 8;
        }
      };
      await assert.rejects(adapter.deleteIncoming({ chat, ids: ['1'] }), {
        code: 'account-changed',
      });
      assert.equal(deletion(f).length, 0);
    } finally {
      await f.service.stop();
    }
  }
);

test(
  'VK cleanup honors cancellation after waiting at the actual delete issue boundary',
  { timeout: 5000 },
  async () => {
    const f = await followBacklinksFixture();
    try {
      const adapter = await adapterFor(f);
      let cancelled = false;
      f.state.wait = () => {
        if (
          f.calls.at(-1)?.method === 'users.get' &&
          f.calls.some((call) => call.method === 'messages.getById')
        ) {
          cancelled = true;
        }
      };
      await assert.rejects(
        adapter.deleteIncoming({
          chat,
          ids: ['1'],
          cancelled: () => cancelled,
        }),
        { code: 'cancelled' }
      );
      assert.equal(deletion(f).length, 0);
    } finally {
      await f.service.stop();
    }
  }
);

test(
  'VK cleanup read timeouts use the caller policy without retrying an issued delete',
  { timeout: 5000 },
  async () => {
    const f = await followBacklinksFixture();
    try {
      let reads = 0;
      f.state.before = (call) => {
        if (
          call.method === 'messages.getById' &&
          call.params.message_ids === '1,4' &&
          ++reads < 3
        ) {
          throw timeout();
        }
        if (call.method === 'messages.delete') {
          throw timeout();
        }
      };
      const first = await f.post();
      assert.equal(reads, 3);
      assert.equal(first.status, 'unknown');
      assert.equal(first.rows[0].cleanup.status, 'unknown');
      assert.equal(first.rows[0].cleanup.code, 'outcome-unknown');
      assert.equal(deletion(f).length, 1);
      assert.deepEqual(f.sleeps.slice(-2), [10, 20]);
      const reopened = createFollowBacklinks(f.options);
      try {
        const preview = await reopened.preview(first.config);
        await reopened.apply({ planId: preview.planId, confirm: true });
        await reopened.idle();
        assert.equal(deletion(f).length, 1);
      } finally {
        await reopened.stop();
      }
      assert.equal(Boolean(isTombstone(await f.store.get('msg:vk:1'))), false);
    } finally {
      await f.service.stop();
    }
  }
);

test(
  'shutdown owns a VK cleanup request until its receipt and retains individual acknowledgements',
  { timeout: 5000 },
  async () => {
    const f = await followBacklinksFixture();
    const issued = deferred(),
      release = deferred();
    let closing;
    try {
      f.state.before = async (call) => {
        if (call.method === 'messages.delete') {
          issued.resolve();
          await release.promise;
        }
      };
      const posting = f.post();
      await issued.promise;
      let stopped = false;
      closing = f.service.stop().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      assert.equal(stopped, false);
      release.resolve();
      await closing;
      // f.post cannot call status on a stopped service; inspect its persisted job instead.
      await assert.rejects(posting, { code: 'stopped' });
      const [job] = await f.store.query(
        (link) => link.kind === 'follow-backlink-job'
      );
      assert.equal(job.status, 'paused');
      assert.deepEqual(job.rows[0].cleanup.confirmed, ['1', '4']);
      assert.equal(deletion(f).length, 1);
      assert.equal(Boolean(isTombstone(await f.store.get('msg:vk:1'))), true);
    } finally {
      release.resolve();
      await closing;
      await f.service.stop();
    }
  }
);
