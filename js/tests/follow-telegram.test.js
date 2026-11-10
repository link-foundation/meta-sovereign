import test from 'node:test';
import assert from 'node:assert/strict';
import {
  followTelegramFixture,
  followRpcError,
  followUpdates,
} from './helpers/follow-telegram.mjs';
import { followSelector } from '../src/sources/telegram-follow-shape.js';

const planFor = (f, body = {}) =>
  f.actions.followTelegramPreview({ target: '@study_group', ...body });
const apply = (f, plan) =>
  f.actions.followTelegramApply({ planId: plan.planId, confirm: true });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
test('Follow selectors preserve typed IDs, bare usernames and invitation hashes without treating private message URLs as invitations', () => {
  for (const name of [
    'study_group',
    '@Study_Group',
    'https://t.me/study_group/1',
  ]) {
    assert.equal(followSelector(name).username, 'study_group');
  }
  assert.deepEqual(followSelector('-1009007199254740993'), {
    kind: 'id',
    chat: '-1009007199254740993',
  });
  assert.equal(
    followSelector('tg://join?invite=AbC_123-xyz').invite,
    'AbC_123-xyz'
  );
  assert.equal(followSelector('t.me/c/7/1').kind, 'private-message');
  for (const value of [
    '1234',
    '0',
    't.me.evil/study_group',
    't.me/+123456789',
    'x'.repeat(2049),
  ]) {
    assert.equal(followSelector(value), null);
  }
});
test('listing performs one bounded raw request, includes archive preferences and never mutates Telegram', async () => {
  const f = followTelegramFixture();
  f.state.archived = true;
  const result = await f.actions.followTelegramList({ limit: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.chats[0].chat, '-1007');
  assert.equal(result.chats[0].archived, true);
  assert.equal(result.page.complete, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].limit, 2);
  assert.equal(f.calls[0].folderId, undefined, 'all folders are requested');
  assert.equal(f.writes.length, 0);
});
test('raw pagination advances through private-only pages and binds exact peer/date offsets to the account', async () => {
  const f = followTelegramFixture();
  f.state.read = (request) =>
    request.className === 'messages.GetDialogs'
      ? {
          className: 'messages.DialogsSlice',
          count: 3,
          chats: [],
          users: [],
          dialogs: [
            {
              className: 'Dialog',
              peer: { className: 'PeerUser', userId: 4n },
              topMessage: 9,
            },
          ],
          messages: [
            {
              id: 9,
              peerId: { className: 'PeerChannel', channelId: 4n },
              date: 999,
            },
            { id: 9, peerId: { className: 'PeerUser', userId: 4n }, date: 123 },
          ],
        }
      : undefined;
  const first = await f.actions.followTelegramList({ limit: 1 });
  assert.deepEqual(first.chats, []);
  assert.equal(first.page.hasMore, true);
  assert.ok(first.page.next);
  f.state.read = null;
  assert.equal(
    (await f.actions.followTelegramList({ limit: 1, cursor: first.page.next }))
      .ok,
    true
  );
  assert.equal(f.calls[1].offsetPeer.userId, '4');
  assert.equal(f.calls[1].offsetDate, 123);
  assert.equal(f.calls[1].offsetId, 9);
  assert.equal(f.calls[1].excludePinned, true);
  f.state.owner = '2';
  assert.equal(
    (await f.actions.followTelegramList({ cursor: first.page.next })).code,
    'account-changed'
  );
  assert.equal(f.calls.length, 2);
});
test('empty slices with a positive count and unavailable cursors retain partial coverage; malformed responses fail', async () => {
  const f = followTelegramFixture();
  f.state.read = () => ({
    className: 'messages.DialogsSlice',
    count: 10,
    dialogs: [],
    chats: [],
    messages: [],
  });
  const result = await f.actions.followTelegramList();
  assert.equal(result.page.complete, false);
  assert.equal(result.page.partial, true);
  assert.equal(result.page.next, null);
  f.state.read = () => ({});
  assert.equal((await f.actions.followTelegramList()).ok, false);
  assert.equal(
    (await f.actions.followTelegramList({ limit: 101 })).code,
    'bad-request'
  );
});
test('previews read exact membership and preferences without writing; existing members skip joins and preferences are independent', async () => {
  const f = followTelegramFixture();
  const plan = await planFor(f, { mute: true, archive: false });
  assert.equal(plan.ok, true);
  assert.equal(plan.target.member, true);
  assert.equal(plan.phases[0].status, 'skipped');
  assert.equal(f.writes.length, 0);
  const answer = await apply(f, plan);
  assert.equal(answer.ok, true);
  assert.deepEqual(
    answer.results.map((r) => r.status),
    ['skipped', 'confirmed', 'skipped']
  );
  assert.deepEqual(
    f.writes.map((r) => r.className),
    ['account.UpdateNotifySettings']
  );
  assert.equal(f.writes[0].peer.className, 'InputNotifyPeer');
  assert.equal((await apply(f, plan)).code, 'plan-expired');
});
test('private invitation joins confirm membership before mute/archive and preserve all phase receipts', async () => {
  const f = followTelegramFixture();
  f.state.member = false;
  const plan = await planFor(f, {
    target: 't.me/+AbC_123-xyz',
    mute: true,
    archive: true,
  });
  assert.equal(plan.target.chat, null);
  assert.equal(f.writes.length, 0);
  plan.options.mute = false;
  const result = await apply(f, plan);
  assert.equal(result.ok, true);
  assert.equal(result.chat, '-1007');
  assert.deepEqual(
    result.results.map((r) => r.status),
    ['confirmed', 'confirmed', 'confirmed']
  );
  assert.equal(f.state.muted, true, 'the server freezes preview options');
  assert.equal(f.state.archived, true);
  assert.deepEqual(
    f.writes.map((r) => r.className),
    [
      'messages.ImportChatInvite',
      'account.UpdateNotifySettings',
      'folders.EditPeerFolders',
    ]
  );
});
test('temporary peek access still needs joining and inaccessible private message links cannot manufacture an invitation', async () => {
  const f = followTelegramFixture();
  f.state.member = false;
  f.state.peek = true;
  const plan = await planFor(f, { target: 't.me/+AbC_123-xyz' });
  assert.equal(plan.target.member, false);
  assert.equal(plan.target.chat, '-1007');
  assert.equal(
    (await planFor(f, { target: 't.me/c/7/1' })).code,
    'invitation-required'
  );
  assert.equal(f.writes.length, 0);
  assert.equal((await apply(f, plan)).ok, true);
});
test('approval, web-view, missing/mismatched joins and transport/internal timeouts never continue preferences', async () => {
  const cases = [
    [
      () => {
        throw followRpcError('INVITE_REQUEST_SENT');
      },
      'pending',
    ],
    [
      () => ({ className: 'messages.ChatInviteJoinResultWebView' }),
      'unsupported',
    ],
    [() => undefined, 'unknown'],
    [() => followUpdates({ className: 'Channel', id: 8n }), 'unknown'],
    [
      () => {
        throw new Error('socket closed');
      },
      'unknown',
    ],
    [
      () => {
        throw followRpcError('TIMEOUT', 500);
      },
      'unknown',
    ],
  ];
  for (const [reply, status] of cases) {
    const f = followTelegramFixture();
    f.state.member = false;
    f.state.reply = reply;
    const plan = await planFor(f, { mute: true, archive: true });
    const result = await apply(f, plan);
    assert.equal(result.ok, false);
    assert.equal(result.results[0].status, status);
    assert.equal(result.results.length, 1);
    assert.equal(f.writes.length, 1);
    assert.equal(f.applied.length, 0);
  }
});
test('uncertain writes survive a reopened controller and fresh preview; a positive fresh membership read skips replay', async () => {
  const f = followTelegramFixture();
  f.state.member = false;
  f.state.reply = () => {
    throw new Error('lost response');
  };
  await apply(f, await planFor(f));
  f.actions = f.reopen();
  const blocked = await planFor(f);
  assert.equal(blocked.phases[0].status, 'unknown');
  assert.equal((await apply(f, blocked)).ok, false);
  assert.equal(f.writes.length, 1);
  f.state.member = true;
  const reconciled = await planFor(f);
  assert.equal(reconciled.phases[0].status, 'skipped');
  assert.equal((await apply(f, reconciled)).ok, true);
  assert.equal(f.writes.length, 1);
});
test('a confirmed membership step survives an uncertain preference and a fresh plan never repeats that preference', async () => {
  const f = followTelegramFixture();
  f.state.member = false;
  f.state.reply = (request) => {
    if (request.className === 'channels.JoinChannel') {
      f.state.member = true;
      return followUpdates(f.state.entity);
    }
    return false;
  };
  const result = await apply(
    f,
    await planFor(f, { mute: true, archive: true })
  );
  assert.deepEqual(
    result.results.map((r) => r.status),
    ['confirmed', 'unknown']
  );
  assert.equal(result.chat, '-1007');
  const next = await planFor(f, { mute: true, archive: true });
  assert.equal(next.phases[0].status, 'skipped');
  assert.equal(next.phases[1].status, 'unknown');
  await apply(f, next);
  assert.equal(f.writes.length, 2);
});
test('reviewed basic-group and channel leave require exact acknowledgements and never delete history', async () => {
  for (const kind of ['Chat', 'Channel']) {
    const f = followTelegramFixture();
    f.state.entity = { ...f.state.entity, className: kind };
    const plan = await planFor(f, { operation: 'leave' });
    assert.equal((await apply(f, plan)).ok, true);
    assert.equal(f.writes.length, 1);
    assert.equal(
      f.writes[0].className,
      kind === 'Chat' ? 'messages.DeleteChatUser' : 'channels.LeaveChannel'
    );
    assert.notEqual(f.writes[0].revokeHistory, true);
    assert.equal((await planFor(f, { operation: 'leave' })).code, 'not-member');
  }
  const f = followTelegramFixture();
  f.state.reply = () => ({ className: 'Updates', chats: [], updates: [] });
  const result = await apply(f, await planFor(f, { operation: 'leave' }));
  assert.equal(result.ok, false);
  assert.equal(result.results[0].status, 'unknown');
  assert.equal(f.writes.length, 1);
});
test('confirmation, expiry, account/alias/client changes and cancellation are checked before writes', async () => {
  for (const change of ['expiry', 'owner', 'alias', 'client', 'cancel']) {
    const f = followTelegramFixture();
    f.state.member = false;
    const plan = await planFor(f);
    assert.equal(
      (await f.actions.followTelegramApply({ planId: plan.planId })).code,
      'bad-request'
    );
    if (change === 'expiry') {
      f.state.now += 300001;
    }
    if (change === 'owner') {
      f.state.owner = '2';
    }
    if (change === 'alias') {
      f.state.entity.id = 8n;
    }
    if (change === 'client') {
      f.context.userClient = async () => ({ ...f.client });
    }
    if (change === 'cancel') {
      await f.actions.followTelegramCancel();
    }
    assert.equal((await apply(f, plan)).ok, false, change);
    assert.equal(f.writes.length, 0, change);
  }
});
test('shutdown owns startup and in-flight responses; cancellation preserves confirmed progress and stops later phases', async () => {
  const startup = followTelegramFixture();
  const opened = deferred();
  const release = deferred();
  startup.context.userClient = async () => {
    opened.resolve();
    await release.promise;
    return startup.client;
  };
  const reading = planFor(startup);
  await opened.promise;
  let ended = false;
  const stopping = startup.env.followTelegramStop().then(() => {
    ended = true;
  });
  await Promise.resolve();
  assert.equal(ended, false);
  release.resolve();
  assert.equal((await reading).code, 'stopped');
  await stopping;
  const f = followTelegramFixture();
  f.state.member = false;
  const issued = deferred();
  const response = deferred();
  f.state.reply = async () => {
    issued.resolve();
    await response.promise;
    return followUpdates(f.state.entity);
  };
  const writing = apply(f, await planFor(f, { mute: true }));
  await issued.promise;
  await f.actions.followTelegramCancel();
  response.resolve();
  const result = await writing;
  assert.equal(result.results[0].status, 'confirmed');
  assert.equal(result.results[1].code, 'cancelled');
  assert.equal(f.writes.length, 1);
});
test('failed durable intent storage prevents writes and last-moment account changes cannot publish', async () => {
  const f = followTelegramFixture();
  f.state.member = false;
  const plan = await planFor(f);
  f.store.put = async () => {
    throw new Error('disk unavailable');
  };
  const result = await apply(f, plan);
  assert.equal(result.results[0].code, 'storage-unavailable');
  assert.equal(f.writes.length, 0);
  const late = followTelegramFixture();
  late.state.member = false;
  const preview = await planFor(late);
  const put = late.store.put.bind(late.store);
  late.store.put = async (record) => {
    await put(record);
    late.state.owner = '2';
  };
  assert.equal((await apply(late, preview)).results[0].code, 'account-changed');
  assert.equal(late.writes.length, 0);
});

