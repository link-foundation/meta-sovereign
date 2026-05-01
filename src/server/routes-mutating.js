/**
 * Mutating API routes: links CRUD, pattern persistence + inference,
 * graphs persistence + run, replies CRUD, profile + resume sync.
 *
 * Each endpoint returns plain JSON. The store is the single source of
 * truth; nothing is held in server-side memory.
 */

import { json, readBody } from './util.js';
import { inferRegex, simplifyRegex, inferRegexLcs } from '../patterns/index.js';
import { runGraph } from '../automation/index.js';
import { listSources } from '../sources/index.js';

const handleLinks = async (store, req, res, p) => {
  if (p === '/links' && req.method === 'GET') {
    return json(res, 200, await store.query()) ?? true;
  }
  if (p === '/links' && req.method === 'PUT') {
    const link = await readBody(req);
    await store.put(link);
    return json(res, 200, link) ?? true;
  }
  const m = p.match(/^\/links\/(.+)$/);
  if (!m) {
    return false;
  }
  if (req.method === 'GET') {
    const link = await store.get(decodeURIComponent(m[1]));
    return (
      (link ? json(res, 200, link) : json(res, 404, { error: 'not found' })) ??
      true
    );
  }
  if (req.method === 'DELETE') {
    const ok = await store.delete(decodeURIComponent(m[1]));
    return json(res, ok ? 200 : 404, { ok }) ?? true;
  }
  return false;
};

const handlePrefixedPut = async (store, req, res, prefix, kind) => {
  const link = await readBody(req);
  if (!link.id?.startsWith(`${prefix}:`)) {
    json(res, 400, { error: `${kind}.id must start with "${prefix}:"` });
    return true;
  }
  await store.put(link);
  json(res, 200, link);
  return true;
};

const handlePrefixedGet = async (store, res, prefix) => {
  const all = await store.query();
  json(
    res,
    200,
    all.filter((l) => l.id?.startsWith(`${prefix}:`))
  );
  return true;
};

const handlePatternInfer = async (req, res) => {
  const { examples, mode = 'simple' } = await readBody(req);
  const regex =
    mode === 'lcs'
      ? inferRegexLcs(examples ?? [])
      : simplifyRegex(inferRegex(examples ?? []));
  json(res, 200, { regex: regex.source, flags: regex.flags });
  return true;
};

const handlePatterns = async (store, req, res, p) => {
  if (p === '/api/patterns' && req.method === 'GET') {
    return handlePrefixedGet(store, res, 'pattern');
  }
  if (p === '/api/patterns' && req.method === 'PUT') {
    return handlePrefixedPut(store, req, res, 'pattern', 'pattern');
  }
  if (p === '/api/patterns/infer' && req.method === 'POST') {
    return handlePatternInfer(req, res);
  }
  return false;
};

const handleGraphRun = async (store, req, res) => {
  const { id, message, mode = 'semi' } = await readBody(req);
  const persisted = await store.get(id);
  if (!persisted) {
    json(res, 404, { error: `graph ${id} not found` });
    return true;
  }
  json(res, 200, runGraph(hydrateGraph(persisted), message, { mode }));
  return true;
};

const handleGraphs = async (store, req, res, p) => {
  if (p === '/api/graphs' && req.method === 'GET') {
    return handlePrefixedGet(store, res, 'graph');
  }
  if (p === '/api/graphs' && req.method === 'PUT') {
    return handlePrefixedPut(store, req, res, 'graph', 'graph');
  }
  if (p === '/api/graphs/run' && req.method === 'POST') {
    return handleGraphRun(store, req, res);
  }
  return false;
};

const hydrateGraph = (persisted) => {
  const nodes = new Map();
  for (const n of persisted.nodes ?? []) {
    nodes.set(n.id, {
      ...n,
      regex: n.regex ? new RegExp(n.regex, n.flags ?? 'i') : undefined,
      group: n.group,
    });
  }
  return { nodes, edges: persisted.edges ?? [] };
};

const handleReplies = async (store, req, res, p) => {
  if (p === '/api/replies' && req.method === 'GET') {
    return handlePrefixedGet(store, res, 'reply');
  }
  if (p === '/api/replies' && req.method === 'PUT') {
    return handlePrefixedPut(store, req, res, 'reply', 'reply');
  }
  return false;
};

const handleProfile = async (store, req, res, p) => {
  if (p === '/api/profile' && req.method === 'GET') {
    const profile = await store.get('profile:me');
    return (
      json(res, 200, profile ?? { id: 'profile:me', tokens: ['profile'] }) ??
      true
    );
  }
  if (p === '/api/profile' && req.method === 'PUT') {
    const profile = await readBody(req);
    profile.id = 'profile:me';
    profile.tokens = profile.tokens ?? ['profile'];
    await store.put(profile);
    return (
      json(res, 200, {
        profile,
        plannedSyncs: listSources().map((s) => ({
          source: s,
          status: 'queued',
        })),
      }) ?? true
    );
  }
  return false;
};

const handleResume = async (store, req, res, p) => {
  if (p === '/api/resume' && req.method === 'GET') {
    const resume = await store.get('resume:me');
    return (
      json(res, 200, resume ?? { id: 'resume:me', tokens: ['resume'] }) ?? true
    );
  }
  if (p === '/api/resume' && req.method === 'PUT') {
    const resume = await readBody(req);
    resume.id = 'resume:me';
    resume.tokens = resume.tokens ?? ['resume'];
    await store.put(resume);
    const targets = ['hh', 'habr-career', 'superjob', 'linkedin'];
    return (
      json(res, 200, {
        resume,
        plannedSyncs: targets.map((s) => ({ source: s, status: 'queued' })),
      }) ?? true
    );
  }
  return false;
};

const handleBroadcast = async (store, req, res, p) => {
  if (p !== '/api/broadcast' || req.method !== 'POST') {
    return false;
  }
  const { text: body, networks } = await readBody(req);
  const targets = (networks ?? listSources()).filter((n) =>
    listSources().includes(n)
  );
  const post = {
    id: `broadcast:${Date.now()}`,
    tokens: ['broadcast', ...targets],
    body,
    networks: targets,
    timestamp: new Date().toISOString(),
    status: 'queued',
  };
  await store.put(post);
  return json(res, 200, post) ?? true;
};

export const handleMutatingRoutes = async (store, req, res, p) =>
  (await handleLinks(store, req, res, p)) ||
  (await handlePatterns(store, req, res, p)) ||
  (await handleGraphs(store, req, res, p)) ||
  (await handleReplies(store, req, res, p)) ||
  (await handleProfile(store, req, res, p)) ||
  (await handleResume(store, req, res, p)) ||
  (await handleBroadcast(store, req, res, p));
