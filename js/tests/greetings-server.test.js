// Issue #35: the greetings API. The catalogue, the selection and the
// plan preview need no network; listing stickers, sending a queued plan
// and the Telegram thumbnail proxy go through injected source adapters.

import { describe, it, expect } from 'test-anywhere';

import { buildMessageLink } from '../src/sources/link.js';
import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import {
  greetingLinkId,
  greetingTexts,
  vkGreetingStickers,
} from '../src/greetings/index.js';

const fetchJson = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, body: await r.json(), headers: r.headers };
};

const send = (base, path, method, body) =>
  fetchJson(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const withServer = async (options, fn) => {
  const store = options.store ?? createMemoryStore();
  const handle = await startServer({
    port: 0,
    store,
    enableHandlers: false,
    enableSync: false,
    ...options,
  });
  try {
    return await fn(`http://127.0.0.1:${handle.port}`, store);
  } finally {
    await handle.close();
  }
};

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const seed = async (store) => {
  const links = [
    // Never written to.
    ['vk', '1', '100', '100', 'Ok', hoursAgo(500)],
    // Answered an hour ago.
    ['vk', '2', '200', '200', 'Ok', hoursAgo(2)],
    ['vk', '3', '200', 'me', 'Sure', hoursAgo(1)],
    // Said hi on Telegram.
    ['telegram', 't1', '77', '77', 'Привет!', hoursAgo(1)],
  ];
  for (const [source, externalId, chat, sender, body, timestamp] of links) {
    await store.put(
      buildMessageLink({ source, externalId, chat, sender, body, timestamp })
    );
  }
};

/** Records every call; Telegram also serves `getFile` downloads. */
const fakeSources = (calls, file = { path: 'thumbnails/a.webp' }) => {
  const live = (name) => ({
    async post(content, options) {
      calls.push({ name, method: 'post', content, options });
      return { ok: true };
    },
    async listGreetingStickers(options) {
      calls.push({ name, method: 'list', options });
      return { stickers: [{ network: name, id: `${name}-1` }], failures: [] };
    },
    async fetchFile(id, options) {
      calls.push({ name, method: 'file', id, options });
      return { bytes: new Uint8Array([82, 73, 70, 70]), path: file.path };
    },
  });
  return (name) => ({ name, live: live(name) });
};

describe('greetings api catalogue and selection', () => {
  it('serves the built-in catalogue without any network access', async () => {
    await withServer({}, async (base) => {
      const { status, body } = await fetchJson(
        `${base}/api/greetings/catalogue`
      );
      expect(status).toBe(200);
      expect(body.stickers.vk.length).toBe(vkGreetingStickers.length);
      expect(body.networks.x.sticker).toBeNull();
    });
  });

  it('round-trips the selection through the store', async () => {
    await withServer({}, async (base, store) => {
      const before = await fetchJson(`${base}/api/greetings/selection`);
      expect(before.body.language).toBe('en');
      const saved = await send(base, '/api/greetings/selection', 'PUT', {
        stickers: [{ network: 'vk', id: '21' }],
        language: 'ru',
        prefer: 'text',
      });
      expect(saved.status).toBe(200);
      expect(saved.body.stickers.map((s) => s.id)).toEqual(['21']);
      const after = await fetchJson(`${base}/api/greetings/selection`);
      expect(after.body).toEqual(saved.body);
      expect((await store.get('greetings:selection')).selection.language).toBe(
        'ru'
      );
    });
  });

  it('sends a CSP that admits vk.com sticker previews only', async () => {
    await withServer({}, async (base) => {
      const { headers } = await fetchJson(`${base}/api/greetings/catalogue`);
      const csp = headers.get('content-security-policy');
      expect(csp).toContain("img-src 'self' data: blob: https://vk.com;");
      expect(csp).toContain("default-src 'self'");
    });
  });
});

describe('greetings api plans', () => {
  it('previews a plan without sending anything', async () => {
    const calls = [];
    await withServer(
      { greetings: { resolveSource: fakeSources(calls) } },
      async (base, store) => {
        await seed(store);
        const { status, body } = await send(
          base,
          '/api/greetings/plan',
          'POST',
          {
            networks: ['vk'],
          }
        );
        expect(status).toBe(200);
        expect(body.mode).toBe('initiate');
        expect(body.envelopes.map((e) => e.chat)).toEqual(['100']);
        expect(calls).toEqual([]);
      }
    );
  });

  it('replies to greetings in their language', async () => {
    await withServer({}, async (base, store) => {
      await seed(store);
      await send(base, '/api/greetings/selection', 'PUT', { prefer: 'text' });
      const { body } = await send(base, '/api/greetings/plan', 'POST', {
        mode: 'reply',
      });
      expect(body.envelopes.map((e) => `${e.network}:${e.chat}`)).toEqual([
        'telegram:77',
      ]);
      expect(greetingTexts.ru).toContain(body.envelopes[0].text);
    });
  });

  it('queues a plan with stored credentials and records each greeting', async () => {
    const calls = [];
    const sleeps = [];
    await withServer(
      {
        greetings: {
          resolveSource: fakeSources(calls),
          sleep: async (ms) => sleeps.push(ms),
        },
      },
      async (base, store) => {
        await seed(store);
        await store.put({ id: 'secret:vk:token', tokens: [], value: 'vk-t' });
        const request = { networks: ['vk'], run: 'queue', delayMs: 30000 };
        // Nothing goes out before the user confirms the previewed plan.
        const asked = await send(base, '/api/greetings/plan', 'POST', request);
        expect(asked.status).toBe(428);
        expect(asked.body.preview.envelopes.length).toBe(1);
        expect(calls).toEqual([]);
        const { body } = await send(base, '/api/greetings/plan', 'POST', {
          ...request,
          confirmToken: asked.body.confirm.token,
        });
        expect(body.plan.envelopes).toEqual(asked.body.preview.envelopes);
        expect(body.results.map((r) => r.ok)).toEqual([true]);
        expect(calls[0].name).toBe('vk');
        expect(calls[0].content.chat).toBe('100');
        expect(calls[0].options).toEqual({ token: 'vk-t' });
        expect(sleeps).toEqual([]);
        expect(await store.get(greetingLinkId('vk', '100'))).toBeTruthy();
        // The chat is greeted now, so the next plan leaves it alone.
        const again = await send(base, '/api/greetings/plan', 'POST', {
          networks: ['vk'],
        });
        expect(again.body.envelopes).toEqual([]);
      }
    );
  });

  it('caps the pause between sends at one minute', async () => {
    const sleeps = [];
    await withServer(
      {
        greetings: {
          resolveSource: fakeSources([]),
          sleep: async (ms) => sleeps.push(ms),
        },
      },
      async (base, store) => {
        await seed(store);
        await store.put(
          buildMessageLink({
            source: 'vk',
            externalId: '9',
            chat: '900',
            sender: '900',
            body: 'Ok',
            timestamp: hoursAgo(600),
          })
        );
        const request = {
          networks: ['vk'],
          run: 'queue',
          delayMs: 10_000_000,
        };
        const asked = await send(base, '/api/greetings/plan', 'POST', request);
        await send(base, '/api/greetings/plan', 'POST', {
          ...request,
          confirmToken: asked.body.confirm.token,
        });
        expect(sleeps).toEqual([60000]);
      }
    );
  });
});

describe('greetings api live stickers and thumbnails', () => {
  it('lists stickers live with the stored tokens', async () => {
    const calls = [];
    await withServer(
      { greetings: { resolveSource: fakeSources(calls) } },
      async (base, store) => {
        await store.put({
          id: 'secret:telegram:bot-token',
          tokens: [],
          value: 'bot-t',
        });
        const { body } = await send(base, '/api/greetings/stickers', 'POST', {
          networks: ['telegram'],
        });
        expect(body.stickers).toEqual([
          { network: 'telegram', id: 'telegram-1' },
        ]);
        expect(calls[0].options.token).toBe('bot-t');
        expect(calls[0].options.sets.length).toBeGreaterThan(0);
      }
    );
  });

  it('proxies Telegram thumbnails as images and rejects odd ids', async () => {
    const calls = [];
    await withServer(
      { greetings: { resolveSource: fakeSources(calls) } },
      async (base) => {
        const r = await fetch(`${base}/api/greetings/file?id=AgAD-1_x`);
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toContain('image/webp');
        expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([
          82, 73, 70, 70,
        ]);
        expect(calls[0].id).toBe('AgAD-1_x');
        const bad = await fetchJson(`${base}/api/greetings/file?id=../x`);
        expect(bad.status).toBe(400);
      }
    );
  });

  it('refuses to proxy files that are not images', async () => {
    await withServer(
      {
        greetings: {
          resolveSource: fakeSources([], { path: 'documents/a.html' }),
        },
      },
      async (base) => {
        const { status } = await fetchJson(`${base}/api/greetings/file?id=A`);
        expect(status).toBe(415);
      }
    );
  });

  it('turns adapter failures into a 502 with the reason', async () => {
    const failing = () => ({
      live: {
        async listGreetingStickers() {
          throw new Error('unreachable');
        },
        async fetchFile() {
          throw new Error('telegram getFile: HTTP 404');
        },
      },
    });
    await withServer(
      { greetings: { resolveSource: failing } },
      async (base) => {
        const { status, body } = await fetchJson(
          `${base}/api/greetings/file?id=A`
        );
        expect(status).toBe(502);
        expect(body.error).toBe('telegram getFile: HTTP 404');
      }
    );
  });
});
