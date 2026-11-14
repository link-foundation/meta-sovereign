import test from 'node:test';
import assert from 'node:assert/strict';
import { FloodWaitError } from 'teleproto/errors/RPCErrorList.js';
import { followAutoFixture } from './helpers/follow-auto.mjs';
import {
  followTelegramFixture,
  followRpcError,
} from './helpers/follow-telegram.mjs';
import { backlinkError } from '../src/follow/backlink-shape.js';

const finish = async (f, plan) => {
  const job = await f.service.apply({ planId: plan.planId, confirm: true });
  await f.service.idle();
  return f.service.status({ jobId: job.id });
};

test('Telegram read timeouts reach the configured automatic Follow backoff', async () => {
  const f = await followAutoFixture();
  try {
    let reads = 0;
    const delays = [];
    f.state.sleep = async (ms) => delays.push(ms);
    f.member.state.read = (request) => {
      if (request.className === 'channels.GetParticipant' && ++reads <= 2) {
        throw followRpcError('TIMEOUT', 503);
      }
    };
    const plan = await f.service.preview(f.input());
    assert.equal(plan.ok, true);
    assert.deepEqual(delays, [10, 20]);
    assert.equal(f.member.writes.length, 0);
  } finally {
    await f.close();
  }
});

test('Telegram read exhaustion preserves timeout and performs exactly the configured attempts', async () => {
  const f = await followAutoFixture();
  try {
    let reads = 0;
    f.member.state.read = () => {
      reads++;
      throw Object.assign(new Error('private diagnostic'), {
        code: 'ETIMEDOUT',
      });
    };
    await assert.rejects(f.service.preview(f.input()), { code: 'timeout' });
    assert.equal(reads, 3);
    assert.equal(f.member.writes.length, 0);
  } finally {
    await f.close();
  }
});

test('read refusals preserve provider codes and parsed flood duration without timeout retries', async () => {
  for (const [error, expected] of [
    [
      new FloodWaitError({ capture: 42 }),
      { code: 'flood-wait', providerError: 'FLOOD_WAIT_42' },
    ],
    [
      followRpcError('INVITE_HASH_EXPIRED'),
      { code: 'provider-refused', providerError: 'INVITE_HASH_EXPIRED' },
    ],
    [
      followRpcError('CHAT_ADMIN_REQUIRED'),
      { code: 'provider-refused', providerError: 'CHAT_ADMIN_REQUIRED' },
    ],
  ]) {
    const f = await followAutoFixture();
    try {
      let reads = 0;
      f.member.state.read = () => {
        reads++;
        throw error;
      };
      await assert.rejects(f.service.preview(f.input()), (failure) => {
        assert.deepEqual(backlinkError(failure), expected);
        assert.equal(
          JSON.stringify(backlinkError(failure)).includes('private'),
          false
        );
        return true;
      });
      assert.equal(reads, 1);
      assert.equal(f.member.writes.length, 0);
    } finally {
      await f.close();
    }
  }
});

test('standalone Telegram read failures expose sanitized timeout and provider refusal details', async () => {
  const f = followTelegramFixture();
  try {
    f.state.read = () => {
      throw new FloodWaitError({ capture: 42 });
    };
    assert.deepEqual(await f.actions.followTelegramList(), {
      ok: false,
      code: 'flood-wait',
      providerError: 'FLOOD_WAIT_42',
    });
    f.state.read = () => {
      throw followRpcError('TIMEOUT', 503);
    };
    assert.deepEqual(await f.actions.followTelegramList(), {
      ok: false,
      code: 'timeout',
    });
  } finally {
    await f.account.stop();
  }
});

test('automatic Follow retries prewrite reads while issuing each membership and preference write once', async () => {
  const f = await followAutoFixture();
  try {
    const plan = await f.service.preview(f.input());
    let failures = 0;
    let intentStored = false;
    const put = f.member.store.put.bind(f.member.store);
    f.member.store.put = async (record, ...args) => {
      const result = await put(record, ...args);
      if (record.kind === 'telegram-follow-intent') {
        intentStored = true;
      }
      return result;
    };
    const delays = [];
    f.state.sleep = async (ms) => delays.push(ms);
    f.member.state.read = (request) => {
      if (
        request.className === 'channels.GetParticipant' &&
        intentStored &&
        f.member.state.entity.username === 'study_first' &&
        ++failures <= 2
      ) {
        throw followRpcError('TIMEOUT', 503);
      }
    };
    const result = await finish(f, plan);
    assert.equal(result.status, 'confirmed', JSON.stringify(result));
    assert.deepEqual(delays.slice(0, 2), [10, 20]);
    assert.deepEqual(
      f.member.writes.map((r) => r.className),
      [
        'channels.JoinChannel',
        'account.UpdateNotifySettings',
        'folders.EditPeerFolders',
      ]
    );
    assert.equal(
      f.vk.calls.filter((r) => r.method === 'messages.send').length,
      1
    );
  } finally {
    await f.close();
  }
});

test('parsed flood waits and ambiguous membership writes never enter the read retry policy', async () => {
  for (const [error, expected] of [
    [new FloodWaitError({ capture: 42 }), 'failed'],
    [followRpcError('TIMEOUT', 503), 'unknown'],
  ]) {
    const f = await followAutoFixture();
    try {
      f.member.state.reply = () => {
        throw error;
      };
      const result = await f.post();
      assert.equal(result.status, 'paused');
      const phase = result.rows[0].following.links[0].result.results[0];
      assert.equal(phase.status, expected);
      if (expected === 'failed') {
        assert.equal(phase.code, 'flood-wait');
        assert.equal(phase.providerError, 'FLOOD_WAIT_42');
      }
      assert.equal(f.member.writes.length, 1);
      assert.equal(
        f.vk.calls.filter((r) => r.method === 'messages.send').length,
        0
      );
    } finally {
      await f.close();
    }
  }
});

test('cancelling automatic Follow during read backoff prevents another request and every write', async () => {
  const f = await followAutoFixture();
  try {
    const plan = await f.service.preview(f.input());
    let attempts = 0;
    f.member.state.read = (request) => {
      if (request.className === 'channels.GetParticipant') {
        attempts++;
        throw followRpcError('TIMEOUT', 503);
      }
    };
    f.state.sleep = async () => {
      await f.service.cancel({ jobId: current.id });
    };
    const current = await f.service.apply({
      planId: plan.planId,
      confirm: true,
    });
    await f.service.idle();
    assert.equal(
      (await f.service.status({ jobId: current.id })).status,
      'paused'
    );
    assert.equal(attempts, 1);
    assert.equal(f.member.writes.length, 0);
  } finally {
    await f.close();
  }
});

test('numeric Telegram targets propagate explicit lookup errors without SDK entity helpers', async () => {
  const f = followTelegramFixture();
  try {
    f.client.getEntity = () => {
      throw new Error('SDK helper must not run');
    };
    for (const [target, method] of [
      ['-7', 'messages.GetChats'],
      ['-1007', 'channels.GetChannels'],
      ['https://t.me/c/7/9', 'channels.GetChannels'],
    ]) {
      const start = f.calls.length;
      f.state.read = () => {
        throw followRpcError('TIMEOUT', 503);
      };
      const result = await f.actions.followTelegramPreview({
        target,
        retry: { attempts: 1 },
      });
      assert.deepEqual(result, { ok: false, code: 'timeout' });
      assert.deepEqual(
        f.calls.slice(start).map((r) => r.className),
        ['users.GetUsers', method]
      );
    }
    assert.equal(f.writes.length, 0);
  } finally {
    await f.account.stop();
  }
});
