import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  saveTarget,
  normalizeTarget,
  selectTargets,
} from '../src/broadcast/targets.js';
import {
  credentialStatus,
  saveBroadcastCredentials,
} from '../src/broadcast/credentials.js';
import { createPublicationService } from '../src/broadcast/service.js';

const channel = (id = 'news', extra = {}) => ({
  id,
  label: id,
  network: 'telegram',
  kind: 'channel',
  destination: '@news_channel',
  ...extra,
});
const setup = async () => {
  const store = createMemoryStore();
  await saveBroadcastCredentials(store, 'telegram', {
    botToken: 'dummy-bot-secret',
  });
  await saveBroadcastCredentials(store, 'vk', { userToken: 'dummy-vk-secret' });
  await saveBroadcastCredentials(store, 'x', { accessToken: 'dummy-x-secret' });
  const calls = [];
  const resolveSource = (network) => ({
    live: {
      post() {
        throw new Error(
          'A public destination must never call the legacy DM method'
        );
      },
      async publishPost(content, options) {
        calls.push({ operation: 'publish', network, content, options });
        const intent = (
          await store.query((link) => link.id.startsWith('broadcast-run:'))
        ).at(-1);
        assert.ok(intent.results.some((entry) => entry.status === 'sending'));
        assert.ok(
          (await store.query((link) => link.id.startsWith('outbox:'))).some(
            (entry) => entry.status === 'sending'
          )
        );
        if (network === 'telegram') {
          return { ok: true, messageId: '41', chat: content.chat };
        }
        if (network === 'vk') {
          return { ownerId: options.ownerId, postId: '42' };
        }
        return { data: { id: '43' } };
      },
      async deletePost(receipt, options) {
        calls.push({ operation: 'delete', network, receipt, options });
        return { deleted: true };
      },
      async testConnection(options) {
        calls.push({ operation: 'test', network, options });
        return { ok: true, verified: true, permissionsVerified: false };
      },
    },
  });
  return {
    store,
    calls,
    resolveSource,
    service: createPublicationService({ store, resolveSource }),
  };
};

test(
  'shutdown waits for active publication receipts and refuses new writes',
  { timeout: 5000 },
  async () => {
    const { store, resolveSource } = await setup();
    await saveTarget(store, channel());
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const service = createPublicationService({
      store,
      resolveSource: (network) => {
        const source = resolveSource(network);
        const post = source.live.publishPost;
        source.live.publishPost = async (...args) => {
          entered.resolve();
          await release.promise;
          return post(...args);
        };
        return source;
      },
    });
    const plan = await service.prepare({ text: 'News', all: true });
    const sending = service.publish(plan.data);
    let finished = false;
    try {
      await entered.promise;
      const closing = service.close().then(() => {
        finished = true;
      });
      await nextTurn();
      assert.equal(
        finished,
        false,
        'shutdown cannot flush before provider receipt'
      );
      await assert.rejects(service.publish(plan.data), {
        code: 'publication-closed',
      });
      release.resolve();
      await closing;
      assert.equal((await sending).status, 'sent');
      assert.equal(
        (await store.get(`broadcast-run:${plan.data.requestId}`)).results[0]
          .receipt.messageIds[0],
        '41'
      );
      await assert.rejects(service.deletePublished({}), {
        code: 'publication-closed',
      });
    } finally {
      release.resolve();
      await sending;
      await service.close();
    }
  }
);

test('destinations validate kind, owner, mode, booleans and secrets before storage', async () => {
  const { store } = await setup();
  const saved = await saveTarget(store, channel());
  assert.equal(saved.id, 'broadcast-target:news');
  assert.ok(saved.version);
  for (const input of [
    null,
    { ...channel(), token: 'secret' },
    channel('bad', { format: 'markdown' }),
    channel('bad', { enabled: 'true' }),
    channel('bad', { network: 'constructor' }),
    channel('bad', { destination: 'https://t.me/news' }),
    {
      id: 'wall',
      label: 'wall',
      network: 'vk',
      kind: 'personal-wall',
      destination: '-12',
    },
  ]) {
    assert.throws(() => normalizeTarget(input), { code: 'bad-target' });
  }
  await assert.rejects(selectTargets(store, { targetIds: ['news', 'news'] }), {
    code: 'bad-target',
  });
  await saveTarget(store, channel('off', { enabled: false }));
  assert.equal((await selectTargets(store, { all: true })).length, 1);
  await assert.rejects(selectTargets(store, { targetIds: ['off'] }), {
    code: 'bad-target',
  });
});

