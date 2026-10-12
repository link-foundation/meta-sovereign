/**
 * Read-only API routes that derive views from the unified store
 * (contacts, status, autocomplete, audience, facts).
 *
 * Every endpoint returns plain JSON so the SPA can render without
 * extra parsing logic — the store remains the single source of truth.
 */

import { json } from './util.js';
import { extractFacts } from '../facts/index.js';
import { localSearch } from '../crm/index.js';
import { evalAudience } from '../crm/audience.js';
import { aggregateContacts } from './aggregate.js';

const computeStatus = (all, diffs) => ({
  links: all.length,
  messages: all.filter((l) => l.id?.startsWith('msg:')).length,
  patterns: all.filter((l) => l.id?.startsWith('pattern:')).length,
  graphs: all.filter((l) => l.id?.startsWith('graph:')).length,
  replies: all.filter((l) => l.id?.startsWith('reply:')).length,
  contacts: aggregateContacts(all).length,
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
        typeof p2.regex === 'string' ? new RegExp(p2.regex, 'i') : p2.regex,
    }));
  return extractFacts(messages, patterns);
};

const HANDLERS = {
  '/api/contacts': async (store) => aggregateContacts(await store.query()),
  '/api/status': async (store) =>
    computeStatus(await store.query(), (await store.verify?.()) ?? []),
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
  '/api/health': async (store) => ({
    ok: true,
    links: (await store.query()).length,
    time: new Date().toISOString(),
  }),
};

export const handleDerivedRoutes = async (store, req, res, p, url) => {
  if (req.method !== 'GET') {
    return false;
  }
  const handler = HANDLERS[p];
  if (!handler) {
    return false;
  }
  return json(res, 200, await handler(store, url)) ?? true;
};
