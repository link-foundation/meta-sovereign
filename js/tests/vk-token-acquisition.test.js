import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { wrapSecretStore } from '../src/storage/secret-store.js';
import {
  createVkTokenAcquisition,
  VK_TOKEN_SECRET_ID,
} from '../src/sources/vk-token-acquisition.js';
import {
  parseVkTokenInput,
  isVkTokenRedirect,
} from '../src/sources/vk-token-input.js';
import { isVkTokenStatus } from '../src/transport/vk-token-status.js';
import { liveOptionsFrom } from '../src/sources/index.js';
import { loadBroadcastCredentials } from '../src/broadcast/credentials.js';
import {
  tokenFixtureValue as token,
  tokenInspection,
  waitForToken,
} from '../../experiments/issue-56/vk-token-fixture.mjs';

const redirect = `https://oauth.vk.com/blank.html#access_token=${token}&user_id=42&expires_in=0`;
const setup = (options = {}) => {
  const inner = createMemoryStore();
  const store = wrapSecretStore({ inner, passphrase: 'finite-fixture-secret' });
  const service = createVkTokenAcquisition({
    store,
    protectedStorage: true,
    inspect: async () => tokenInspection(),
    ...options,
  });
  return { inner, store, service };
};
const refusal = (fn, code) =>
  assert.throws(fn, (e) => e.code === code && !e.message.includes(token));

test('VK token parser accepts only bounded raw tokens or the exact standalone redirect', () => {
  assert.deepEqual(parseVkTokenInput(` ${token} `), { token });
  assert.deepEqual(parseVkTokenInput(redirect), { token, userId: '42' });
  for (const value of [
    'http://oauth.vk.com/blank.html',
    'https://oauth.vk.com:443/blank.html',
    'https://oauth.vk.com/a/../blank.html',
    'https://oauth.vk.com/blank.html?x=1',
    'https://oauth.vk.com.evil.invalid/blank.html',
    'https://user@oauth.vk.com/blank.html',
    'https://oauth.vk.com/blank.html/',
    'https://%6fauth.vk.com/blank.html',
    'http://localhost/callback',
    'file:///blank.html',
  ]) {
    assert.equal(isVkTokenRedirect(value), false);
    refusal(
      () => parseVkTokenInput(`${value}#access_token=${token}`),
      'invalid-token-redirect'
    );
  }
  for (const value of [
    '',
    'short',
    'a'.repeat(8193),
    `${redirect}&access_token=${token}`,
    `${redirect}&user_id=43`,
    redirect.replace('user_id=42', 'user_id=-42'),
  ]) {
    refusal(() => parseVkTokenInput(value), 'invalid-token-input');
  }
  refusal(
    () =>
      parseVkTokenInput(
        'https://oauth.vk.com/blank.html#error=access_denied&error_description=private'
      ),
    'authorization-refused'
  );
});

test('VK acquisition requires fresh confirmation and protected storage before effects', async () => {
  let opens = 0;
  const { service } = setup({
    protectedStorage: false,
    openAuthorization: () => {
      opens++;
    },
  });
  try {
    assert.equal(service.read().state, 'idle');
    refusal(() => service.start({}), 'confirmation-required');
    refusal(
      () => service.start({ confirm: true }),
      'protected-storage-required'
    );
    refusal(
      () => service.import({ confirm: true, value: token }),
      'protected-storage-required'
    );
    assert.equal(opens, 0);
  } finally {
    await service.close();
  }
});

