import test from 'node:test';
import assert from 'node:assert/strict';
import {
  telegramBacklinksFixture,
  telegramBacklinkInput,
} from './helpers/telegram-backlinks.mjs';
import { followBacklinksFixture } from './helpers/follow-backlinks.mjs';
import { followRpcError } from './helpers/follow-telegram.mjs';
import { backlinkError } from '../src/follow/backlink-shape.js';
import { createFollowBacklinks } from '../src/follow/backlinks.js';
import { followBacklinkApi } from '../src/web/follow-backlink-api.js';

const method = (f, name) => f.requests.filter((r) => r.className === name);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
test('Telegram source posts Telegram and VK backlinks after review and monitors before basic-group local-only cleanup', async (t) => {
  for (const backlink of [
    'https://t.me/study_group',
    'https://vk.me/join/valid_invite',
  ]) {
    await t.test(backlink, async () => {
      const f = await telegramBacklinksFixture();
      try {
        const preview = await f.service.preview(
          telegramBacklinkInput({ backlink })
        );
        assert.equal(preview.owner, '7');
        assert.equal(preview.rows[0].chat, '-7');
        assert.equal(f.writes.length, 0);
        const job = await f.service.apply({
          planId: preview.planId,
          confirm: true,
        });
        await f.service.idle();
        const result = await f.service.status({ jobId: job.id });
        assert.equal(result.status, 'confirmed');
        assert.equal(
          result.config.targetSource,
          backlink.includes('vk.me') ? 'vk' : 'telegram'
        );
        assert.equal(result.rows[0].messageId, '100');
        assert.ok(result.rows[0].checkedAt >= result.rows[0].sentAt + 2000);
        assert.deepEqual(result.rows[0].cleanup.confirmed, ['1', '4']);
        assert.equal(method(f, 'messages.SendMessage').length, 1);
        const [remove] = method(f, 'messages.DeleteMessages');
        assert.equal(remove.revoke, false);
        assert.deepEqual(remove.id, [1, 4]);
        assert.deepEqual([...f.state.deleted], ['1', '4']);
        const messages = await f.store.query((l) => l.source === 'telegram');
        for (const link of messages.filter((l) => l.id.startsWith('msg:'))) {
          assert.equal(
            Boolean(link.deleted),
            ['1', '4'].includes(String(link.raw.id))
          );
        }
        assert.ok(
          f.calls.every(
            (c) =>
              c.options.maxRetryCount === 0 &&
              c.options.floodSleepThreshold === 0
          )
        );
        const api = followBacklinkApi({ remote: { get: async () => result } });
        assert.equal(
          (await api.followBacklinkStatus({ jobId: result.id })).status,
          'confirmed'
        );
        const again = await f.post({ backlink });
        assert.equal(again.status, 'confirmed');
        assert.equal(method(f, 'messages.SendMessage').length, 1);
      } finally {
        await f.close();
      }
    });
  }
});
test('channel and supergroup posts keep exact signed IDs and refuse cleanup before any write', async () => {
  const f = await telegramBacklinksFixture();
  try {
    f.state.entity = {
      className: 'Channel',
      id: 9007199254740993n,
      title: 'Large group',
      megagroup: true,
    };
    const chats = ['-1009007199254740993'];
    await assert.rejects(f.service.preview(telegramBacklinkInput({ chats })), {
      code: 'cleanup-unavailable',
    });
    assert.equal(f.writes.length, 0);
    const result = await f.post({ chats, deleteIncoming: false });
    assert.equal(result.status, 'confirmed');
    assert.equal(result.rows[0].chat, chats[0]);
    assert.equal(
      method(f, 'messages.SendMessage')[0].peer.channelId,
      9007199254740993n
    );
    assert.ok(method(f, 'channels.GetMessages').length > 0);
    assert.equal(method(f, 'messages.DeleteMessages').length, 0);
  } finally {
    await f.close();
  }
});
test('user-account, membership, write permission and cached-target requirements never guess success', async () => {
  for (const [change, code] of [
    [
      (s) => {
        s.bot = true;
      },
      'user-account-required',
    ],
    [
      (s) => {
        s.entity.left = true;
      },
      'not-writable',
    ],
    [
      (s) => {
        s.entity.defaultBannedRights = { sendMessages: true };
      },
      'not-writable',
    ],
    [
      (s) => {
        s.entity = {
          className: 'Channel',
          id: 7n,
          title: 'Broadcast',
          broadcast: true,
        };
      },
      'not-writable',
    ],
  ]) {
    const f = await telegramBacklinksFixture();
    try {
      change(f.state);
      await assert.rejects(
        f.service.preview(
          telegramBacklinkInput({
            chats: [f.state.entity.className === 'Channel' ? '-1007' : '-7'],
          })
        ),
        { code }
      );
      assert.equal(f.writes.length, 0);
    } finally {
      await f.close();
    }
  }
});
test('Telegram refusals retain only bounded RPC codes and never retry writes or flood waits', async () => {
  for (const rpc of [
    'CHAT_WRITE_FORBIDDEN',
    'FLOOD_WAIT_42',
    'INVITE_REQUEST_SENT',
  ]) {
    const f = await telegramBacklinksFixture();
    try {
      f.state.before = (r) => {
        if (r.className === 'messages.SendMessage') {
          throw followRpcError(rpc);
        }
      };
      const result = await f.post({ deleteIncoming: false });
      assert.equal(result.status, 'failed');
      assert.equal(result.rows[0].providerError, rpc);
      assert.equal(
        result.rows[0].code,
        rpc.startsWith('FLOOD') ? 'flood-wait' : 'provider-refused'
      );
      assert.equal(method(f, 'messages.SendMessage').length, 1);
      assert.ok(!JSON.stringify(result).includes('private diagnostic'));
    } finally {
      await f.close();
    }
  }
  assert.deepEqual(
    backlinkError(followRpcError('TIMEOUT', 500), { write: true }),
    { code: 'outcome-unknown' }
  );
  assert.deepEqual(backlinkError(followRpcError('bad secret response')), {
    code: 'read-failed',
  });
});
test('read timeouts use bounded backoff; resume checks the same post without sending again', async () => {
  const f = await telegramBacklinksFixture();
  try {
    f.state.before = (r) => {
      if (r.className === 'messages.GetMessages') {
        throw followRpcError('TIMEOUT', 500);
      }
    };
    const paused = await f.post({ deleteIncoming: false });
    assert.equal(paused.status, 'paused');
    assert.equal(paused.rows[0].code, 'timeout');
    assert.equal(method(f, 'messages.GetMessages').length, 3);
    assert.deepEqual(f.sleeps.slice(-2), [10, 20]);
    f.state.before = undefined;
    const next = await f.service.resume({ jobId: paused.id, confirm: true });
    assert.equal(next.status, 'queued');
    await f.service.idle();
    assert.equal(
      (await f.service.status({ jobId: next.id })).status,
      'confirmed'
    );
    assert.equal(method(f, 'messages.SendMessage').length, 1);
  } finally {
    await f.close();
  }
});
test('an uncertain Telegram send is journaled and never automatically replayed after reopening the service', async () => {
  const f = await telegramBacklinksFixture();
  let reopened;
  try {
    f.state.response = (r) => {
      if (r.className === 'messages.SendMessage') {
        throw followRpcError('TIMEOUT', 500);
      }
    };
    const result = await f.post({ deleteIncoming: false });
    assert.equal(result.status, 'unknown');
    assert.equal(result.rows[0].code, 'outcome-unknown');
    await f.service.stop();
    f.state.response = undefined;
    reopened = createFollowBacklinks(f.options);
    const preview = await reopened.preview(
      telegramBacklinkInput({ deleteIncoming: false })
    );
    const next = await reopened.apply({
      planId: preview.planId,
      confirm: true,
    });
    await reopened.idle();
    assert.equal((await reopened.status({ jobId: next.id })).status, 'unknown');
    assert.equal(method(f, 'messages.SendMessage').length, 1);
  } finally {
    await reopened?.stop();
    await f.close();
  }
});
test('cleanup confirms individual absence after the local-only RPC and projects only those incoming messages', async () => {
  const f = await telegramBacklinksFixture();
  try {
    f.state.deleteOnly = ['1'];
    const result = await f.post();
    assert.equal(result.status, 'unknown');
    assert.equal(result.rows[0].cleanup.status, 'unknown');
    assert.deepEqual(result.rows[0].cleanup.confirmed, ['1']);
    const rows = (await f.store.query((l) => l.source === 'telegram')).filter(
      (l) => l.id.startsWith('msg:')
    );
    for (const row of rows) {
      assert.equal(Boolean(row.deleted), String(row.raw.id) === '1');
    }
    await f.post();
    assert.equal(method(f, 'messages.DeleteMessages').length, 1);
  } finally {
    await f.close();
  }
});
test('empty, wrong-peer and service-message inspection responses pause instead of claiming survival or removal', async () => {
  for (const messages of [
    [],
    [
      {
        className: 'Message',
        id: 100,
        peerId: { className: 'PeerChat', chatId: 8n },
      },
    ],
    [
      {
        className: 'MessageService',
        id: 100,
        peerId: { className: 'PeerChat', chatId: 7n },
        action: {},
      },
    ],
  ]) {
    const f = await telegramBacklinksFixture();
    try {
      f.state.response = (r) =>
        r.className === 'messages.GetMessages' ? { messages } : undefined;
      const result = await f.post({ deleteIncoming: false });
      assert.equal(result.status, 'paused');
      assert.equal(result.rows[0].code, 'provider-response');
      assert.equal(method(f, 'messages.DeleteMessages').length, 0);
    } finally {
      await f.close();
    }
  }
});
test('account changes at the final send boundary stop writes; a valid already-issued receipt is retained', async () => {
  const f = await telegramBacklinksFixture();
  try {
    const plan = await f.service.preview(
      telegramBacklinkInput({ deleteIncoming: false })
    );
    let targets = 0;
    f.state.before = (r) => {
      if (r.className === 'messages.GetChats' && ++targets === 2) {
        f.state.owner = 8n;
      }
    };
    const job = await f.service.apply({ planId: plan.planId, confirm: true });
    await f.service.idle();
    const result = await f.service.status({ jobId: job.id });
    assert.equal(result.status, 'failed');
    assert.equal(result.rows[0].code, 'account-changed');
    assert.equal(f.writes.length, 0);
  } finally {
    await f.close();
  }
  const g = await telegramBacklinksFixture();
  try {
    g.state.response = (r) => {
      if (r.className === 'messages.SendMessage') {
        g.state.owner = 8n;
      }
    };
    const result = await g.post({ deleteIncoming: false });
    assert.equal(result.status, 'paused');
    assert.equal(result.rows[0].messageId, '100');
    assert.equal(result.rows[0].status, 'monitoring');
    assert.equal(result.rows[0].code, 'account-changed');
    assert.equal(method(g, 'messages.SendMessage').length, 1);
  } finally {
    await g.close();
  }
});
test('queue deadlines and stop retain ownership of the actual in-flight RPC and pending connection', async () => {
  const f = await telegramBacklinksFixture({
    queue: {
      run: async (_key, _kind, use) => {
        use().catch(() => {});
        throw new Error('queue deadline');
      },
    },
  });
  const entered = deferred();
  const release = deferred();
  f.state.before = async (r) => {
    if (r.className === 'messages.GetChats') {
      entered.resolve();
      await release.promise;
    }
  };
  const preview = f.service.preview(telegramBacklinkInput());
  await entered.promise;
  let stopped = false;
  const stop = f.account.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  release.resolve();
  await assert.rejects(preview, { code: 'stopped' });
  await stop;
  await f.close();
  const g = await telegramBacklinksFixture();
  const connected = deferred();
  const unblock = deferred();
  g.state.connect = async () => {
    connected.resolve();
    await unblock.promise;
  };
  const waiting = g.service.preview(telegramBacklinkInput());
  await connected.promise;
  let ended = false;
  const stopping = g.account.stop().then(() => {
    ended = true;
  });
  await Promise.resolve();
  assert.equal(ended, false);
  unblock.resolve();
  await assert.rejects(waiting, { code: 'stopped' });
  await stopping;
  await g.close();
});

test('VK source posts both provider targets with the same reviewed monitoring controls', async () => {
  for (const backlink of [
    'https://t.me/study_group',
    'https://vk.me/join/valid_invite',
  ]) {
    const f = await followBacklinksFixture();
    try {
      const result = await f.post({ backlink, deleteIncoming: false });
      assert.equal(result.status, 'confirmed');
      assert.equal(result.config.source, 'vk');
      assert.equal(
        result.config.targetSource,
        backlink.includes('vk.me') ? 'vk' : 'telegram'
      );
      assert.equal(
        f.calls.filter((c) => c.method === 'messages.send').length,
        1
      );
    } finally {
      await f.service.stop();
    }
  }
});
