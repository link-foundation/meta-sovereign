/**
 * Mutating API routes: links CRUD, pattern persistence + inference,
 * graphs persistence + run, replies CRUD, profile + resume sync.
 *
 * Each endpoint returns plain JSON. The store is the single source of
 * truth; nothing is held in server-side memory.
 */

import { fail, json, readBody } from './util.js';
import { maskSecret, maskSecrets } from './secret-mask.js';
import { safeRegExp } from '../patterns/safe-regex.js';
import { inferRegex, simplifyRegex, inferRegexLcs } from '../patterns/index.js';
import { runGraph } from '../automation/index.js';
import {
  listCvSources,
  listSources,
  stampSourceLink,
} from '../sources/index.js';
import { createEmailLive } from '../sources/email.js';
import { createNodeEmailTransport } from '../sources/email-node-transport.js';
import { createGithubLive } from '../sources/github.js';
import { createUpworkLive } from '../sources/upwork.js';
import { createPeoplePerHourLive } from '../sources/peopleperhour.js';
import {
  broadcast,
  planOutreach,
  runOutreach,
  syncProfile,
  syncResume,
} from '../broadcast/index.js';
import { confirmed } from './confirmations.js';
import { evalAudience } from '../crm/audience.js';
import { aggregateContacts } from './aggregate.js';
import {
  softDeleteLink,
  purgeLink,
  isTombstone,
} from '../storage/soft-delete.js';
import { exportEncrypted } from '../storage/export-encrypted.js';

const includeTombstones = (url) => {
  const v = url?.searchParams.get('include');
  if (v === 'tombstones' || v === 'all') {
    return true;
  }
  return url?.searchParams.get('showDeleted') === '1';
};

// `?except=msg:` leaves out links whose id starts with that prefix (the
// chat screen reads messages by page, ./routes-chat.js); `?prefix=secret:`
// keeps only those (a screen that needs a few kinds of link does not get
// the whole store's messages).
const listLinks = async (store, res, url) => {
  const except = url.searchParams.get('except');
  const prefix = url.searchParams.get('prefix');
  const idOf = (l) => String(l?.id ?? '');
  const all = await store.query(
    except || prefix
      ? (l) =>
          (!except || !idOf(l).startsWith(except)) &&
          (!prefix || idOf(l).startsWith(prefix))
      : undefined
  );
  const visible = includeTombstones(url)
    ? all
    : all.filter((l) => !isTombstone(l));
  // A saved secret is told as present, never as its value (R-Z1).
  return json(res, 200, maskSecrets(visible)) ?? true;
};

const MAX_ID_LENGTH = 2048;

/** Why `link` cannot be stored, or null: an object with a real string id. */
export const linkProblem = (link) => {
  if (typeof link?.id !== 'string' || !link.id.trim()) {
    return 'a link needs a non-empty string id';
  }
  if (link.id.length > MAX_ID_LENGTH) {
    return `a link id is at most ${MAX_ID_LENGTH} characters`;
  }
  return null;
};

const putLink = async (store, req, res) => {
  const link = await readBody(req);
  const problem = linkProblem(link);
  if (problem) {
    return fail(res, 400, 'bad-link', problem) ?? true;
  }
  await store.put(link);
  return json(res, 200, maskSecret(link)) ?? true;
};

const getLink = async (store, res, id, url) => {
  const link = await store.get(id);
  if (!link || (isTombstone(link) && !includeTombstones(url))) {
    return json(res, 404, { error: 'not found' }) ?? true;
  }
  return json(res, 200, maskSecret(link)) ?? true;
};

// Issue #6 / R-K1: soft-delete by default. The destructive path
// requires *both* `purge=1` AND `confirm=1` so a stray query
// string from a misconfigured client cannot wipe data.
const deleteLink = async (store, res, id, url) => {
  const purge = url?.searchParams.get('purge') === '1';
  const confirm = url?.searchParams.get('confirm') === '1';
  const reason = url?.searchParams.get('reason') ?? null;
  if (purge) {
    if (!confirm) {
      return json(res, 400, { error: 'purge requires confirm=1' }) ?? true;
    }
    const ok = await purgeLink(store, id, { confirm: true });
    return json(res, ok ? 200 : 404, { ok, purged: ok }) ?? true;
  }
  const tombstoned = await softDeleteLink(store, id, { by: 'http', reason });
  if (!tombstoned) {
    return json(res, 404, { ok: false }) ?? true;
  }
  return (
    json(res, 200, {
      ok: true,
      soft: true,
      deleted: tombstoned.deleted ?? null,
      link: maskSecret(tombstoned),
    }) ?? true
  );
};