test('scoped dismissal never cancels another plan; empty preference operations are rejected', async () => {
  const f = followTelegramFixture();
  const old = await planFor(f, { mute: true });
  const current = await planFor(f, { archive: true });
  assert.equal(
    (await f.actions.followTelegramCancel({ planId: old.planId })).ok,
    true
  );
  assert.equal((await apply(f, old)).code, 'plan-expired');
  assert.equal((await apply(f, current)).ok, true);
  assert.equal(
    (await planFor(f, { operation: 'preferences' })).code,
    'bad-request'
  );
  assert.equal(
    (await f.actions.followTelegramPreview(null)).code,
    'bad-request'
  );
});

test('queue deadlines retain ownership of identity reads and never release shutdown early', async () => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const f = followTelegramFixture({
    queue: {
      run: (_key, _priority, use) => {
        const actual = Promise.resolve().then(use);
        return Promise.race([
          actual,
          Promise.reject(new Error('queue deadline')),
        ]);
      },
    },
  });
  f.state.beforeMe = async () => {
    entered.resolve();
    await release.promise;
  };
  const reading = f.actions.followTelegramList();
  await entered.promise;
  let stopped = false;
  const stopping = f.env.followTelegramStop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => globalThis.setImmediate(resolve));
  assert.equal(stopped, false);
  release.resolve();
  assert.equal((await reading).code, 'stopped');
  await stopping;
  assert.equal(f.writes.length, 0);
});

