/**
 * The SPA's server bridge (`serverFetch` in `js/src/web/dom.js`).
 *
 * Three properties matter to every screen that talks to a backend,
 * and the CV screen (issue #29, R-V18) is the one that has all three
 * at once: it is the only surface whose routes exist on one backend
 * and not on the other (`docs/SERVER-PARITY.md`).
 *
 *   1. Calls go to the *discovered* origin, not the page's origin —
 *      the SPA on GitHub Pages talks to a server on 127.0.0.1.
 *   2. A route the backend does not implement (the Rust server
 *      answers 404 with a JSON error body) resolves to the caller's
 *      documented fallback, not to `{error: 'unknown route'}` being
 *      rendered as data.
 *   3. A route it does implement resolves to the parsed body.
 *
 * The backend here is a stub rather than the real JS server so the
 * 404 branch is reproducible: the real server implements every route.
 */

import { describe, it, expect } from 'test-anywhere';
import http from 'node:http';

const startStub = async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/api/status') {
      json(200, { links: 0 });
      return;
    }
    if (req.url === '/api/cv/stored') {
      json(200, { entries: [{ platform: 'hh', capturedAt: 'now', cv: {} }] });
      return;
    }
    // Everything else behaves like the Rust server's catch-all.
    json(404, { error: 'unknown route' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, seen, origin: `http://127.0.0.1:${server.address().port}` };
};

describe('serverFetch talks to the discovered server', () => {
  it('uses the discovered origin and falls back when a route is missing', async () => {
    const stub = await startStub();
    globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = stub.origin;
    try {
      // Imported here, after the candidate is published, because the
      // module boots (and discovers) on first use.
      const { api } = await import('../src/web/dom.js');

      // 3. An implemented route resolves to its body…
      const stored = await api.cvStored();
      expect(stored.entries.length).toBe(1);
      expect(stored.entries[0].platform).toBe('hh');

      // 1. …and it was fetched from the stub, not from a relative
      // path (which would have thrown in Node and looked identical
      // to a fallback).
      expect(stub.seen.includes('/api/cv/stored')).toBe(true);

      // 2. A 404 with a JSON error body is a fallback, not data.
      const platforms = await api.cvPlatforms();
      expect(Array.isArray(platforms)).toBe(true);
      expect(platforms.length).toBe(0);
      const telemetry = await api.cvTelemetry({});
      expect(telemetry.runs).toEqual([]);
      const backups = await api.listBackups();
      expect(backups).toEqual([]);

      // A POST route that is missing yields the same honest answer
      // the fully offline SPA gives.
      const read = await api.cvRead({ platforms: ['hh'] });
      expect(read.failures[0].code).toBe('server-required');
    } finally {
      delete globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES;
      await new Promise((resolve) => stub.server.close(resolve));
    }
  });
});
