/**
 * Read-only API routes that derive views from the unified store
 * (contacts, status, autocomplete, audience, facts).
 *
 * Every endpoint returns plain JSON so the SPA can render without
 * extra parsing logic — the store remains the single source of truth.
 */

import { json } from './util.js';
import { extractFacts } from '../facts/index.js';
import { intersect, union, difference, localSearch } from '../crm/index.js';

const aggregateContacts = (links) => {
  const messages = links.filter((l) => l.id?.startsWith('msg:'));
  const byContact = new Map();
  for (const m of messages) {
    if (!m.sender) {
      continue;
    }
    const entry = byContact.get(m.sender) ?? {
      id: m.sender,
      networks: new Set(),
      chats: new Set(),
      messageCount: 0,
      lastSeen: null,
    };
    entry.networks.add(m.source);
    entry.chats.add(m.chat);
    entry.messageCount += 1;
    if (!entry.lastSeen || (m.timestamp ?? '') > entry.lastSeen) {
      entry.lastSeen = m.timestamp ?? null;
    }
    byContact.set(m.sender, entry);
  }
  return [...byContact.values()].map((c) => ({
    ...c,
    networks: [...c.networks],
    chats: [...c.chats],
  }));
};

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

const buildAudience = (links, expression) => {
  const ops = parseAudience(expression);
  const evalExpr = (node) => {
    if (node.kind === 'set') {
      return links.filter(node.predicate);
    }
    if (node.kind === 'and') {
      return intersect(evalExpr(node.left), evalExpr(node.right));
    }
    if (node.kind === 'or') {
      return union(evalExpr(node.left), evalExpr(node.right));
    }
    if (node.kind === 'not') {
      return difference(links, evalExpr(node.expr));
    }
    return [];
  };
  const linksMatched = evalExpr(ops);
  return aggregateContacts(linksMatched);
};

const parseAudience = (expr) => {
  const tokens = String(expr ?? '')
    .replace(/([(),])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];
  const parsePrimary = () => {
    const t = eat();
    if (t === 'NOT') {
      return { kind: 'not', expr: parsePrimary() };
    }
    if (t === '(') {
      const inner = parseOr();
      eat();
      return inner;
    }
    return makeSet(t);
  };
  const parseAnd = () => {
    let left = parsePrimary();
    while (peek() === 'AND') {
      eat();
      left = { kind: 'and', left, right: parsePrimary() };
    }
    return left;
  };
  const parseOr = () => {
    let left = parseAnd();
    while (peek() === 'OR') {
      eat();
      left = { kind: 'or', left, right: parseAnd() };
    }
    return left;
  };
  return parseOr();
};

const makeSet = (token) => {
  const m = token.match(/^(network|chat|sender|fact|kind):(.+)$/);
  if (!m) {
    return { kind: 'set', predicate: () => false };
  }
  const [, dim, value] = m;
  if (dim === 'network') {
    return { kind: 'set', predicate: (l) => l.source === value };
  }
  if (dim === 'chat') {
    return { kind: 'set', predicate: (l) => l.chat === value };
  }
  if (dim === 'sender') {
    return { kind: 'set', predicate: (l) => l.sender === value };
  }
  if (dim === 'kind') {
    return { kind: 'set', predicate: (l) => l.id?.startsWith(`${value}:`) };
  }
  return {
    kind: 'set',
    predicate: (l) => (l.facts ?? []).some((f) => f.includes(value)),
  };
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
    buildAudience(await store.query(), url.searchParams.get('q') ?? ''),
  '/api/facts': async (store) => facts(store),
  '/api/search': async (store, url) =>
    localSearch(
      { query: async () => store.query() },
      {
        query: url.searchParams.get('q') ?? '',
        min: Number(url.searchParams.get('min') ?? 0.2),
      }
    ),
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
