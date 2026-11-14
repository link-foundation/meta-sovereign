import test from 'node:test';
import assert from 'node:assert/strict';
import { createVkLive } from '../src/sources/vk.js';

const transport = (response = { post_id: 71 }, options = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      method: new URL(url).pathname.split('/').at(-1),
      body: init.body,
    });
    const payload = response?.error ? response : { response };
    return new globalThis.Response(JSON.stringify(payload));
  };
  const live = createVkLive({
    token: 'example-user-token',
    fetchImpl,
    limiter: { wait: async () => {} },
    ...options,
  });
  return { live, calls };
};

test('VK publishes to a community wall with stable deduplication instead of sending a DM', async () => {
  const { live, calls } = transport();
  const result = await live.publishPost({
    text: 'Wall announcement',
    ownerId: '-42',
    clientId: 'draft-1',
  });
  assert.equal(result.postId, '71');
  assert.equal(result.ownerId, '-42');
  assert.equal(result.url, 'https://vk.com/wall-42_71');
  assert.equal(calls[0].method, 'wall.post');
  assert.equal(calls[0].body.get('owner_id'), '-42');
  assert.equal(calls[0].body.get('from_group'), '1');
  assert.equal(calls[0].body.get('guid'), 'draft-1');
  assert.equal(calls[0].body.has('peer_id'), false);
});

test('VK deletes the exact owner and post from a publication receipt', async () => {
  const { live, calls } = transport(1);
  const result = await live.deletePost({ ownerId: '-42', postId: '71' });
  assert.equal(result.deleted, true);
  assert.equal(calls[0].method, 'wall.delete');
  assert.equal(calls[0].body.get('owner_id'), '-42');
  assert.equal(calls[0].body.get('post_id'), '71');
});

test('VK refuses to claim a publication without a provider post ID', async () => {
  const { live, calls } = transport({});
  await assert.rejects(
    live.publishPost({ text: 'announcement', ownerId: '42' }),
    {
      code: 'send-unknown',
      ambiguous: true,
      safeToRetry: false,
    }
  );
  assert.equal(calls.length, 1);
});

test('VK personal walls keep personal authorship and allow an explicit token override', async () => {
  const { live, calls } = transport();
  await live.publishPost('Personal update', {
    ownerId: '42',
    token: 'other-user-token',
    clientId: 'draft-2',
  });
  assert.equal(calls[0].body.get('owner_id'), '42');
  assert.equal(calls[0].body.get('from_group'), '0');
  assert.equal(calls[0].body.get('access_token'), 'other-user-token');
  assert.equal(calls[0].body.get('guid'), 'draft-2');
});

test('VK does not infer a public wall from a DM target or accept invalid authorship', async () => {
  const { live, calls } = transport();
  for (const draft of [
    { chat: '42', text: 'not a wall' },
    { ownerId: '0', text: 'invalid owner' },
    { ownerId: '-42', fromGroup: 'false', text: 'invalid authorship flag' },
    { ownerId: '42', fromGroup: true, text: 'invalid identity' },
    {
      ownerId: '-42',
      fromGroup: false,
      signed: true,
      text: 'invalid signature',
    },
  ]) {
    await assert.rejects(live.publishPost(draft), { code: 'bad-target' });
  }
  await assert.rejects(live.publishPost({ ownerId: '42', text: ' ' }), {
    code: 'bad-draft',
  });
  await assert.rejects(live.deletePost({ ownerId: '-42', postId: 0 }), {
    code: 'bad-draft',
  });
  assert.equal(calls.length, 0);
});

test('VK community credentials are explicit and preserve actual provider permission errors', async () => {
  const { live, calls } = transport(
    { error: { error_code: 27, error_msg: 'Group authorization failed' } },
    { tokenType: 'community', ownerId: '-42' }
  );
  await assert.rejects(live.publishPost('News', { ownerId: '42' }), {
    code: 'auth-config',
  });
  await assert.rejects(live.publishPost('News'), { vkCode: 27 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.get('from_group'), '1');
  assert.deepEqual(live.authStatus(), {
    tokenType: 'community',
    configured: true,
    permissionsVerified: false,
  });
  assert.doesNotMatch(JSON.stringify(live.authStatus()), /example-user-token/);
});

test('VK probes account identity without publishing or claiming wall permissions', async () => {
  const { live, calls } = transport([{ id: 42 }]);
  assert.deepEqual(await live.testConnection(), {
    ok: true,
    verified: true,
    configured: true,
    tokenType: 'user',
    identityId: '42',
    permissionsVerified: false,
  });
  assert.equal(calls[0].method, 'users.get');
  const group = transport(
    { groups: [{ id: 42 }] },
    { tokenType: 'community', ownerId: '-42' }
  );
  assert.equal((await group.live.testConnection()).identityId, '-42');
  assert.equal(group.calls[0].method, 'groups.getById');
  assert.equal(group.calls[0].body.get('group_id'), '42');
  const mismatch = transport([{ id: 43 }], {
    tokenType: 'community',
    ownerId: '-42',
  });
  await assert.rejects(mismatch.live.testConnection(), {
    code: 'bad-response',
  });
});

test('VK missing and negative deletion receipts stay distinct and never retry', async () => {
  for (const response of [null, {}, 0, false]) {
    const { live, calls } = transport(response);
    await assert.rejects(live.deletePost({ ownerId: '42', postId: '71' }), {
      code:
        response === 0 || response === false ? 'not-deleted' : 'send-unknown',
    });
    assert.equal(calls.length, 1);
  }
});

test('VK an uncertain publication is not replayed after a connection loss', async () => {
  let calls = 0;
  const { live } = transport(null, {
    fetchImpl: async () => {
      calls += 1;
      throw new Error('connection lost');
    },
  });
  await assert.rejects(live.publishPost('News', { ownerId: '-42' }), {
    ambiguous: true,
    safeToRetry: false,
  });
  assert.equal(calls, 1);
});
