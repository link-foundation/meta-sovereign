import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  membershipFixture,
  memberUpdates,
} from './helpers/telegram-membership.mjs';

test('temporary invite preview access is not membership and retains a join preview', async () => {
  const f = await membershipFixture(() => ({
    className: 'ChatInvitePeek',
    chat: memberUpdates().chats[0],
    expires: 2_000_000_000,
  }));
  const answer = await f.actions.checkChatInvite({ hash: 'PeekHash1234' });
  assert.equal(answer.already, false);
  assert.equal(answer.invite.title, 'Study circle');
  assert.equal(answer.invite.megagroup, true);
  assert.equal(
    answer.invite.members,
    null,
    'an unavailable member count is not zero'
  );
  assert.equal(f.calls.length, 1);
});

test('a missing invite check response is not a usable preview', async () => {
  const f = await membershipFixture(() => undefined);
  assert.equal(
    (await f.actions.checkChatInvite({ hash: 'PeekHash1234' })).ok,
    false
  );
});

test('direct and layer-232 join updates retain their chat and reach the live handler', async () => {
  for (const wrapped of [false, true]) {
    const updates = memberUpdates();
    const f = await membershipFixture(() =>
      wrapped
        ? { className: 'messages.ChatInviteJoinResultOk', updates }
        : updates
    );
    assert.deepEqual(await f.actions.joinChatInvite({ hash: 'FreshHash123' }), {
      ok: true,
      chat: '-1007',
    });
    assert.deepEqual(f.applied, [updates]);
  }
});

test('empty, left, ambiguous and web-view join responses never claim membership', async () => {
  const cases = [
    undefined,
    {},
    { className: 'Updates', updates: [], chats: [] },
    {
      ...memberUpdates(),
      chats: [{ ...memberUpdates().chats[0], left: true }],
    },
    {
      ...memberUpdates(),
      chats: [...memberUpdates().chats, ...memberUpdates(8n).chats],
    },
    {
      className: 'messages.ChatInviteJoinResultWebView',
      botId: 1n,
      queryId: 5n,
    },
  ];
  for (const result of cases) {
    const f = await membershipFixture(() => result);
    const answer = await f.actions.joinChatInvite({ hash: 'FreshHash123' });
    assert.equal(answer.ok, false);
    assert.equal(
      answer.code,
      result?.queryId ? 'join-web-view-required' : 'outcome-unknown'
    );
    assert.deepEqual(f.applied, []);
  }
});

test('recommended public joins require the exact requested typed chat', async () => {
  for (const response of [{}, memberUpdates(8n), memberUpdates(7n)]) {
    const f = await membershipFixture(() => response);
    const answer = await f.actions.similarJoin({ chat: '-1007' });
    assert.equal(answer.ok, response.chats?.[0]?.id === 7n);
    assert.equal(f.applied.length, answer.ok ? 1 : 0);
  }
});

test('mute uses InputNotifyPeer and false or missing acknowledgements do not update the list', async () => {
  for (const response of [false, undefined, {}, true]) {
    const f = await membershipFixture(() => response);
    const answer = await f.actions.dialogAction({
      chat: '-1007',
      action: 'mute',
    });
    assert.equal(f.calls[0].peer.className, 'InputNotifyPeer');
    assert.equal(f.calls[0].peer.peer.channelId, '7');
    assert.equal(answer.ok, response === true);
    assert.equal(f.applied.length, response === true ? 1 : 0);
  }
});

test('archive requires a valid Telegram acknowledgement before moving the list', async () => {
  for (const response of [false, undefined, {}, memberUpdates()]) {
    const f = await membershipFixture(() => response);
    const answer = await f.actions.dialogAction({
      chat: '-1007',
      action: 'archive',
    });
    assert.equal(answer.ok, response?.className === 'Updates');
    assert.equal(f.applied.length, answer.ok ? 2 : 0);
  }
});

test('lost join responses remain uncertain and explicit approval requests remain pending', async () => {
  for (const method of ['joinChatInvite', 'similarJoin']) {
    for (const pending of [false, true]) {
      const f = await membershipFixture(() => {
        throw pending
          ? Object.assign(new Error('INVITE_REQUEST_SENT'), {
              errorMessage: 'INVITE_REQUEST_SENT',
            })
          : new Error('connection closed after write');
      });
      const answer = await f.actions[method]({
        hash: 'FreshHash123',
        chat: '-1007',
      });
      assert.equal(answer.ok, false);
      assert.equal(
        answer.code,
        pending
          ? method === 'similarJoin'
            ? 'request-sent'
            : 'invite-request-sent'
          : 'outcome-unknown'
      );
      assert.equal(f.calls.length, 1, 'writes are never retried');
      assert.deepEqual(f.applied, []);
    }
  }
});
