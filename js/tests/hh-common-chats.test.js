import test from 'node:test';
import assert from 'node:assert/strict';
import { hhCommonFixture } from '../../experiments/issue-56/hh-common-fixture.mjs';
import { createHhLive } from '../src/sources/hh.js';
import { pullLiveInto } from '../src/sources/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';
import { loadPullState } from '../src/sources/pull-runner.js';
import { learnSavedAnswers } from '../src/automation/question-store.js';

const setup = () => {
  const fake = hhCommonFixture();
  const store = withMessageVersions(createMemoryStore());
  const live = createHhLive({ ...fake, token: 'fixture-token' });
  const pull = (options = {}) =>
    pullLiveInto(store, 'hh', { live, limit: 2, ...options });
  return { fake, store, live, pull };
};

test('default HH live reads actual paginated history, not negotiation collections or chat-card previews', async () => {
  const { fake, store, pull } = setup();
  const result = await pull();
  assert.equal(result.imported, 5);
  assert.deepEqual(result.history, {
    scope: 'available-api-history',
    status: 'complete',
    reason: null,
    messagesRead: 5,
    chatsRead: 2,
    requests: 5,
  });
  assert.equal(result.nextCursor, undefined);
  assert.equal(fake.calls[0].path, '/me');
  assert.deepEqual(
    fake.calls
      .filter((c) => c.path === '/common/chats')
      .map((c) => c.query.page),
    ['0', '1']
  );
  assert.equal(
    fake.calls.some(
      (c) => c.path.includes('negotiations') || c.method !== 'GET'
    ),
    false
  );
  assert.equal((await store.get('msg:hh:chat:41:1')).outgoing, false);
  assert.equal((await store.get('msg:hh:chat:41:2')).outgoing, true);
  assert.equal((await store.get('msg:hh:chat:41:2')).delivery, 'sent');
  assert.equal((await store.get('msg:hh:chat:41:1')).delivery, undefined);
  assert.equal((await store.get('read:hh:chat:41')).unreadCount, 1);
  assert.equal((await store.get('read:hh:chat:41')).hhLatestMessageId, '3');
  assert.equal((await store.get('msg:hh:chat:41:3')).service, true);
  assert.deepEqual((await store.get('msg:hh:chat:42:1')).attachments, [
    {
      kind: 'file',
      name: 'Brief.pdf',
      url: 'https://hh.invalid/brief.pdf',
      mimeType: 'application/pdf',
    },
  ]);
  assert.equal((await store.get('msg:hh:chat:41:2')).hhChat.writeAllowed, true);
  const learned = await learnSavedAnswers(store);
  assert.equal(learned.rules.length, 1);
  assert.equal(learned.rules[0].answers[0].text, 'Vietnam.');
  assert.equal(learned.rules[0].answers[0].approved, false);
});

test('bounded HH reads resume the inclusive boundary after storage and count observed turns once', async () => {
  const { store, fake, pull } = setup();
  const first = await pull({ maxRequests: 2 });
  assert.equal(first.imported, 2);
  assert.equal(first.history.status, 'partial');
  assert.equal(first.history.chatsRead, 0);
  assert.equal(first.nextCursor.cursor.active.start, '2');
  const resumed = await pull();
  assert.equal(resumed.history.status, 'complete');
  assert.equal(resumed.history.messagesRead, 5);
  assert.equal(
    fake.calls.filter((c) => c.query.start_message_id === '2').length,
    1
  );
  assert.equal((await loadPullState(store, 'hh')).hhHistory.cursor, null);
  await pull();
  assert.equal((await learnSavedAnswers(store)).rules[0].answers[0].count, 1);
  fake.chats.get('41')[1].payload.text = 'Thailand.';
  fake.chats.get('41')[1].last_change_time = '2026-11-10T12:00:00+0000';
  await pull();
  assert.equal(
    (await learnSavedAnswers(store)).rules[0].answers[0].text,
    'Thailand.'
  );
  assert.equal(
    (await messageVersions(store, 'msg:hh:chat:41:2')).versions.length,
    2
  );
});

test('failed storage cannot advance an HH history cursor', async () => {
  const { store, pull } = setup();
  const putMany = store.putMany.bind(store);
  store.putMany = async () => {
    throw new Error('disk fixture refused write');
  };
  await assert.rejects(pull({ maxRequests: 2 }), /disk fixture/u);
  assert.equal((await loadPullState(store, 'hh')).hhHistory, undefined);
  store.putMany = putMany;
  assert.equal((await pull()).history.messagesRead, 5);
});

