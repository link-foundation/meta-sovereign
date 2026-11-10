import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import {
  followBacklinksFixture,
  backlinkInput,
} from './helpers/follow-backlinks.mjs';
import { createFollowBacklinks } from '../src/follow/backlinks.js';
import { followBacklinkCommands } from '../src/cli/follow-backlink-commands.js';
import { followReadWait } from '../src/follow/read-policy.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
  decodeWire,
} from '../src/transport/lino.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const outcome = (task) =>
  task.then(
    (value) => ({ value }),
    (error) => ({ error })
  );
const timeout = () =>
  Object.assign(new Error('private diagnostic'), { code: 'ETIMEDOUT' });
const waitingFixture = async () => {
  const f = await followBacklinksFixture();
  const waiting = deferred();
  f.state.before = () => {
    throw timeout();
  };
  const service = createFollowBacklinks({
    ...f.options,
    sleep: async (ms, signal) => {
      waiting.resolve();
      await followReadWait(ms, signal);
    },
  });
  return { ...f, service, waiting };
};
const input = (extra = {}) =>
  backlinkInput({
    requestId: 'preview-a',
    retry: { attempts: 3, delayMs: 60000, maxDelayMs: 60000 },
    ...extra,
  });

test(
  'scoped backlink preview cancellation wakes a long read backoff without another RPC or saved plan',
  { timeout: 5000 },
  async () => {
    const f = await waitingFixture();
    let result;
    try {
      result = outcome(f.service.preview(input()));
      await f.waiting.promise;
      assert.deepEqual(await f.service.cancel({ requestId: 'preview-a' }), {
        ok: true,
      });
      assert.equal((await result).error?.code, 'cancelled');
      assert.equal(f.calls.length, 1);
      assert.equal((await f.service.list()).total, 0);
    } finally {
      await f.service.stop();
      await result;
    }
  }
);

test(
  'cancelling an issued preview leaves another review usable and prevents a late plan',
  { timeout: 5000 },
  async () => {
    const f = await followBacklinksFixture();
    const entered = deferred(),
      release = deferred();
    let result;
    try {
      f.state.before = async (call) => {
        if (
          call.method === 'messages.getConversationsById' &&
          call.params.peer_ids === '2000000007'
        ) {
          entered.resolve();
          await release.promise;
        }
      };
      result = outcome(f.service.preview(input()));
      await entered.promise;
      const other = await f.service.preview(
        input({
          requestId: 'preview-b',
          chats: ['2000000008'],
          deleteIncoming: false,
        })
      );
      await f.service.cancel({ requestId: 'preview-a' });
      release.resolve();
      assert.equal((await result).error?.code, 'cancelled');
      const job = await f.service.apply({
        planId: other.planId,
        confirm: true,
      });
      await f.service.idle();
      assert.equal(
        (await f.service.status({ jobId: job.id })).status,
        'confirmed'
      );
      assert.deepEqual(
        f.calls
          .filter((call) => call.method === 'messages.send')
          .map((call) => call.params.peer_id),
        ['2000000008']
      );
    } finally {
      release.resolve();
      await f.service.stop();
      await result;
    }
  }
);

test(
  'preview shutdown waits for an issued provider read and blocks duplicate or malformed request IDs',
  { timeout: 5000 },
  async () => {
    const f = await followBacklinksFixture();
    const entered = deferred(),
      release = deferred();
    let result, closing;
    try {
      let first = true;
      f.state.before = async () => {
        if (first) {
          first = false;
          entered.resolve();
          await release.promise;
        }
      };
      result = outcome(f.service.preview(input()));
      await entered.promise;
      await assert.rejects(f.service.preview(input()), { code: 'busy' });
      await assert.rejects(
        f.service.preview(input({ requestId: '../invalid' })),
        { code: 'bad-request' }
      );
      await assert.rejects(f.service.cancel({ requestId: '../invalid' }), {
        code: 'bad-request',
      });
      let stopped = false;
      closing = f.service.stop().then(() => {
        stopped = true;
      });
      await setImmediate();
      assert.equal(stopped, false);
      release.resolve();
      await closing;
      assert.equal((await result).error?.code, 'stopped');
      assert.equal(
        f.calls.filter((call) => call.method === 'messages.send').length,
        0
      );
    } finally {
      release.resolve();
      await closing;
      await f.service.stop();
      await result;
    }
  }
);

test(
  'text and binary Lino routes cancel a pending preview by its request ID',
  { timeout: 10000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const f = await followBacklinksFixture();
      const waiting = deferred();
      f.state.before = () => {
        throw timeout();
      };
      const server = await startServer({
        store: f.store,
        telegramAccount: false,
        enableSync: false,
        enableHandlers: false,
        automations: { scheduler: false },
        follow: {
          backlinks: {
            ...f.options,
            sleep: async (ms, signal) => {
              waiting.resolve();
              await followReadWait(ms, signal);
            },
          },
        },
      });
      let preview;
      try {
        const request = async (action, body) =>
          readWireResponse(
            await fetch(
              `http://127.0.0.1:${server.port}/api/automations/follow/backlinks/${action}`,
              {
                method: 'POST',
                headers: { accept: type, 'content-type': type },
                body: encodeWire(body, type),
              }
            )
          );
        preview = outcome(request('preview', input()));
        await waiting.promise;
        assert.deepEqual(await request('cancel', { requestId: 'preview-a' }), {
          ok: true,
        });
        assert.equal((await preview).value?.code, 'cancelled');
        assert.equal(f.calls.length, 1);
      } finally {
        await server.close();
        await preview;
        await f.service.stop();
      }
    }
  }
);

test(
  'CLI SIGINT wakes a pending preview, reports cancellation and removes signal handlers before exit',
  { timeout: 5000 },
  async () => {
    const f = await waitingFixture();
    let woken = false,
      result;
    const lines = [];
    const listeners = process.listenerCount('SIGINT');
    // Observe the actual owned delay without waiting for its 60-second timer.
    const stop = f.service.stop;
    f.service.stop = async () => {
      woken = true;
      return stop();
    };
    try {
      result = outcome(
        followBacklinkCommands({
          args: {
            _: ['follow', 'backlinks', 'post'],
            chats: '2000000007',
            backlink: 'https://t.me/study_group',
            attempts: '3',
            'retry-delay-ms': '60000',
            'retry-max-delay-ms': '60000',
            confirm: true,
          },
          store: f.store,
          followBacklinks: f.service,
          log: (line) => lines.push(line),
        })
      );
      await f.waiting.promise;
      process.emit('SIGINT');
      await setImmediate();
      assert.equal(woken, true);
      assert.equal((await result).value, 1);
      assert.equal(decodeWire(lines[0], LINO_TEXT).code, 'cancelled');
      assert.equal(process.listenerCount('SIGINT'), listeners);
      assert.equal(f.calls.length, 1);
    } finally {
      await f.service.stop();
      await result;
    }
  }
);