const handleLinks = async (store, req, res, p, url) => {
  if (p === '/links' && req.method === 'GET') {
    return listLinks(store, res, url);
  }
  if (p === '/links' && req.method === 'PUT') {
    return putLink(store, req, res);
  }
  const m = p.match(/^\/links\/(.+)$/);
  if (!m) {
    return false;
  }
  const id = decodeURIComponent(m[1]);
  if (req.method === 'GET') {
    return getLink(store, res, id, url);
  }
  if (req.method === 'DELETE') {
    return deleteLink(store, res, id, url);
  }
  return false;
};

const handleExportEncrypted = async (store, req, res, ctx) => {
  const body = await readBody(req);
  const passphrase = body.passphrase ?? ctx?.secretPassphrase ?? null;
  if (!passphrase) {
    json(res, 400, {
      error: 'export-encrypted requires a passphrase',
    });
    return true;
  }
  const envelope = await exportEncrypted(store, {
    passphrase,
    warning: body.warning,
  });
  json(res, 200, JSON.parse(envelope));
  return true;
};

const handlePurgeTombstones = async (store, req, res) => {
  const body = await readBody(req);
  if (body.confirm !== true) {
    json(res, 400, {
      error:
        'purging tombstones requires { "confirm": true } in the request body',
    });
    return true;
  }
  const idPrefix = typeof body.idPrefix === 'string' ? body.idPrefix : null;
  const olderThan = body.olderThan
    ? new Date(body.olderThan).toISOString()
    : null;
  const all = await store.query();
  const targets = all.filter((l) => {
    if (!isTombstone(l)) {
      return false;
    }
    if (idPrefix && !l.id?.startsWith(idPrefix)) {
      return false;
    }
    if (olderThan && (l.deleted?.at ?? '') > olderThan) {
      return false;
    }
    return true;
  });
  const purged = [];
  for (const link of targets) {
    if (await store.delete(link.id)) {
      purged.push(link.id);
    }
  }
  json(res, 200, { purged });
  return true;
};

