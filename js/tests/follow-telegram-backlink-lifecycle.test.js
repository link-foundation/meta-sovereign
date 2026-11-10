import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FloodWaitError,
  SlowModeWaitError,
} from 'teleproto/errors/RPCErrorList.js';
import {
  telegramBacklinksFixture,
  telegramBacklinkInput,
} from './helpers/telegram-backlinks.mjs';
import { backlinkError } from '../src/follow/backlink-shape.js';
const method = (f, name) => f.requests.filter((r) => r.className === name);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};

test('actual SDK flood and slow-mode errors keep their parsed duration without leaking request diagnostics', () => {
  for (const [Ctor, providerError] of [
    [FloodWaitError, 'FLOOD_WAIT_42'],
    [SlowModeWaitError, 'SLOWMODE_WAIT_42'],
  ]) {
    const error = new Ctor({ capture: 42 });
    assert.deepEqual(backlinkError(error, { write: true }), {
      code: 'flood-wait',
      providerError,
    });
  }
});
test('cancellation while resolving a post target prevents the queued write and drains the worker', async () => {
  const f = await telegramBacklinksFixture();
  const entered = deferred();
  const release = deferred();
  try {
    const preview = await f.service.preview(
      telegramBacklinkInput({ deleteIncoming: false })
    );
    let targets = 0;
    f.state.before = async (r) => {
      if (r.className === 'messages.GetChats' && ++targets === 2) {
        entered.resolve();
        await release.promise;
      }
    };
    const job = await f.service.apply({
      planId: preview.planId,
      confirm: true,
    });
    await entered.promise;
    await f.service.cancel({ jobId: job.id });
    release.resolve();
    await f.service.idle();
    const result = await f.service.status({ jobId: job.id });
    assert.equal(result.status, 'paused');
    assert.equal(result.rows[0].code, 'cancelled');
    assert.equal(f.writes.length, 0);
  } finally {
    release.resolve();
    await f.close();
  }
});
test('cleanup rejects changed outgoing or service rows at the deletion boundary', async () => {
  for (const changed of [
    { out: true },
    { className: 'MessageService', action: {} },
  ]) {
    const f = await telegramBacklinksFixture();
    try {
      f.state.response = (r, answer) => {
        if (r.className === 'messages.GetMessages' && r.id.length === 2) {
          return {
            messages: answer.messages.map((m) => ({ ...m, ...changed })),
          };
        }
        return undefined;
      };
      const result = await f.post();
      assert.equal(result.status, 'unknown');
      assert.equal(result.rows[0].cleanup.code, 'provider-response');
      assert.equal(method(f, 'messages.DeleteMessages').length, 0);
      assert.deepEqual(result.rows[0].cleanup.confirmed, []);
    } finally {
      await f.close();
    }
  }
});
test('malformed aggregate deletion acknowledgements remain unknown and never tombstone cached messages', async () => {
  const f = await telegramBacklinksFixture();
  try {
    f.state.response = (r) =>
      r.className === 'messages.DeleteMessages'
        ? { className: 'messages.AffectedMessages', pts: 10 }
        : undefined;
    const result = await f.post();
    assert.equal(result.status, 'unknown');
    assert.equal(result.rows[0].cleanup.code, 'outcome-unknown');
    assert.deepEqual(result.rows[0].cleanup.confirmed, []);
    assert.ok(
      (await f.store.query((l) => l.id.startsWith('msg:'))).every(
        (l) => !l.deleted
      )
    );
    await f.post();
    assert.equal(method(f, 'messages.DeleteMessages').length, 1);
  } finally {
    await f.close();
  }
});
test('a positive full-updates send survives local projection failure and keeps its actual Telegram receipt', async () => {
  const f = await telegramBacklinksFixture();
  try {
    f.state.response = (r, answer) =>
      r.className === 'messages.SendMessage'
        ? {
            className: 'Updates',
            chats: [f.state.entity],
            users: [],
            updates: [
              {
                className: 'UpdateMessageID',
                randomId: r.randomId,
                id: answer.id,
              },
            ],
          }
        : undefined;
    f.state.apply = () => {
      throw new Error('fixture projection failure');
    };
    const result = await f.post({ deleteIncoming: false });
    assert.equal(result.status, 'confirmed');
    assert.equal(result.rows[0].messageId, '100');
    assert.equal(f.applied.length, 1);
    assert.equal(method(f, 'messages.SendMessage').length, 1);
  } finally {
    await f.close();
  }
});
test('missing channel access hash in the account cache is explicit and never invokes hidden entity resolution', async () => {
  const f = await telegramBacklinksFixture();
  try {
    f.state.cached = false;
    f.client.getInputEntity = () => {
      throw new Error('hidden SDK network lookup');
    };
    await assert.rejects(
      f.service.preview(
        telegramBacklinkInput({ chats: ['-1007'], deleteIncoming: false })
      ),
      { code: 'target-unavailable' }
    );
    assert.equal(f.writes.length, 0);
    assert.equal(method(f, 'channels.GetChannels').length, 0);
  } finally {
    await f.close();
  }
});

test('timeout-only cleanup readback retries never replay the issued deletion', async () => {
  const f = await telegramBacklinksFixture();
  let deleted = false;
  let attempts = 0;
  try {
    f.state.response = (r) => {
      if (r.className === 'messages.DeleteMessages') {
        deleted = true;
      }
    };
    f.state.before = (r) => {
      if (deleted && r.className === 'messages.GetMessages' && ++attempts < 3) {
        throw Object.assign(new Error('fixture timeout'), {
          errorMessage: 'TIMEOUT',
          code: 500,
        });
      }
    };
    const result = await f.post();
    assert.equal(result.status, 'confirmed');
    assert.equal(attempts, 3);
    assert.equal(method(f, 'messages.DeleteMessages').length, 1);
    assert.deepEqual(result.rows[0].cleanup.confirmed, ['1', '4']);
    assert.deepEqual(f.sleeps.slice(-2), [10, 20]);
  } finally {
    await f.close();
  }
});

test('unsafe numeric Telegram selectors cannot silently target a rounded group ID', async () => {
  const f = await telegramBacklinksFixture();
  try {
    await assert.rejects(
      f.service.preview(telegramBacklinkInput({ chats: [-9007199254740992] })),
      { code: 'bad-request' }
    );
    assert.equal(f.requests.length, 0);
    assert.equal(f.writes.length, 0);
  } finally {
    await f.close();
  }
});