test('HH continuation resets for a changed account; an explicit foreign cursor is refused', async () => {
  const { fake, live, pull } = setup();
  const first = await pull({ maxRequests: 2 });
  fake.state.accountId = 'another-account';
  await assert.rejects(
    live.pullMessages({ cursor: first.nextCursor }),
    /another account/u
  );
  const result = await pull({ maxRequests: 2 });
  assert.equal(result.nextCursor.accountId, 'another-account');
  assert.equal(result.history.messagesRead, 2);
  assert.equal(fake.calls.at(-1).query.start_message_id, undefined);
});

test('HH current-participant flags determine direction for employer accounts; unknown flags never become outgoing', async () => {
  const { fake, store, pull } = setup();
  fake.chats.get('41')[0].sender_display_info = {
    name: 'Employer',
    role: 'EMPLOYER',
    is_current_participant: true,
  };
  delete fake.chats.get('41')[1].sender_display_info.is_current_participant;
  await pull();
  assert.equal((await store.get('msg:hh:chat:41:1')).outgoing, true);
  assert.equal((await store.get('msg:hh:chat:41:2')).outgoing, undefined);
  assert.equal((await learnSavedAnswers(store)).rules.length, 0);
});

test('HH write refusal preserves blocked metadata and actual history without a block reason', async () => {
  const { fake, store, pull } = setup();
  fake.state.writeAllowed = false;
  await pull();
  assert.equal((await store.get('msg:hh:chat:41:1')).blocked, true);
  assert.equal(
    (await store.get('msg:hh:chat:41:1')).hhChat.writeAllowed,
    false
  );
  assert.equal((await learnSavedAnswers(store)).rules.length, 1);
});

test('HH rejects mismatched chats, missing message IDs, repeated cursors and missing pagination before storage', async () => {
  for (const patch of [
    (value) => (value.messages ? { ...value, id: 'other-chat' } : value),
    (value) =>
      value.messages
        ? { ...value, messages: [{ ...value.messages[0], id: null }] }
        : value,
    (value, call) =>
      value.messages && call.query.start_message_id
        ? { ...value, messages: [value.messages[0]], has_more: true }
        : value,
    (value) => (value.items ? { items: value.items } : value),
  ]) {
    const { fake, store, pull } = setup();
    fake.state.transform = patch;
    await assert.rejects(
      pull(),
      (error) => error.code === 'invalid-history' && error.fallback === false
    );
    assert.deepEqual(await store.query(), []);
  }
});

test('HH refuses invalid read limits before making provider calls', async () => {
  for (const options of [
    { limit: 1 },
    { limit: 51 },
    { maxRequests: 0 },
    { maxRequests: 51 },
  ]) {
    const { fake, pull } = setup();
    await assert.rejects(pull(options), /read limit/u);
    assert.equal(fake.calls.length, 0);
  }
});

test('HH reports the documented list window as limited rather than complete', async () => {
  const { fake, pull } = setup();
  fake.state.transform = (value) =>
    value.items
      ? { ...value, items: [{ id: '41' }], pages: 52, found: 1040 }
      : value;
  const first = await pull({ maxRequests: 50 });
  assert.equal(first.history.status, 'partial');
  const last = await pull({ maxRequests: 50 });
  assert.equal(last.history.status, 'limited');
  assert.equal(last.history.reason, 'provider-window');
  assert.equal(last.history.chatsRead, 1);
  assert.equal(
    fake.calls.some((call) => Number(call.query.page) > 50),
    false
  );
});

test('a changing HH chat list never becomes a full-history claim', async () => {
  const { fake, pull } = setup();
  fake.state.transform = (value) =>
    value.items ? { ...value, items: [{ id: '41' }] } : value;
  const result = await pull();
  assert.equal(result.history.status, 'limited');
  assert.equal(result.history.reason, 'changed-list');
  assert.equal(result.nextCursor, undefined);
});