const handlePrefixedPut = async (store, req, res, prefix, kind) => {
  const link = await readBody(req);
  if (typeof link.id !== 'string' || !link.id.startsWith(`${prefix}:`)) {
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

const MAX_EXAMPLES = 500;
const MAX_EXAMPLE_LENGTH = 2000;

const handlePatternInfer = async (req, res) => {
  const { examples, mode = 'simple' } = await readBody(req);
  if (
    !Array.isArray(examples) ||
    examples.length > MAX_EXAMPLES ||
    examples.some((e) => typeof e !== 'string' || e.length > MAX_EXAMPLE_LENGTH)
  ) {
    return (
      fail(
        res,
        400,
        'bad-examples',
        'examples must be a short list of strings'
      ) ?? true
    );
  }
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
  if (typeof id !== 'string' || !id) {
    return fail(res, 400, 'bad-request', 'id (a graph id) is needed') ?? true;
  }
  const persisted = await store.get(id);
  if (!persisted) {
    json(res, 404, { error: `graph ${id} not found` });
    return true;
  }
  let graph;
  try {
    graph = hydrateGraph(persisted);
  } catch (error) {
    // A stored pattern that is too long or not a regex (R-Z1).
    return fail(res, 400, 'unsafe-pattern', error.message) ?? true;
  }
  json(res, 200, runGraph(graph, message, { mode }));
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
      regex: n.regex ? safeRegExp(n.regex, n.flags ?? 'i') : undefined,
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

const handleProfile = async (store, req, res, p, ctx) => {
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
    // Saved locally only; publishing it is a separate, confirmed step.
    await store.put(profile);
    return json(res, 200, { profile }) ?? true;
  }
  if (p === '/api/profile/sync' && req.method === 'POST') {
    return confirmedSync(store, req, res, ctx, {
      id: 'profile:me',
      action: 'profile.sync',
      run: syncProfile,
    });
  }
  return false;
};

/**
 * Publish the saved profile or CV to the chosen networks, after the
 * user confirmed exactly that profile and those networks.
 */
const confirmedSync = async (store, req, res, ctx, { id, action, run }) => {
  const body = await readBody(req);
  const networks = Array.isArray(body.networks)
    ? body.networks.filter((n) => listSources().includes(n))
    : [];
  if (networks.length === 0) {
    return json(res, 400, { error: 'choose the networks to update' }) ?? true;
  }
  const ok = await confirmed(ctx, res, {
    action,
    body,
    prepare: async () => {
      const link = await store.get(id);
      return { preview: { networks, fields: link ?? {} }, data: link };
    },
  });
  if (!ok) {
    return true;
  }
  const results = await run(networks, ok.data ?? {});
  return json(res, 200, { networks, results }) ?? true;
};

const handleResume = async (store, req, res, p, ctx) => {
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
    // Saved locally only; publishing it is a separate, confirmed step.
    await store.put(resume);
    return json(res, 200, { resume, targets: listCvSources() }) ?? true;
  }
  if (p === '/api/resume/sync' && req.method === 'POST') {
    return confirmedSync(store, req, res, ctx, {
      id: 'resume:me',
      action: 'resume.sync',
      run: syncResume,
    });
  }
  return false;
};

// A public post on every chosen network: confirmed, then sent, then
// recorded with each network's result.
const handleBroadcast = async (store, req, res, p, ctx) => {
  if (p !== '/api/broadcast' || req.method !== 'POST') {
    return false;
  }
  const request = await readBody(req);
  const text = String(request.text ?? '');
  const targets = (
    Array.isArray(request.networks) ? request.networks : []
  ).filter((n) => listSources().includes(n));
  if (!text.trim() || targets.length === 0) {
    return json(res, 400, { error: 'text and networks are needed' }) ?? true;
  }
  const ok = await confirmed(ctx, res, {
    action: 'broadcast.post',
    body: request,
    prepare: async () => ({ preview: { networks: targets, text } }),
  });
  if (!ok) {
    return true;
  }
  const results = await broadcast(targets, text);
  const post = {
    id: `broadcast:${Date.now()}`,
    tokens: ['broadcast', ...targets],
    body: text,
    networks: targets,
    timestamp: new Date().toISOString(),
    status: 'sent',
    dispatched: true,
    results,
  };
  await store.put(post);
  return json(res, 200, post) ?? true;
};

const handleOutreach = async (store, req, res, p, ctx) => {
  if (p !== '/api/outreach' || req.method !== 'POST') {
    return false;
  }
  const body = await readBody(req);
  const { query = '', text = '', networks = null, mode = 'preview' } = body;
  const makePlan = async () => {
    const audience = aggregateContacts(
      evalAudience(await store.query(), query)
    );
    return planOutreach({ audience, text, networks, mode });
  };
  if (mode !== 'queue') {
    return json(res, 200, await makePlan()) ?? true;
  }
  // Sending: the user confirms the previewed envelopes, and exactly
  // those are sent.
  const ok = await confirmed(ctx, res, {
    action: 'outreach.send',
    body,
    prepare: async () => {
      const plan = await makePlan();
      return { preview: plan, data: plan };
    },
  });
  if (!ok) {
    return true;
  }
  const results = await runOutreach(ok.data);
  return json(res, 200, { plan: ok.data, results }) ?? true;
};

const readEmailToken = async (store, { protocol, provider, secretId }) => {
  const ids = [
    secretId,
    provider ? `secret:email:${provider}:token` : null,
    protocol ? `secret:email:${protocol}:token` : null,
    'secret:email:token',
  ].filter(Boolean);
  for (const id of ids) {
    const link = await store.get(id);
    const token = link?.token ?? link?.value ?? link?.body ?? link?.text;
    if (token) {
      return token;
    }
  }
  return null;
};

const RAW_EMAIL_PROTOCOLS = new Set(['imap', 'pop3', 'smtp']);

const bodyValue = (body, key, aliases = []) => {
  const config = body.config ?? {};
  for (const name of [key, ...aliases]) {
    if (body[name] !== undefined) {
      return body[name];
    }
    if (config[name] !== undefined) {
      return config[name];
    }
  }
  return undefined;
};

const buildEmailLiveConfig = (body, protocol, provider, token) => ({
  ...(body.config ?? {}),
  protocol,
  provider,
  token,
  baseUrl: bodyValue(body, 'baseUrl'),
  accountId: bodyValue(body, 'accountId'),
  userId: bodyValue(body, 'userId'),
  host: bodyValue(body, 'host'),
  port: bodyValue(body, 'port'),
  secure: bodyValue(body, 'secure'),
  username: bodyValue(body, 'username', ['user']),
  password: bodyValue(body, 'password'),
  mailbox: bodyValue(body, 'mailbox'),
});

const withRawEmailTransport = (config) => {
  if (
    config.transport ||
    !RAW_EMAIL_PROTOCOLS.has(String(config.protocol).toLowerCase())
  ) {
    return config;
  }
  return { ...config, transport: createNodeEmailTransport(config) };
};

const emailLive = async (store, body, ctx) => {
  const protocol = bodyValue(body, 'protocol') ?? 'jmap';
  const provider = bodyValue(body, 'provider') ?? protocol;
  const token =
    bodyValue(body, 'token') ??
    (await readEmailToken(store, {
      protocol,
      provider,
      secretId: bodyValue(body, 'secretId'),
    }));
  const config = withRawEmailTransport(
    buildEmailLiveConfig(body, protocol, provider, token)
  );
  const factory = ctx?.emailLiveFactory ?? createEmailLive;
  return {
    protocol,
    provider,
    token,
    live: factory(config),
  };
};

const pullEmail = async (store, body, ctx) => {
  const { protocol, provider, token, live } = await emailLive(store, body, ctx);
  const result = await live.pullMessages({
    ...(body.options ?? {}),
    token,
    limit: body.limit ?? body.options?.limit,
    offset: body.offset ?? body.options?.offset,
  });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, 'email'));
  }
  return {
    source: 'email',
    protocol,
    provider,
    imported: links.length,
    rawCount: result.rawCount ?? links.length,
    nextOffset: result.nextOffset ?? null,
  };
};