test('VK import acknowledges encrypted storage without exposing a token or URL in receipts', async () => {
  const { service, inner, store } = setup();
  try {
    const started = service.import({ value: redirect, confirm: true });
    assert.equal(started.state, 'waiting');
    const result = await waitForToken(service);
    assert.equal(result.state, 'saved');
    assert.equal(isVkTokenStatus(result), true);
    assert.deepEqual(result.identity, {
      id: '42',
      name: 'Fixture User',
      messages: true,
      offline: true,
    });
    assert.equal(JSON.stringify(result).includes(token), false);
    const raw = await inner.get(VK_TOKEN_SECRET_ID);
    assert.equal(raw.value, undefined);
    assert.equal(typeof raw.enc, 'string');
    assert.equal(JSON.stringify(raw).includes(token), false);
    assert.equal((await store.get(VK_TOKEN_SECRET_ID)).value, token);
    await service.close();
    const restarted = createVkTokenAcquisition({
      store,
      protectedStorage: true,
    });
    assert.equal(restarted.read().state, 'idle');
    assert.equal((await store.get(VK_TOKEN_SECRET_ID)).value, token);
    await restarted.close();
  } finally {
    await service.close();
  }
});

test('VK validated user token replaces the credential used by live readers and publication', async () => {
  const { service, store } = setup();
  try {
    for (const key of ['user-token', 'access-token']) {
      await store.put({ id: `secret:vk:${key}`, value: `old_fixture_${key}` });
    }
    service.import({ value: token, confirm: true });
    assert.equal((await waitForToken(service)).state, 'saved');
    assert.equal((await liveOptionsFrom(store, 'vk')).token, token);
    assert.equal(
      (await loadBroadcastCredentials(store, 'vk')).userToken,
      token
    );
    assert.equal(
      (await store.get('secret:vk:access-token')).value,
      'old_fixture_access-token'
    );
  } finally {
    await service.close();
  }
});

for (const [verdict, code] of [
  ['invalid', 'invalid-user-token'],
  ['community', 'invalid-user-token'],
  ['messages', 'token-account-mismatch'],
]) {
  test(`VK ${verdict} validation refusal preserves the previous acknowledged token (${code})`, async () => {
    const { service, store } = setup({
      inspect: async () => ({ ...tokenInspection(), verdict }),
    });
    try {
      await store.put({
        id: VK_TOKEN_SECRET_ID,
        value: 'previous_fixture_token',
      });
      service.import({
        value: redirect.replace('user_id=42', 'user_id=43'),
        confirm: true,
      });
      const result = await waitForToken(service);
      assert.equal(result.state, 'failed');
      assert.equal(result.code, code);
      assert.equal(
        (await store.get(VK_TOKEN_SECRET_ID)).value,
        'previous_fixture_token'
      );
    } finally {
      await service.close();
    }
  });
}

test('VK refuses message capability truthfully while saving a valid user token', async () => {
  const { service } = setup({ inspect: async () => tokenInspection(false) });
  try {
    service.import({ value: token, confirm: true });
    const result = await waitForToken(service);
    assert.equal(result.code, 'saved-no-messages');
    assert.equal(result.identity.messages, false);
    assert.equal(isVkTokenStatus(result), true);
  } finally {
    await service.close();
  }
});

test(
  'VK acquisition uses only the three production read-only inspection methods',
  { timeout: 10000 },
  async () => {
    const calls = [];
    const { service } = setup({
      inspect: undefined,
      fetchImpl: async (value, options) => {
        const url = new URL(value);
        const method = url.pathname.split('/').at(-1);
        const input = new URLSearchParams(options.body);
        calls.push(method);
        assert.equal(url.origin, 'https://api.vk.ru');
        assert.equal(url.search, '');
        assert.equal(options.method, 'POST');
        assert.equal(input.get('access_token'), token);
        assert.ok(options.signal instanceof globalThis.AbortSignal);
        const response = {
          'users.get': [{ id: 42, first_name: 'Fixture', last_name: 'User' }],
          'account.getAppPermissions': 69632,
          'messages.getConversations': { count: 0, items: [] },
        };
        assert.ok(Object.hasOwn(response, method));
        if (method === 'messages.getConversations') {
          assert.equal(input.get('count'), '1');
        }
        return new globalThis.Response(
          JSON.stringify({ response: response[method] }),
          {
            headers: { 'content-type': 'application/json' },
          }
        );
      },
    });
    try {
      service.import({ value: token, confirm: true });
      const result = await waitForToken(service);
      assert.equal(result.code, 'saved');
      assert.equal(result.identity.messages, true);
      assert.equal(result.identity.offline, true);
      assert.deepEqual(calls, [
        'users.get',
        'account.getAppPermissions',
        'messages.getConversations',
      ]);
    } finally {
      await service.close();
    }
  }
);

