// Issue #29: why `js/tests/web-server-fetch.test.js` failed under bun in
// CI but passed under node everywhere.
//
// `js/src/web/dom.js` discovers a server once and memoises the binding.
// Node runs every test file in its own process, so the first file to
// touch `api` is always the file under test. Bun and deno share one
// module registry across files, so whichever file happened to sort
// first decided the binding for all the others — here, `cv-web.test.js`
// boots it offline, and the stub server later looks unreachable.
//
// Run with `node experiments/dom-boot-cache.mjs` or
// `bun experiments/dom-boot-cache.mjs`; both print the same numbers.
import http from 'node:http';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify(
      req.url === '/api/cv/stored' ? { entries: [{ platform: 'hh' }] } : {}
    )
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const { api, resetServerBinding } = await import('../js/src/web/dom.js');

// 1. Somebody else boots the module first, with no server in sight.
await api.cvStored();

// 2. Now our test publishes its server and asks again.
globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = origin;
const stale = await api.cvStored();
resetServerBinding();
const fresh = await api.cvStored();

console.log({
  withCachedBoot: stale.entries.length, // 0 — the bug
  afterReset: fresh.entries.length, // 1 — the fix
});
resetServerBinding();
await new Promise((resolve) => server.close(resolve));