// What the confirmation shows for a direct message, comment or email.
const RECIPIENT_FIELDS = ['to', 'chat', 'room', 'issue', 'repo'];
const firstOf = (objects, fields) => {
  for (const object of objects) {
    for (const field of fields) {
      if (object?.[field] !== undefined && object?.[field] !== null) {
        return object[field];
      }
    }
  }
  return null;
};

const messagePreview = (service, body) => {
  const content = firstOf([body], ['content', 'message', 'text']);
  const isText = typeof content === 'string';
  return {
    service,
    to: firstOf([isText ? null : content, body], RECIPIENT_FIELDS),
    subject: firstOf([isText ? null : content, body], ['subject']),
    text: isText ? content : firstOf([content], ['text', 'body']),
  };
};

/** Send only what the user confirmed (see ./confirmations.js). */
const confirmedSend = async (res, ctx, body, service, send) => {
  const ok = await confirmed(ctx, res, {
    action: `${service}.send`,
    body,
    prepare: async () => ({ preview: messagePreview(service, body) }),
  });
  return ok ? (json(res, 200, await send()) ?? true) : true;
};

const sendEmail = async (store, body, ctx) => {
  const { protocol, provider, token, live } = await emailLive(store, body, ctx);
  const result = await live.post(body.message ?? body.content ?? body, {
    ...(body.options ?? {}),
    token,
  });
  return { source: 'email', protocol, provider, result };
};

const handleEmail = async (store, req, res, p, ctx) => {
  if (p === '/api/email/pull' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, await pullEmail(store, body, ctx)) ?? true;
  }
  if (p === '/api/email/send' && req.method === 'POST') {
    const body = await readBody(req);
    return confirmedSend(res, ctx, body, 'email', () =>
      sendEmail(store, body, ctx)
    );
  }
  return false;
};