test('VK failed flush restores acknowledged state and strips private failure details', async () => {
  const { service, store } = setup();
  try {
    await store.put({
      id: VK_TOKEN_SECRET_ID,
      value: 'previous_fixture_token',
    });
    store.flush = async () => {
      throw new Error(`disk refusal ${redirect}`);
    };
    service.import({ value: token, confirm: true });
    const result = await waitForToken(service);
    assert.equal(result.code, 'token-save-failed');
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.equal(
      (await store.get(VK_TOKEN_SECRET_ID)).value,
      'previous_fixture_token'
    );
  } finally {
    await service.close();
  }
});

const held = ({ signal }) =>
  new Promise((_resolve, reject) => {
    signal.throwIfAborted();
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    });
  });
for (const mode of ['window', 'validation']) {
  test(`VK ${mode} work is single-owner, cancellable and drained at close`, async () => {
    const { service, inner } = setup(
      mode === 'window' ? { openAuthorization: held } : { inspect: held }
    );
    try {
      const started =
        mode === 'window'
          ? service.start({ confirm: true })
          : service.import({ value: token, confirm: true });
      await waitForToken(
        service,
        (s) => s.state === (mode === 'window' ? 'waiting' : 'validating')
      );
      refusal(
        () => service.import({ value: token, confirm: true }),
        'authorization-busy'
      );
      await assert.rejects(
        service.cancel({ id: 'stale' }),
        (e) => e.code === 'authorization-not-current'
      );
      const stopped = await service.cancel({ id: started.id });
      assert.equal(stopped.state, 'cancelled');
      assert.equal(inner.size(), 0);
      if (mode === 'window') {
        service.start({ confirm: true });
      } else {
        service.import({ value: token, confirm: true });
      }
      await service.close();
      assert.equal(service.read().state, 'cancelled');
      refusal(
        () => service.import({ value: token, confirm: true }),
        'authorization-closed'
      );
    } finally {
      await service.close();
    }
  });
}

test('VK finite authorization deadline expires without saving', async () => {
  const { service, inner } = setup({ openAuthorization: held, deadlineMs: 10 });
  try {
    service.start({ confirm: true });
    assert.equal((await waitForToken(service)).code, 'authorization-expired');
    assert.equal(inner.size(), 0);
  } finally {
    await service.close();
  }
});

test('VK cancellation waits for an in-flight acknowledged write and reports saved truthfully', async () => {
  let release;
  let admitted;
  const writing = new Promise((resolve) => {
    admitted = resolve;
  });
  const { service, store } = setup();
  store.flush = async () => {
    admitted();
    await new Promise((resolve) => {
      release = resolve;
    });
  };
  try {
    const started = service.import({ value: token, confirm: true });
    await writing;
    let done = false;
    const cancel = service.cancel({ id: started.id }).then((value) => {
      done = true;
      return value;
    });
    await Promise.resolve();
    assert.equal(done, false);
    release();
    assert.equal((await cancel).state, 'saved');
    assert.equal((await store.get(VK_TOKEN_SECRET_ID)).value, token);
  } finally {
    release?.();
    await service.close();
  }
});

test('VK receipt validation rejects unknown secrets, mismatched state codes and malformed ownership', () => {
  const { service } = setup();
  const status = service.read();
  assert.equal(isVkTokenStatus(status), true);
  for (const value of [
    { ...status, token },
    { ...status, state: 'saved' },
    { ...status, id: '---' },
    { ...status, state: 'waiting' },
    { ...status, code: 'saved' },
    { ...status, capabilities: { ...status.capabilities, value: token } },
  ]) {
    assert.equal(isVkTokenStatus(value), false);
  }
});
