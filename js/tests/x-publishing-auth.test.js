import test from 'node:test';
import assert from 'node:assert/strict';
import { createXLive } from '../src/sources/x.js';
import { xOAuthHeader } from '../src/sources/x-oauth.js';

const credentials = {
  apiKey: 'consumer',
  apiKeySecret: 'consumer-secret',
  accessToken: 'user-token',
  accessTokenSecret: 'user-secret',
};

const transport = (body = { data: { id: '123' } }) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new globalThis.Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetchImpl };
};

test('X legacy user credentials sign a public post instead of requiring a bearer token', async () => {
  const { fetchImpl, calls } = transport();
  const live = createXLive({ ...credentials, fetchImpl });
  const result = await live.publishPost({ text: 'legacy user post' });
  assert.equal(result.data.id, '123');
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.headers.Authorization, /^OAuth /);
  assert.match(calls[0].init.headers.Authorization, /oauth_signature=/);
  assert.equal(calls[0].url.pathname, '/2/tweets');
});

test('X app-only credentials reject writes before making an HTTP request', async () => {
  const { fetchImpl, calls } = transport();
  const live = createXLive({
    authMode: 'app-only',
    token: 'application-token',
    fetchImpl,
  });
  await assert.rejects(live.publishPost('news'), {
    code: 'read-only-auth',
  });
  await assert.rejects(live.sendMessage({ chat: '1-2', text: 'hello' }), {
    code: 'read-only-auth',
  });
  await assert.rejects(live.deleteMessages({ ids: ['1'] }), {
    code: 'read-only-auth',
  });
  assert.equal(calls.length, 0);
});

test('X publishing without a provider receipt remains unknown and is never retried', async () => {
  const { fetchImpl, calls } = transport({ data: { text: 'accepted?' } });
  const live = createXLive({ token: 'user-token', fetchImpl });
  await assert.rejects(live.publishPost('news'), {
    code: 'send-unknown',
    ambiguous: true,
    outcome: 'unknown',
    safeToRetry: false,
  });
  assert.equal(calls.length, 1);
});

test('OAuth signing matches corrected RFC 5849 POST vector, including duplicate and empty form/query fields', async () => {
  // RFC 5849 §3.4.1.1 with VERIFIED erratum 2550: the printed bYT5...
  // signature was for GET; r6/T... is the corrected POST signature.
  const header = await xOAuthHeader({
    method: 'POST',
    url: 'http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b',
    form: 'c2&a3=2+q',
    apiKey: '9djdj82h48djs9d2',
    apiKeySecret: 'j49sk3j29djd',
    accessToken: 'kkk9d7dh3k39sjv7',
    accessTokenSecret: 'dh893hdasih9',
    nonce: '7d8f3e4a',
    timestamp: 137131201,
  });
  assert.match(
    header,
    /oauth_signature="r6%2FTJjbCOr97%2F%2BUU0NsvSne7s5g%3D"/
  );
  assert.doesNotMatch(header, /j49sk3|dh893|oauth_version/);
});

test('OAuth signs the final read query and excludes JSON post bodies', async () => {
  const { fetchImpl, calls } = transport({ data: [] });
  const live = createXLive({ ...credentials, fetchImpl });
  await live.pullMessages({ mode: 'mentions', userId: '123', limit: 5 });
  const call = calls[0];
  const parameters = Object.fromEntries(
    call.init.headers.Authorization.slice(6)
      .split(', ')
      .map((pair) => {
        const [key, value] = pair.split('=');
        return [key, decodeURIComponent(value.slice(1, -1))];
      })
  );
  assert.equal(call.url.searchParams.get('max_results'), '5');
  const expected = await xOAuthHeader({
    ...credentials,
    url: call.url,
    nonce: parameters.oauth_nonce,
    timestamp: parameters.oauth_timestamp,
  });
  assert.equal(call.init.headers.Authorization, expected);
  const json = await xOAuthHeader({
    ...credentials,
    url: 'https://api.x.com/2/tweets',
    method: 'POST',
    nonce: 'fixed',
    timestamp: 123,
    body: { text: 'excluded from the OAuth parameter set' },
  });
  assert.equal(
    json,
    await xOAuthHeader({
      ...credentials,
      url: 'https://api.x.com/2/tweets',
      method: 'POST',
      nonce: 'fixed',
      timestamp: 123,
    })
  );
});

test('OAuth 2.0 user access tokens need no client secret or token secret', async () => {
  const { fetchImpl, calls } = transport();
  const live = createXLive({ accessToken: 'oauth2-user-token', fetchImpl });
  assert.deepEqual(live.authStatus(), {
    mode: 'oauth2-user',
    configured: true,
    readOnly: false,
    missing: [],
  });
  await live.publishPost('news');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer oauth2-user-token');
});