const readGithubToken = async (store, { secretId } = {}) => {
  const ids = [
    secretId,
    'secret:github:access-token',
    'secret:github:token',
  ].filter(Boolean);
  for (const id of ids) {
    const link = await store.get(id);
    const token = link?.token ?? link?.value ?? link?.body ?? link?.text;
    if (token) {
      return token;
    }
  }
  return null;
};

const githubLive = async (store, body, ctx) => {
  const token = body.token ?? (await readGithubToken(store, body));
  const factory = ctx?.githubLiveFactory ?? createGithubLive;
  const live = factory({
    token,
    owner: body.owner ?? null,
    repo: body.repo ?? null,
  });
  return { token, live };
};

const pullGithub = async (store, body, ctx) => {
  const { token, live } = await githubLive(store, body, ctx);
  const result = await live.pullMessages({ ...body, token });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, 'github'));
  }
  return {
    source: 'github',
    imported: links.length,
    rawCount: result.rawCount ?? links.length,
    nextOffset: result.nextOffset ?? null,
  };
};

const cloneGithub = async (store, body, ctx) => {
  const { token, live } = await githubLive(store, body, ctx);
  const result = await live.cloneRepo({ ...body, token, store });
  const stamped = (result.links ?? []).map((link) =>
    stampSourceLink(link, 'github')
  );
  for (const link of stamped) {
    await store.put(link);
  }
  return {
    source: 'github',
    indexId: result.indexLink?.id ?? null,
    fileCount: result.fileLinks?.length ?? 0,
    imported: stamped.length,
  };
};

const postGithubComment = async (store, body, ctx) => {
  const { token, live } = await githubLive(store, body, ctx);
  const result = await live.post(body.content ?? body.message ?? body, {
    ...body,
    token,
  });
  return { source: 'github', result };
};

const handleGithub = async (store, req, res, p, ctx) => {
  if (p === '/api/github/pull' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, await pullGithub(store, body, ctx)) ?? true;
  }
  if (p === '/api/github/clone' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, await cloneGithub(store, body, ctx)) ?? true;
  }
  if (p === '/api/github/post-comment' && req.method === 'POST') {
    const body = await readBody(req);
    return confirmedSend(res, ctx, body, 'github', () =>
      postGithubComment(store, body, ctx)
    );
  }
  return false;
};

const readUpworkToken = async (store, { secretId } = {}) => {
  const ids = [
    secretId,
    'secret:upwork:access-token',
    'secret:upwork:token',
  ].filter(Boolean);
  for (const id of ids) {
    const link = await store.get(id);
    const token = link?.token ?? link?.value ?? link?.body ?? link?.text;
    if (token) {
      return token;
    }
  }
  return null;
};

const upworkLive = async (store, body, ctx) => {
  const token = body.token ?? (await readUpworkToken(store, body));
  const factory = ctx?.upworkLiveFactory ?? createUpworkLive;
  const live = factory({
    token,
    baseUrl: body.baseUrl,
    organizationId: body.organizationId ?? null,
    operationOverrides: body.operationOverrides ?? {},
  });
  return { token, live };
};

const pullUpwork = async (store, body, ctx) => {
  const { token, live } = await upworkLive(store, body, ctx);
  const result = await live.pullMessages({ ...body, token });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, 'upwork'));
  }
  return {
    source: 'upwork',
    imported: links.length,
    rawCount: result.rawCount ?? links.length,
    nextOffset: result.nextOffset ?? null,
  };
};

const searchUpwork = async (store, body, ctx) => {
  const { token, live } = await upworkLive(store, body, ctx);
  const result = await live.searchJobs({ ...body, token });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, 'upwork'));
  }
  return {
    source: 'upwork',
    imported: links.length,
    rawCount: result.rawCount ?? links.length,
    links,
  };
};

const postUpworkMessage = async (store, body, ctx) => {
  const { token, live } = await upworkLive(store, body, ctx);
  const result = await live.post(body.content ?? body.message ?? body, {
    ...body,
    token,
  });
  if (result?.id) {
    await store.put(stampSourceLink(result, 'upwork'));
  }
  return { source: 'upwork', result };
};

