// A public-post lifecycle with fake credentials and an in-memory HTTP provider.
// Run: node examples/x-publishing-auth.mjs. No request leaves this process.
import assert from 'node:assert/strict';
import { createXLive } from '../js/src/sources/x.js';

const calls = [];
const live = createXLive({
  apiKey: 'example-api-key',
  apiKeySecret: 'example-api-secret',
  accessToken: 'example-user-token',
  accessTokenSecret: 'example-user-secret',
  fetchImpl: async (url, init) => {
    assert.match(init.headers.Authorization, /^OAuth /);
    calls.push(init.method);
    return new globalThis.Response(
      JSON.stringify(
        init.method === 'DELETE'
          ? { data: { deleted: true } }
          : { data: { id: '123' } }
      )
    );
  },
});

assert.equal(live.authStatus().mode, 'oauth1-user');
const posted = await live.publishPost('A shared announcement');
const deleted = await live.deletePost(posted.data.id);
assert.equal(deleted.data.deleted, true);
await assert.rejects(
  live.publishPost('Read-only mode', {
    authMode: 'app-only',
    bearerToken: 'example-app-token',
  }),
  { code: 'read-only-auth' }
);
assert.deepEqual(calls, ['POST', 'DELETE']);
console.log({
  mode: live.authStatus().mode,
  postId: posted.data.id,
  deleted: true,
  appOnlyWrite: 'refused',
});