test('authentication status exposes missing field names and never credential values', async () => {
  const { fetchImpl, calls } = transport();
  const live = createXLive({
    apiKey: 'private-consumer-key',
    token: 'user-token',
    fetchImpl,
  });
  assert.deepEqual(live.authStatus(), {
    mode: 'oauth1-user',
    configured: false,
    readOnly: false,
    missing: ['apiKeySecret', 'accessTokenSecret'],
  });
  await assert.rejects(live.publishPost('news'), { code: 'auth-config' });
  assert.equal(
    calls.length,
    0,
    'incomplete legacy credentials cannot silently fall back'
  );
  assert.doesNotMatch(
    JSON.stringify(live.authStatus()),
    /private-consumer-key|user-token/
  );
  assert.throws(() => live.authStatus({ authMode: 'mystery' }), {
    code: 'auth-config',
  });
});

test('explicit modes and per-request credentials override automatic selection', async () => {
  const { fetchImpl, calls } = transport();
  const live = createXLive({
    ...credentials,
    bearerToken: 'app-token',
    fetchImpl,
  });
  await live.publishPost('user', {
    authMode: 'oauth2-user',
    token: 'other-user',
  });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer other-user');
  await assert.rejects(live.publishPost('app', { authMode: 'app-only' }), {
    code: 'read-only-auth',
  });
  assert.equal(calls.length, 1);
  assert.equal(live.authStatus().mode, 'oauth1-user');
});

test('app-only public reads are allowed without pretending to verify a user connection', async () => {
  const { fetchImpl, calls } = transport({ data: [] });
  const live = createXLive({ bearerToken: 'app-token', fetchImpl });
  assert.deepEqual(live.authStatus(), {
    mode: 'app-only',
    configured: true,
    readOnly: true,
    missing: [],
  });
  await live.pullMessages({ mode: 'mentions', userId: '123' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer app-token');
  await assert.rejects(live.testConnection(), { code: 'read-only-auth' });
  assert.equal(calls.length, 1);
});

test('user connectivity probes read identity without publishing anything', async () => {
  const { fetchImpl, calls } = transport({ data: { id: '123' } });
  const live = createXLive({ ...credentials, fetchImpl });
  const result = await live.testConnection();
  assert.equal(result.verified, true);
  assert.equal(result.userId, '123');
  assert.equal(calls[0].url.pathname, '/2/users/me');
  assert.equal(calls[0].init.method ?? 'GET', 'GET');
  assert.match(calls[0].init.headers.Authorization, /^OAuth /);
  assert.doesNotMatch(
    JSON.stringify(result),
    /consumer-secret|user-token|user-secret/
  );
});

test('deletion requires an explicit positive provider receipt and a valid post ID', async () => {
  for (const [body, error] of [
    [{ data: { deleted: true } }, null],
    [{ data: { deleted: false } }, { code: 'not-deleted' }],
    [{ data: {} }, { code: 'send-unknown', ambiguous: true }],
  ]) {
    const { fetchImpl, calls } = transport(body);
    const live = createXLive({ ...credentials, fetchImpl });
    if (error) {
      await assert.rejects(live.deletePost('123'), error);
    } else {
      assert.equal((await live.deletePost({ id: '123' })).data.deleted, true);
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/2/tweets/123');
    assert.equal(calls[0].init.method, 'DELETE');
    assert.match(calls[0].init.headers.Authorization, /^OAuth /);
    await assert.rejects(live.deletePost('../other'), { code: 'bad-draft' });
    assert.equal(calls.length, 1);
  }
});

test('app-only post deletion is rejected without a request', async () => {
  const { fetchImpl, calls } = transport();
  const live = createXLive({ bearerToken: 'app-token', fetchImpl });
  await assert.rejects(live.deletePost('123'), { code: 'read-only-auth' });
  assert.equal(calls.length, 0);
});

test('lost X write responses are uncertain and cannot trigger an automatic retry', async () => {
  let attempts = 0;
  const live = createXLive({
    ...credentials,
    fetchImpl: async () => {
      attempts++;
      throw new Error('connection closed');
    },
  });
  await assert.rejects(live.publishPost('news'), {
    ambiguous: true,
    safeToRetry: false,
  });
  assert.equal(attempts, 1);
});

test('X diagnostics default off and never include secrets, destinations or message text', async () => {
  const entries = [];
  const { fetchImpl } = transport();
  const configuration = {
    ...credentials,
    fetchImpl,
    debugLog: (entry) => entries.push(entry),
  };
  await createXLive({ ...configuration, debug: false }).publishPost(
    'private draft'
  );
  assert.deepEqual(entries, []);
  await createXLive({ ...configuration, debug: true }).publishPost(
    'private draft'
  );
  assert.deepEqual(entries, [
    { event: 'x.request', phase: 'begin', method: 'POST', mode: 'oauth1-user' },
    {
      event: 'x.request',
      phase: 'response',
      method: 'POST',
      mode: 'oauth1-user',
    },
  ]);
  const serialized = JSON.stringify(entries);
  for (const secret of [
    ...Object.values(credentials),
    'private draft',
    'Authorization',
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});
