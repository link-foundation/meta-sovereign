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
import { factHistory } from './fact-history.js';
import { localSearch } from '../crm/index.js';
import { evalAudience } from '../crm/audience.js';
import { aggregateContacts, createContactAggregation } from './aggregate.js';
import { scanLinks, lightLinks } from './store-scan.js';
import { memoryHealth } from './memory-health.js';
import { diskHealth } from '../storage/disk-space.js';
import {
  CURRENT_SCHEMA,
  SCHEMA_ID,
  versionOf,
} from '../storage/migrations/index.js';

const computeStatus = async (store) => {
  const counts = { links: 0, messages: 0, patterns: 0, graphs: 0, replies: 0 };
  const contacts = new Set();
  const chats = new Set();
  await scanLinks(store, undefined, (batch) => {
    for (const link of batch) {
      counts.links += 1;
      for (const [prefix, field] of [
        ['msg:', 'messages'],
        ['pattern:', 'patterns'],
        ['graph:', 'graphs'],
        ['reply:', 'replies'],
      ]) {
        if (link.id?.startsWith(prefix)) {
          counts[field] += 1;
        }
      }
      if (link.id?.startsWith('msg:')) {
        chats.add(`${link.source}:${link.chat}`);
        if (link.sender && link.sender !== 'me') {
          contacts.add(link.sender);
        }
      }
      if (link.id?.startsWith('person:') && link.user && link.source) {
        contacts.add(String(link.user));
      }
    }
  });
  return {
    ...counts,
    contacts: contacts.size,
    chats: chats.size,
    verifyDiffs: ((await store.verify?.()) ?? []).length,
  };
};

const contactsFromStore = async (store) => {
  const aggregation = createContactAggregation();
  await scanLinks(
    store,
    (link) => link.id?.startsWith('msg:'),
    (batch) => batch.forEach(aggregation.message)
  );
  await scanLinks(
    store,
    (link) => link.id?.startsWith('person:'),
    (batch) => batch.forEach(aggregation.person)
  );
  return aggregation.result();
};

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

const facts = async (store, ctx) => {
  const saved = [];
  await scanLinks(
    store,
    (link) => link.id?.startsWith('pattern:'),
    (batch) => saved.push(...batch)
  );
  const patterns = saved
    .map((p2) => ({
      id: p2.id,
      regex:
        typeof p2.regex === 'string'
          ? safeRegExpOrNull(p2.regex, 'i')
          : p2.regex,
    }))
    .filter((p2) => p2.regex);
  if (!patterns.length) {
    return { facts: [], byAnswerer: {} };
  }
  return {
    ...extractFacts(await factHistory(store, ctx), patterns.slice(0, 100), {
      limit: 500,
    }),
    coverage: { bounded: true, maxFacts: 500, maxPatterns: 100 },
  };
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
      const value = await computeStatus(store);
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
  '/api/contacts': contactsFromStore,
  '/api/status': async (store, url) =>
    url.searchParams.get('probe') === '1'
      ? { service: 'meta-sovereign', discovery: true }
      : { service: 'meta-sovereign', ...(await cachedStatus(store)) },
  '/api/autocomplete': async (store, url) =>
    completionsFor(
      await lightLinks(store),
      url.searchParams.get('q') ?? '',
      url.searchParams.get('me') ?? 'me',
      Number(url.searchParams.get('limit') ?? 10)
    ),
  '/api/audience': async (store, url) =>
    aggregateContacts(
      evalAudience(await lightLinks(store), url.searchParams.get('q') ?? '')
    ),
  '/api/facts': async (store, _url, ctx) => facts(store, ctx),
  '/api/search': async (store, url) =>
    localSearch(
      { query: async () => lightLinks(store) },
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
      links: (await store.size?.()) ?? (await store.query()).length,
      time: new Date().toISOString(),
      disk: await diskHealth(ctx.storeDir ?? '.', ctx.diskFree),
      store: { degraded, queuedBytes },
      memory: memoryHealth(store),
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