const handleUpwork = async (store, req, res, p, ctx) => {
  if (p === '/api/upwork/pull' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, await pullUpwork(store, body, ctx)) ?? true;
  }
  if (p === '/api/upwork/search' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, await searchUpwork(store, body, ctx)) ?? true;
  }
  if (p === '/api/upwork/post-message' && req.method === 'POST') {
    const body = await readBody(req);
    return confirmedSend(res, ctx, body, 'upwork', () =>
      postUpworkMessage(store, body, ctx)
    );
  }
  return false;
};

const readPeoplePerHourToken = async (store, { secretId } = {}) => {
  const ids = [
    secretId,
    'secret:peopleperhour:access-token',
    'secret:peopleperhour:token',
  ].filter(Boolean);
  for (const id of ids) {
    const link = await store.get(id);
    const token = link?.token ?? link?.value ?? link?.body ?? link?.text;
    if (token) {
      return token;
    }
  }
  return null;
};

const peoplePerHourLive = async (store, body, ctx) => {
  const token = body.token ?? (await readPeoplePerHourToken(store, body));
  const factory = ctx?.peoplePerHourLiveFactory ?? createPeoplePerHourLive;
  const live = factory({
    token,
    baseUrl: body.baseUrl,
    endpointOverrides: body.endpointOverrides ?? {},
  });
  return { token, live };
};

const pullPeoplePerHour = async (store, body, ctx) => {
  const { token, live } = await peoplePerHourLive(store, body, ctx);
  const result = await live.pullMessages({ ...body, token });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, 'peopleperhour'));
  }
  return {
    source: 'peopleperhour',
    imported: links.length,
    rawCount: result.rawCount ?? links.length,
    nextOffset: result.nextOffset ?? null,
  };
};

const searchPeoplePerHour = async (store, body, ctx) => {
  const { token, live } = await peoplePerHourLive(store, body, ctx);
  const result = await live.searchProjects({ ...body, token });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, 'peopleperhour'));
  }
  return {
    source: 'peopleperhour',
    imported: links.length,
    rawCount: result.rawCount ?? links.length,
    links,
  };
};

const postPeoplePerHourMessage = async (store, body, ctx) => {
  const { token, live } = await peoplePerHourLive(store, body, ctx);
  const result = await live.post(body.content ?? body.message ?? body, {
    ...body,
    token,
  });
  if (result?.id) {
    await store.put(stampSourceLink(result, 'peopleperhour'));
  }
  return { source: 'peopleperhour', result };
};

const handlePeoplePerHour = async (store, req, res, p, ctx) => {
  if (p === '/api/peopleperhour/pull' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, await pullPeoplePerHour(store, body, ctx)) ?? true;
  }
  if (p === '/api/peopleperhour/search' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, await searchPeoplePerHour(store, body, ctx)) ?? true;
  }
  if (p === '/api/peopleperhour/post-message' && req.method === 'POST') {
    const body = await readBody(req);
    return confirmedSend(res, ctx, body, 'peopleperhour', () =>
      postPeoplePerHourMessage(store, body, ctx)
    );
  }
  return false;
};

const handleHardening = async (store, req, res, p, ctx) => {
  if (p === '/api/export-encrypted' && req.method === 'POST') {
    return handleExportEncrypted(store, req, res, ctx);
  }
  if (p === '/api/links/purge-tombstones' && req.method === 'POST') {
    return handlePurgeTombstones(store, req, res);
  }
  return false;
};

export const handleMutatingRoutes = async (store, req, res, p, url, ctx) =>
  (await handleLinks(store, req, res, p, url)) ||
  (await handlePatterns(store, req, res, p)) ||
  (await handleGraphs(store, req, res, p)) ||
  (await handleReplies(store, req, res, p)) ||
  (await handleProfile(store, req, res, p, ctx)) ||
  (await handleResume(store, req, res, p, ctx)) ||
  (await handleBroadcast(store, req, res, p, ctx)) ||
  (await handleOutreach(store, req, res, p, ctx)) ||
  (await handleEmail(store, req, res, p, ctx)) ||
  (await handleGithub(store, req, res, p, ctx)) ||
  (await handleUpwork(store, req, res, p, ctx)) ||
  (await handlePeoplePerHour(store, req, res, p, ctx)) ||
  (await handleHardening(store, req, res, p, ctx));