test('HH imported chat replies use the common-chat endpoint, a UUID and a positive receipt', async () => {
  const { fake, live } = setup();
  const key = 'b0250ec2-4ce0-4a50-a8a2-2f559fcf1bf1';
  const receipt = await live.post({
    chat: 'chat:41',
    text: 'Thanks.',
    clientId: key,
  });
  assert.equal(receipt.messageId, 'sent-56');
  assert.equal(receipt.link.id, 'msg:hh:chat:41:sent-56');
  assert.equal(receipt.link.chatName, 'Vacancy 41');
  assert.equal(receipt.link.delivery, 'sent');
  assert.deepEqual(
    fake.calls.map((c) => [c.method, c.path]),
    [
      ['GET', '/common/chats/41/messages'],
      ['POST', '/common/chats/41/messages'],
    ]
  );
  assert.deepEqual(fake.calls.at(-1).body, {
    text: 'Thanks.',
    idempotency_key: key,
  });
  fake.state.writeAllowed = false;
  await assert.rejects(
    live.post({ chat: 'chat:41', text: 'No send.' }),
    /accepts messages/u
  );
  assert.equal(fake.calls.filter((c) => c.method === 'POST').length, 1);
});

test('HH replies preserve the verified opaque message ID and refuse disabled targets', async () => {
  const { fake, live, pull, store } = setup();
  const parentId = 'parent:1';
  const parent = fake.chats.get('41')[0];
  parent.id = parentId;
  const content = { chat: 'chat:41', text: 'Thanks.', replyTo: parentId };
  await assert.rejects(
    live.post(content, {
      beforeIssue: () => {
        throw Object.assign(new Error('Owner stopped'), { code: 'stopped' });
      },
    }),
    { code: 'stopped' }
  );
  assert.deepEqual(
    fake.calls.splice(0).map(({ method }) => method),
    ['GET']
  );
  const receipt = await live.post(content);
  assert.equal(receipt.link.replyTo, 'msg:hh:chat:41:parent:1');
  assert.equal(fake.calls[0].query.start_message_id, parentId);
  assert.equal(fake.calls[1].body.reply_to_message_id, parentId);

  fake.chats.get('41')[1].reply_to = { message_id: parentId };
  await pull();
  assert.equal(
    (await store.get('msg:hh:chat:41:2')).replyTo,
    'msg:hh:chat:41:parent:1'
  );

  parent.can_reply = false;
  await assert.rejects(live.post(content), { code: 'unsupported' });
  await assert.rejects(live.post({ ...content, chat: '41' }), {
    code: 'unsupported',
  });
  await assert.rejects(live.post({ ...content, replyTo: 1 }), {
    code: 'unsupported',
  });
  assert.equal(fake.calls.filter((c) => c.method === 'POST').length, 1);
});

test('HH edits and removes one exact owned message in the common chat', async () => {
  const { fake, live, pull, store } = setup();
  fake.chats.get('41')[1].id = 'answer:2/part';
  await pull();
  const link = await store.get('msg:hh:chat:41:answer:2/part');
  const { chat, messageId: id } = link;
  const edit = { chat, id, link, text: 'I live in Hanoi.' };
  fake.calls.length = 0;
  const updated = await live.editMessage(edit);
  assert.equal(updated.messageId, id);
  assert.equal(fake.chats.get('41')[1].payload.text, edit.text);
  assert.deepEqual(fake.calls[0].query, {
    order: 'next',
    limit: '1',
    start_message_id: id,
  });
  assert.deepEqual(fake.calls[1], {
    path: '/common/chats/41/messages/answer%3A2%2Fpart',
    method: 'PUT',
    query: {},
    body: { text: edit.text },
  });
  const remove = { chat, ids: [id], links: [link], revoke: true };
  assert.deepEqual(await live.deleteMessages(remove), { messageId: id });
  assert.equal(
    fake.chats.get('41').some((message) => message.id === id),
    false
  );
  assert.equal(fake.calls.at(-1).method, 'DELETE');
  assert.equal(fake.calls.at(-1).path, fake.calls[1].path);
});