test('credential presence is redacted and every value is validated before writes', async () => {
  const { store } = await setup();
  const state = await credentialStatus(store, 'x');
  assert.equal(state.fields.accessToken, true);
  assert.equal(JSON.stringify(state).includes('dummy-x-secret'), false);
  await assert.rejects(
    saveBroadcastCredentials(store, 'x', {
      apiKey: 'should-not-be-saved',
      apiKeySecret: 42,
    }),
    { code: 'bad-config' }
  );
  assert.equal(await store.get('secret:x:api-key'), null);
  await assert.rejects(saveBroadcastCredentials(store, 'constructor', {}), {
    code: 'bad-config',
  });
});

test('one shared plan publishes to every saved destination and retains exact receipts once', async () => {
  const { store, service, calls } = await setup();
  await saveTarget(store, channel('news', { format: 'html' }));
  await saveTarget(
    store,
    channel('team', { kind: 'group', destination: '-100123' })
  );
  await saveTarget(store, {
    id: 'wall',
    label: 'VK wall',
    network: 'vk',
    kind: 'community-wall',
    destination: '-12',
  });
  await saveTarget(store, {
    id: 'x',
    label: 'X account',
    network: 'x',
    kind: 'account',
  });
  const { preview, data } = await service.prepare({
    all: true,
    text: '<b>News</b>',
    requestId: 'one-publication',
  });
  assert.equal(preview.targets.length, 4);
  assert.equal(preview.bindings, undefined);
  assert.equal(JSON.stringify(preview).includes('dummy-'), false);
  assert.equal(preview.capabilities[0].mode, 'bot');
  const result = await service.publish(data);
  assert.equal(result.status, 'sent');
  assert.equal(result.counts.sent, 4);
  assert.deepEqual(result.results[0].receipt, {
    chat: '@news_channel',
    messageIds: ['41'],
  });
  assert.deepEqual(result.results[2].receipt, { ownerId: '-12', postId: '42' });
  assert.equal(result.results[3].receipt.id, '43');
  assert.equal(calls[0].content.format, 'html');
  assert.equal(calls[1].content.format, 'plain');
  assert.equal(new Set(calls.map((call) => call.content.clientId)).size, 4);
  assert.equal((await service.publish(data)).status, 'sent');
  assert.equal(calls.length, 4, 'same request never publishes twice');
  assert.equal(
    JSON.stringify(await service.history()).includes('dummy-'),
    false
  );
});

test('changed destination or credentials invalidates the whole preview before any send', async () => {
  const { store, service, calls } = await setup();
  await saveTarget(store, channel());
  const body = { targetIds: ['news'], text: 'News' };
  const first = await service.prepare(body);
  await saveTarget(store, channel('news', { destination: '@new_channel' }));
  await assert.rejects(service.publish(first.data), { code: 'stale-preview' });
  const second = await service.prepare(body);
  await saveBroadcastCredentials(store, 'telegram', {
    botToken: 'new-dummy-secret',
  });
  await assert.rejects(service.publish(second.data), { code: 'stale-preview' });
  assert.equal(calls.length, 0);
});

test(
  'concurrent requests cannot pass the preflight lock twice',
  { timeout: 5000 },
  async () => {
    const { store } = await setup();
    await saveTarget(store, channel());
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let started;
    const entered = new Promise((resolve) => {
      started = resolve;
    });
    let count = 0;
    const service = createPublicationService({
      store,
      resolveSource: () => ({
        live: {
          publishPost: async () => {
            count++;
            started();
            await held;
            return { messageId: '51', chat: '@news_channel' };
          },
        },
      }),
    });
    const { data } = await service.prepare({
      targetIds: ['news'],
      text: 'News',
    });
    const first = service.publish(data);
    await entered;
    try {
      await assert.rejects(service.publish(data), {
        code: 'publication-running',
      });
    } finally {
      release();
    }
    assert.equal((await first).status, 'sent');
    assert.equal(count, 1);
  }
);

