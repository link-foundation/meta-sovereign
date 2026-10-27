/**
 * Read-only API routes that derive views from the unified store
 * (contacts, status, autocomplete, audience, facts).
 *
 * Every endpoint returns plain JSON so the SPA can render without
 * extra parsing logic — the store remains the single source of truth.
 */

import { json } from './util.js';
import { safeRegExpOrNull } from '../patterns/safe-regex.js';
import { extractFacts } from '../facts/index.js';
import { localSearch } from '../crm/index.js';
import { evalAudience } from '../crm/audience.js';
import { aggregateContacts } from './aggregate.js';
import { diskHealth } from '../storage/disk-space.js';
import {
  CURRENT_SCHEMA,
  SCHEMA_ID,
  versionOf,
} from '../storage/migrations/index.js';

const computeStatus = (all, diffs) => ({
  links: all.length,
  messages: all.filter((l) => l.id?.startsWith('msg:')).length,
  patterns: all.filter((l) => l.id?.startsWith('pattern:')).length,
  graphs: all.filter((l) => l.id?.startsWith('graph:')).length,
  replies: all.filter((l) => l.id?.startsWith('reply:')).length,
  contacts: aggregateContacts(all, { people: true }).length,
  chats: new Set(
    all
      .filter((l) => l.id?.startsWith('msg:'))
      .map((m) => `${m.source}:${m.chat}`)
  ).size,
  verifyDiffs: diffs.length,
});

const completionsFor = (links, prefix, me, limit) => {
  const lower = String(prefix ?? '').toLowerCase();
  const seen = new Map();
  const messages = links.filter(
    (l) =>
      l.id?.startsWith('msg:') && l.sender === me && typeof l.body === 'string'
  );
  for (const m of messages) {
    if (!m.body.toLowerCase().startsWith(lower)) {
      continue;
    }
    if (!seen.has(m.body) || (m.timestamp ?? '') > seen.get(m.body)) {
      seen.set(m.body, m.timestamp ?? '');
    }
  }
  return [...seen.entries()]
    .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
    .slice(0, limit)
    .map(([body]) => body);
};

const facts = async (store) => {
  const all = await store.query();
  const messages = all.filter((l) => l.id?.startsWith('msg:'));
  const patterns = all
    .filter((l) => l.id?.startsWith('pattern:'))
    .map((p2) => ({
      id: p2.id,
      regex:
        typeof p2.regex === 'string'
          ? safeRegExpOrNull(p2.regex, 'i')
          : p2.regex,
    }))
    .filter((p2) => p2.regex);
  return extractFacts(messages, patterns);
};

// Full statistics may take seconds on a large store. Discovery uses the
// constant-cost probe below; statistics callers share one in-flight snapshot,
// even when background sync writes while that snapshot is being computed.
const statuses = new WeakMap();
const cachedStatus = (store) => {
  let entry = statuses.get(store);
  if (!entry) {
    entry = {
      value: null,
      pending: null,
      revision: 0,
      watched: typeof store.subscribe === 'function',
    };
    statuses.set(store, entry);
    store.subscribe?.(() => {
      entry.value = null;
      entry.revision += 1;
    });
  }
  if (entry.pending) {
    return entry.pending;
  }
  if (entry.value && entry.watched) {
    return entry.value;
  }
  const revision = entry.revision;
  entry.pending = (async () => {
    try {
      const value = computeStatus(
        await store.query(),
        (await store.verify?.()) ?? []
      );
      if (entry.revision === revision) {
        entry.value = value;
      }
      return value;
    } finally {
      entry.pending = null;
    }
  })();
  return entry.pending;
};

const HANDLERS = {
  '/api/contacts': async (store) =>
    aggregateContacts(await store.query(), { people: true }),
  '/api/status': async (store, url) =>
    url.searchParams.get('probe') === '1'
      ? { service: 'meta-sovereign', discovery: true }
      : { service: 'meta-sovereign', ...(await cachedStatus(store)) },
  '/api/autocomplete': async (store, url) =>
    completionsFor(
      await store.query(),
      url.searchParams.get('q') ?? '',
      url.searchParams.get('me') ?? 'me',
      Number(url.searchParams.get('limit') ?? 10)
    ),
  '/api/audience': async (store, url) =>
    aggregateContacts(
      evalAudience(await store.query(), url.searchParams.get('q') ?? '')
    ),
  '/api/facts': async (store) => facts(store),
  '/api/search': async (store, url) =>
    localSearch(
      { query: async () => store.query() },
      {
        query: url.searchParams.get('q') ?? '',
        min: Number(url.searchParams.get('min') ?? 0.2),
      }
    ),
  // `disk` and `store` tell the page when new messages may not be saved
  // (R-Z14); `freeBytes` is null when the platform cannot say.
  '/api/health': async (store, _url, ctx = {}) => {
    const {
      degraded = false,
      queuedBytes = 0,
      schema = null,
    } = ctx.storeHealth?.() ?? {};
    return {
      ok: true,
      links: (await store.query()).length,
      time: new Date().toISOString(),
      disk: await diskHealth(ctx.storeDir ?? '.', ctx.diskFree),
      store: { degraded, queuedBytes },
      // The data schema this store is at and the one this build writes (R-Z17).
      schema: {
        version: schema?.version ?? versionOf(await store.get(SCHEMA_ID)),
        current: CURRENT_SCHEMA,
      },
    };
  },
};

export const handleDerivedRoutes = async (store, req, res, p, url, ctx) => {
  if (req.method !== 'GET') {
    return false;
  }
  const handler = HANDLERS[p];
  if (!handler) {
    return false;
  }
  return json(res, 200, await handler(store, url, ctx)) ?? true;
};
