import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import {
  DEFAULT_ALLOWED_ORIGINS,
  classifyOrigin,
  parseAllowedOrigins,
} from '../src/server/cors.js';

// Issue #37: the hosted web app (GitHub Pages) must be able to detect
// and use a locally started `meta-sovereign serve`, which is only
// possible when the server answers cross-origin requests from it.
const PAGES = 'https://link-foundation.github.io';
const EVIL = 'https://evil.example';

const withServer = async (opts, fn) => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-cors-'));
  const handle = await startServer({
    port: 0,
    storeDir,
    enableHandlers: false,
    enableSync: false,
    ...opts,
  });
  try {
    await fn(`http://127.0.0.1:${handle.port}`, handle);
  } finally {
    await handle.close();
    await fs.rm(storeDir, { recursive: true, force: true });
  }
};

const preflight = (base, origin, extra = {}) =>
  fetch(`${base}/links`, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'content-type',
      ...extra,
    },
  });

describe('parseAllowedOrigins', () => {
  it('falls back to the hosted app and Capacitor origins', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([
      ...DEFAULT_ALLOWED_ORIGINS,
    ]);
    expect(parseAllowedOrigins('')).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(DEFAULT_ALLOWED_ORIGINS).toContain(PAGES);
  });

  it('normalises comma/space lists, drops paths and duplicates', () => {
    expect(
      parseAllowedOrigins(
        'https://a.example/app/, http://localhost:5173 https://a.example'
      )
    ).toEqual(['https://a.example', 'http://localhost:5173']);
    expect(parseAllowedOrigins(['capacitor://localhost', 'not a url'])).toEqual(
      ['capacitor://localhost']
    );
  });

  it('treats "none" as an empty allow-list', () => {
    expect(parseAllowedOrigins('none')).toEqual([]);
  });
});

describe('classifyOrigin', () => {
  const req = (origin) => ({ headers: { host: '127.0.0.1:8787', origin } });
  it('separates no-origin, same-origin, allowed and denied requests', () => {
    expect(classifyOrigin(req(undefined), [PAGES])).toBe('none');
    expect(classifyOrigin(req('http://127.0.0.1:8787'), [])).toBe('same');
    expect(classifyOrigin(req(PAGES), [PAGES])).toBe('allowed');
    expect(classifyOrigin(req(EVIL), [PAGES])).toBe('denied');
  });
});

describe('server CORS (issue #37)', () => {
  it('lets the hosted web app read /api/status from the local server', async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/api/status`, {
        headers: { origin: PAGES },
      });
      expect(r.status).toBe(200);
      expect(r.headers.get('access-control-allow-origin')).toBe(PAGES);
      expect(r.headers.get('vary')).toBe('Origin');
    });
  });

  it('answers preflights for allowed origins, including Private Network Access', async () => {
    await withServer({}, async (base) => {
      const r = await preflight(base, PAGES, {
        'access-control-request-private-network': 'true',
      });
      expect(r.status).toBe(204);
      expect(r.headers.get('access-control-allow-origin')).toBe(PAGES);
      expect(r.headers.get('access-control-allow-methods')).toContain('PUT');
      expect(r.headers.get('access-control-allow-headers')).toContain(
        'content-type'
      );
      expect(r.headers.get('access-control-allow-private-network')).toBe(
        'true'
      );
    });
  });

  it('allows a cross-origin JSON write after the preflight', async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { origin: PAGES, 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'cors:1', tokens: ['cors'] }),
      });
      expect(r.ok).toBe(true);
      expect(r.headers.get('access-control-allow-origin')).toBe(PAGES);
    });
  });

  it('refuses preflights and writes from other websites', async () => {
    await withServer({}, async (base) => {
      const pre = await preflight(base, EVIL);
      expect(pre.status).toBe(403);
      expect(pre.headers.get('access-control-allow-origin')).toBe(null);
      // `text/plain` POSTs skip the preflight, so the server itself must
      // refuse them instead of relying on the browser.
      const post = await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { origin: EVIL, 'content-type': 'text/plain' },
        body: JSON.stringify({ id: 'cors:evil', tokens: ['cors'] }),
      });
      expect(post.status).toBe(403);
      const read = await fetch(`${base}/links/cors:evil`);
      expect(read.status).toBe(404);
      const status = await fetch(`${base}/api/status`, {
        headers: { origin: EVIL },
      });
      expect(status.headers.get('access-control-allow-origin')).toBe(null);
    });
  });

  it('leaves same-origin and origin-less clients untouched', async () => {
    await withServer({ allowOrigins: 'none' }, async (base) => {
      const plain = await fetch(`${base}/api/status`);
      expect(plain.status).toBe(200);
      expect(plain.headers.get('access-control-allow-origin')).toBe(null);
      const same = await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { origin: base, 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'cors:same', tokens: ['cors'] }),
      });
      expect(same.ok).toBe(true);
    });
  });

  it('honours a custom allow-list from options', async () => {
    await withServer(
      { allowOrigins: 'http://localhost:5173' },
      async (base, handle) => {
        expect(handle.allowOrigins).toEqual(['http://localhost:5173']);
        const custom = await preflight(base, 'http://localhost:5173');
        expect(custom.status).toBe(204);
        const pages = await preflight(base, PAGES);
        expect(pages.status).toBe(403);
      }
    );
  });
});