test('uncertain provider writes keep unknown status and cannot replay', async () => {
  const { store } = await setup();
  await saveTarget(store, channel());
  let count = 0;
  const service = createPublicationService({
    store,
    resolveSource: () => ({
      live: {
        publishPost: async () => {
          count++;
          throw Object.assign(new Error('response lost'), { ambiguous: true });
        },
      },
    }),
  });
  const { data } = await service.prepare({ targetIds: ['news'], text: 'News' });
  assert.equal((await service.publish(data)).status, 'unknown');
  assert.equal((await service.publish(data)).status, 'unknown');
  assert.equal(count, 1);
  await assert.rejects(service.prepareDelete({ id: data.requestId }), {
    code: 'bad-publication',
  });
});

test('failed storage before send prevents writes; interrupted final storage never causes replay', async () => {
  const { store, resolveSource, calls } = await setup();
  await saveTarget(store, channel());
  await saveTarget(store, channel('later'));
  let reject = 'all';
  const failing = {
    ...store,
    put: async (link) => {
      if (
        link.id.startsWith('broadcast-run:') &&
        (reject === 'all' ||
          (reject === 'receipt' && link.results.some((r) => r.receipt)))
      ) {
        throw new Error('disk unavailable');
      }
      return store.put(link);
    },
  };
  const service = createPublicationService({ store: failing, resolveSource });
  const { data } = await service.prepare({ all: true, text: 'News' });
  await assert.rejects(service.publish(data), /disk unavailable/);
  assert.equal(calls.length, 0);
  reject = 'receipt';
  await assert.rejects(service.publish(data), /disk unavailable/);
  reject = '';
  const recovered = await service.publish(data);
  assert.equal(recovered.results[0].status, 'unknown');
  assert.equal(recovered.results[1].status, 'failed');
  assert.equal(recovered.results[1].code, 'interrupted-before-send');
  assert.equal(calls.length, 1);
});

test('deletion uses the stored destination and original Telegram user mode for every part', async () => {
  const { store, resolveSource } = await setup();
  await saveBroadcastCredentials(store, 'telegram', { botToken: '' });
  const target = await saveTarget(store, channel('news', { authMode: 'user' }));
  const deleted = [];
  let userSends = 0;
  const telegramAccount = {
    status: async () => ({ connected: true, kind: 'user' }),
    live: {
      post: async () => {
        userSends++;
        return {
          ok: true,
          chat: '-100321',
          parts: 2,
          messageId: '62',
          messageIds: ['61', '62'],
        };
      },
      deleteMessages: async (receipt) => {
        deleted.push(receipt);
        return { ok: true, deleted: receipt.ids.length };
      },
    },
    myProfile: async () => ({ ok: true, id: '101' }),
  };
  const service = createPublicationService({
    store,
    resolveSource,
    telegramAccount,
  });
  const { data } = await service.prepare({
    targetIds: [target.id],
    text: 'News',
  });
  const published = await service.publish(data);
  assert.equal(published.results[0].mode, 'user');
  await saveBroadcastCredentials(store, 'telegram', {
    botToken: 'now-configured-bot',
  });
  await store.delete(target.id);
  const deletion = await service.prepareDelete({ id: published.id });
  const result = await service.deletePublished(deletion.data);
  assert.equal(result.results[0].deletion.status, 'deleted');
  assert.deepEqual(deleted, [
    { chat: '-100321', ids: ['61', '62'], revoke: true },
  ]);
  assert.equal(userSends, 1);
  await assert.rejects(service.deletePublished(deletion.data), {
    code: 'stale-preview',
  });
});

test('identity tests are read-only and app-only X never claims user permission', async () => {
  const { store, service, calls } = await setup();
  await saveTarget(store, channel());
  assert.equal((await service.test('news')).verified, true);
  await saveBroadcastCredentials(store, 'x', {
    bearerToken: 'read-only-secret',
  });
  await saveTarget(store, {
    id: 'readonly',
    label: 'Read only',
    network: 'x',
    kind: 'account',
    authMode: 'app-only',
  });
  const result = await service.test('readonly');
  assert.equal(result.readOnly, true);
  assert.equal(result.verified, false);
  assert.equal(result.code, 'read-only-auth');
  assert.deepEqual(
    calls.map((call) => call.operation),
    ['test']
  );
});