test('intent flush failures prevent RPCs; invitation receipts must match the previewed peer kind', async () => {
  const f = followTelegramFixture();
  f.store.flush = async () => {
    throw new Error('disk flush failed');
  };
  const plan = await planFor(f, { mute: true });
  assert.equal((await apply(f, plan)).results[1].code, 'storage-unavailable');
  assert.equal(f.writes.length, 0);
  const other = followTelegramFixture();
  other.state.member = false;
  other.state.reply = () => followUpdates({ className: 'Chat', id: 7n });
  const invite = await planFor(other, {
    target: 't.me/+AbC_123-xyz',
    mute: true,
  });
  const result = await apply(other, invite);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].code, 'outcome-unknown');
  assert.equal(other.writes.length, 1);
});

test('installed SDK resolves and serializes every Follow write with hidden retries disabled', async () => {
  const { importTelegram } = await import('../src/sources/telegram-layer.js');
  const sdk = await importTelegram();
  const f = followTelegramFixture();
  f.env.importer = async () => sdk;
  f.client.getInputEntity = async (value) =>
    value instanceof sdk.Api.InputUserSelf
      ? new sdk.Api.InputPeerSelf()
      : f.state.entity.className === 'Channel'
        ? new sdk.Api.InputPeerChannel({ channelId: 7n, accessHash: 10n })
        : new sdk.Api.InputPeerChat({ chatId: 7n });
  f.client.getPeerId = async (value) => String(value);
  f.client._getInputDialog = async (value) => value;
  f.client._getInputNotify = async (value) => value;
  const invoke = f.client.invoke;
  const serialized = [];
  const errors = [];
  f.client.invoke = async (request, dc, options) => {
    try {
      await request.resolve(f.client, sdk.utils);
      assert.ok(request.getBytes().length > 0);
    } catch (error) {
      errors.push(`${request.className}: ${error.message}`);
      throw error;
    }
    if (options) {
      assert.equal(dc, undefined);
      assert.equal(options.maxRetryCount, 0);
      assert.equal(options.floodSleepThreshold, 0);
      serialized.push(request.className);
    }
    return invoke(request);
  };
  f.state.member = false;
  const result = await apply(
    f,
    await planFor(f, { mute: true, archive: true })
  );
  assert.equal(result.ok, true, JSON.stringify({ result, errors }));
  assert.equal(
    (await apply(f, await planFor(f, { operation: 'leave' }))).ok,
    true
  );
  assert.deepEqual(serialized, [
    'channels.JoinChannel',
    'account.UpdateNotifySettings',
    'folders.EditPeerFolders',
    'channels.LeaveChannel',
  ]);
  f.state.entity = { className: 'Chat', id: 7n, title: 'Basic circle' };
  const basic = await apply(
    f,
    await planFor(f, { target: 't.me/+AbC_123-xyz' })
  );
  assert.equal(basic.ok, true, JSON.stringify({ basic, errors }));
  const left = await apply(
    f,
    await planFor(f, { target: '-7', operation: 'leave' })
  );
  assert.equal(left.ok, true, JSON.stringify({ left, errors }));
  assert.deepEqual(serialized.slice(4), [
    'messages.ImportChatInvite',
    'messages.DeleteChatUser',
  ]);
});

test('restricted participants remain members while kicked or view-banned participants do not', async () => {
  for (const [left, viewMessages, member] of [
    [false, false, true],
    [true, false, false],
    [false, true, false],
  ]) {
    const f = followTelegramFixture();
    f.state.read = (request) =>
      request.className === 'channels.GetParticipant'
        ? {
            participant: {
              className: 'ChannelParticipantBanned',
              left,
              bannedRights: { viewMessages, sendMessages: true },
            },
          }
        : undefined;
    const plan = await planFor(f, { mute: true });
    assert.equal(plan.target.member, member);
    assert.equal(plan.phases[0].status, member ? 'skipped' : 'ready');
    assert.equal(f.writes.length, 0);
  }
});