test('HH message mutations refuse stale text, revoked ownership, an unsupported scope and uncertain receipts', async () => {
  const { fake, live, pull, store } = setup();
  await pull();
  const link = await store.get('msg:hh:chat:41:2');
  const edit = { chat: link.chat, id: '2', text: 'New text', link };
  const remove = { chat: link.chat, ids: ['2'], links: [link], revoke: true };
  const message = fake.chats.get('41')[1];
  fake.calls.length = 0;
  await assert.rejects(live.deleteMessages({ ...remove, revoke: false }), {
    code: 'unsupported-action',
  });
  await assert.rejects(live.deleteMessages({ ...remove, ids: ['2', '1'] }), {
    code: 'unsupported-action',
  });
  await assert.rejects(live.editMessage({ ...edit, chat: '41' }), {
    code: 'unsupported-action',
  });
  assert.deepEqual(fake.calls, []);
  message.can_edit = false;
  await assert.rejects(live.editMessage(edit), { code: 'unsupported-action' });
  message.can_edit = true;
  message.payload.text = 'Changed in HeadHunter';
  await assert.rejects(live.editMessage(edit), { code: 'history-changed' });
  message.payload.text = link.body;
  message.sender_display_info.is_current_participant = false;
  await assert.rejects(live.deleteMessages(remove), {
    code: 'unsupported-action',
  });
  assert.equal(
    fake.calls.every((call) => call.method === 'GET'),
    true
  );
  message.sender_display_info.is_current_participant = true;
  fake.state.mutationStatus = 200;
  await assert.rejects(live.editMessage(edit), { ambiguous: true });
  await assert.rejects(live.deleteMessages(remove), { ambiguous: true });
  assert.deepEqual(
    fake.calls
      .filter((call) => call.method !== 'GET')
      .map((call) => call.method),
    ['PUT', 'DELETE']
  );
});

const readFixture = ({ count = 0, latest = 'm:9', receipt = 204 } = {}) => {
  const calls = [];
  const live = createHhLive({
    token: 'fixture-token',
    baseUrl: 'https://hh.invalid',
    fetchImpl: async (url, init) => {
      const { pathname, search } = new URL(url);
      calls.push([init.method, pathname, search]);
      if (init.method === 'PUT') {
        return new globalThis.Response(null, { status: receipt });
      }
      return globalThis.Response.json({
        id: 'a/b',
        unread_message_count: calls.length === 1 ? 2 : count,
        messages: [{ id: latest }],
      });
    },
  });
  return { calls, live };
};

test('HH marks the provider message and rereads the count instead of assuming zero', async () => {
  const { calls, live } = readFixture({ count: 1 });
  const result = await live.markRead({ chat: 'chat:a/b', id: 'm:9' });
  assert.equal(result.read, true);
  assert.equal(result.messageId, 'm:9');
  assert.equal(result.readState.unreadCount, 1);
  assert.equal(result.readState.hhLatestMessageId, 'm:9');
  assert.deepEqual(calls, [
    ['GET', '/common/chats/a%2Fb/messages', '?order=prev&limit=1'],
    ['PUT', '/common/chats/a%2Fb/message/m%3A9/read', ''],
    ['GET', '/common/chats/a%2Fb/messages', '?order=prev&limit=1'],
  ]);
});

test('HH refuses to mark newly arrived history beyond the displayed message', async () => {
  const { calls, live } = readFixture();
  await assert.rejects(live.markRead({ chat: 'chat:a/b', id: 'older' }), {
    code: 'history-changed',
    fallback: false,
  });
  assert.deepEqual(
    calls.map(([method]) => method),
    ['GET']
  );
});

test('HH reports uncertain read acknowledgement without re-opening the chat', async () => {
  const { calls, live } = readFixture({ receipt: 200 });
  await assert.rejects(live.markRead({ chat: 'chat:a/b' }), {
    ambiguous: true,
  });
  assert.deepEqual(
    calls.map(([method]) => method),
    ['GET', 'PUT']
  );
});

test('HH missing send receipts stay ambiguous and are never replayed', async () => {
  const { fake, live } = setup();
  fake.state.receipt = {};
  await assert.rejects(
    live.post({ chat: 'chat:41', text: 'Check delivery.' }),
    (error) => error.ambiguous === true && error.fallback === false
  );
  assert.equal(fake.calls.filter((c) => c.method === 'POST').length, 1);
  for (const extra of [{ attachments: [{}] }, { replyTo: 'message' }]) {
    await assert.rejects(
      live.post({ chat: 'chat:41', text: 'Unsupported.', ...extra }),
      { code: 'unsupported' }
    );
  }
  assert.equal(fake.calls.filter((c) => c.method === 'POST').length, 1);
});