test('provider diagnostics redact even an unlabelled credential in an error', async () => {
  const { store } = await setup();
  await saveTarget(store, channel());
  const service = createPublicationService({
    store,
    resolveSource: () => ({
      live: {
        publishPost: async () => {
          throw new Error('refused dummy-bot-secret');
        },
      },
    }),
  });
  const { data } = await service.prepare({ targetIds: ['news'], text: 'News' });
  const result = await service.publish(data);
  assert.equal(result.status, 'failed');
  assert.equal(JSON.stringify(result).includes('dummy-bot-secret'), false);
  assert.equal(
    JSON.stringify(
      await store.query((link) => link.id.startsWith('outbox:'))
    ).includes('dummy-bot-secret'),
    false
  );
});

test('uncertainty, rate limits and repeated refusals stop the whole publication batch', async () => {
  for (const [fault, maximum, reason] of [
    [{ ambiguous: true }, 1, 'unknown-send'],
    [{ code: 'rate-limited' }, 1, 'flood-wait'],
    [{ code: 'permission' }, 3, 'too-many-failures'],
  ]) {
    const { store } = await setup();
    for (let i = 0; i < 4; i++) {
      await saveTarget(store, channel(`news${i}`));
    }
    let writes = 0;
    const service = createPublicationService({
      store,
      resolveSource: () => ({
        live: {
          publishPost: async () => {
            writes++;
            throw Object.assign(new Error('fixture refusal'), fault);
          },
        },
      }),
    });
    const plan = await service.prepare({ all: true, text: 'News' });
    const result = await service.publish(plan.data);
    assert.equal(writes, maximum);
    assert.equal(result.stopped, reason);
    assert.equal(result.results.at(-1).code, 'batch-stopped');
    await service.publish(plan.data);
    assert.equal(writes, maximum, 'the stopped batch never resumes itself');
  }
});

test('missing deletion acknowledgement remains uncertain and retains its publication receipt', async () => {
  const { store, resolveSource } = await setup();
  await saveTarget(store, channel());
  let deletes = 0;
  const provider = resolveSource('telegram');
  provider.live.deletePost = async () => {
    deletes++;
    return {};
  };
  const service = createPublicationService({
    store,
    resolveSource: () => provider,
  });
  const plan = await service.prepare({ all: true, text: 'News' });
  const published = await service.publish(plan.data);
  const deletion = await service.prepareDelete({ id: published.id });
  const result = await service.deletePublished(deletion.data);
  assert.equal(result.results[0].deletion.status, 'unknown');
  assert.deepEqual(result.results[0].receipt, published.results[0].receipt);
  await assert.rejects(service.prepareDelete({ id: published.id }), {
    code: 'bad-publication',
  });
  assert.equal(deletes, 1);
});

test('diagnostics default off and explicitly enabled traces contain metadata only', async () => {
  const { store, resolveSource } = await setup();
  await saveTarget(store, channel());
  const logs = [];
  const service = createPublicationService({
    store,
    resolveSource,
    log: (event) => logs.push(event),
  });
  const ordinary = await service.prepare({
    all: true,
    text: 'Private message body',
  });
  assert.equal((await service.publish(ordinary.data)).events, undefined);
  assert.equal(
    logs.some((entry) => entry.event === 'publication'),
    false
  );
  const enabled = await service.prepare({
    all: true,
    text: 'Private message body',
    debug: true,
  });
  const result = await service.publish(enabled.data);
  assert.deepEqual(
    result.events.map((entry) => entry.status),
    ['prepared', 'sending', 'sent']
  );
  const metadata = JSON.stringify({ events: result.events, logs });
  assert.equal(metadata.includes('Private message body'), false);
  assert.equal(metadata.includes('dummy-bot-secret'), false);
  await assert.rejects(
    service.prepare({ all: true, text: 'News', debug: 'true' }),
    { code: 'bad-publication' }
  );
});
