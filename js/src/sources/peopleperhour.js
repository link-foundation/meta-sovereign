/**
 * PeoplePerHour source adapter (R-T1..R-T16).
 *
 * Two surfaces in one file:
 *
 *   - `peoplePerHourSource.parseArchive(input)` ingests:
 *       * an array of REST nodes / payloads,
 *       * the GDPR-style envelope
 *         `{ projects, proposals, workstreams, rooms, messages,
 *            invoices, hourstreams }`,
 *       * raw CSV strings (PeoplePerHour "Reports -> Earnings"
 *         exports).
 *     Output: one `msg:peopleperhour:<external_id>` link per message,
 *     plus `project:peopleperhour:*`, `proposal:peopleperhour:*`,
 *     `workstream:peopleperhour:*`, `room:peopleperhour:*`,
 *     `invoice:peopleperhour:*`,
 *     `hourstream:peopleperhour:<workstream>:<weekStart>` sibling
 *     links.
 *
 *   - `createPeoplePerHourLive({ token, fetchImpl, baseUrl,
 *                              endpointOverrides })` wraps the
 *     PeoplePerHour REST endpoint at
 *     `https://www.peopleperhour.com/api/v1` with
 *     `Authorization: Bearer <PAT>`:
 *       * `searchProjects({ query, sort, limit })` runs
 *         `GET /projects/search`.
 *       * `pullMessages({ stage, perspective, projectId, workstreamId,
 *                        roomId })` walks proposal / workstream rooms
 *         and their messages with cursor pagination.
 *       * `listWorkstreams({ perspective })` paginates the workstreams
 *         endpoint for the chosen perspective.
 *       * `post({ text }, { roomId, workstreamId })` issues
 *         `POST /workstreams/{id}/messages` (or
 *         `POST /proposals/{id}/messages`).
 *
 * `softCacheRetention(store, { ttlMs, now })` purges live-pulled
 * PeoplePerHour links whose `cacheTtlMs` has expired (R-T12);
 * archive-only links are left alone because the user owns those
 * rows.
 *
 * The adapter is dependency-free — same file works in Bun, Node,
 * Deno, and the browser.
 *
 * Several PeoplePerHour REST paths are unverified publicly because
 * the developer portal is gated; defaults document the likely paths
 * and `endpointOverrides` lets callers patch any operation without
 * forking the adapter.
 */

import { buildMessageLink } from './link.js';
import { authHeaders, requestJson, resolveOption } from './http.js';

const SOURCE = 'peopleperhour';
const DEFAULT_BASE_URL = 'https://www.peopleperhour.com/api/v1';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const pickFirst = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
};

const senderFrom = (payload) =>
  String(
    pickFirst(
      payload.author?.id,
      payload.author?.handle,
      payload.author?.name,
      payload.user?.id,
      payload.user?.login,
      payload.from?.id,
      payload.fromUserId,
      payload.freelancer?.id,
      payload.buyer?.id,
      payload.client?.id,
      'unknown'
    )
  );

const messageChat = (payload) => {
  const room = pickFirst(payload.roomId, payload.room?.id, payload.chatId);
  if (room) {
    return `room:${room}`;
  }
  const workstream = pickFirst(
    payload.workstreamId,
    payload.workstream?.id,
    payload.engagement?.id
  );
  if (workstream) {
    return `workstream:${workstream}`;
  }
  const proposal = pickFirst(payload.proposalId, payload.proposal?.id);
  if (proposal) {
    return `proposal:${proposal}`;
  }
  const project = pickFirst(payload.projectId, payload.project?.id);
  if (project) {
    return `project:${project}`;
  }
  return 'unknown';
};

const messageId = (payload) =>
  String(
    pickFirst(
      payload.id,
      payload.messageId,
      payload.uid,
      payload.externalId,
      `m:${Date.now()}:${Math.random().toString(16).slice(2)}`
    )
  );

const messageBody = (payload) =>
  pickFirst(payload.text, payload.body, payload.message, payload.content) ?? '';

const messageTimestamp = (payload) =>
  pickFirst(
    payload.createdAt,
    payload.created_at,
    payload.timestamp,
    payload.sentAt,
    payload.sent_at,
    payload.updatedAt
  );

const messageToLink = (payload) =>
  buildMessageLink({
    source: SOURCE,
    externalId: messageId(payload),
    sender: senderFrom(payload),
    chat: messageChat(payload),
    body: messageBody(payload),
    timestamp: messageTimestamp(payload),
  });

const projectLink = (payload) => {
  const id = String(pickFirst(payload.id, payload.projectId, payload.slug));
  return {
    id: `project:${SOURCE}:${id}`,
    tokens: ['project', SOURCE, id],
    source: SOURCE,
    title: payload.title ?? null,
    description: payload.description ?? null,
    status: payload.status ?? null,
    buyerId: pickFirst(payload.buyer?.id, payload.buyerId, payload.client?.id),
    budget: pickFirst(payload.budget, payload.price),
    createdAt: pickFirst(
      payload.createdAt,
      payload.created_at,
      payload.publishedAt
    ),
    children: [],
  };
};

const proposalLink = (payload) => {
  const id = String(pickFirst(payload.id, payload.proposalId));
  const projectId = pickFirst(payload.projectId, payload.project?.id);
  return {
    id: `proposal:${SOURCE}:${id}`,
    tokens: ['proposal', SOURCE, id],
    source: SOURCE,
    projectId: projectId ?? null,
    freelancerId: pickFirst(payload.freelancer?.id, payload.freelancerId),
    buyerId: pickFirst(payload.buyer?.id, payload.buyerId, payload.client?.id),
    status: payload.status ?? null,
    coverLetter: payload.coverLetter ?? payload.cover_letter ?? null,
    bidAmount: pickFirst(payload.bidAmount, payload.amount, payload.price),
    createdAt: pickFirst(payload.createdAt, payload.created_at),
    children: projectId ? [`project:${SOURCE}:${projectId}`] : [],
  };
};

const workstreamLink = (payload) => {
  const id = String(pickFirst(payload.id, payload.workstreamId));
  const projectId = pickFirst(payload.projectId, payload.project?.id);
  const roomId = pickFirst(payload.roomId, payload.room?.id);
  return {
    id: `workstream:${SOURCE}:${id}`,
    tokens: ['workstream', SOURCE, id],
    source: SOURCE,
    projectId: projectId ?? null,
    buyerId: pickFirst(payload.buyer?.id, payload.buyerId, payload.client?.id),
    freelancerId: pickFirst(payload.freelancer?.id, payload.freelancerId),
    status: payload.status ?? null,
    startDate: pickFirst(
      payload.startDate,
      payload.start_date,
      payload.startedAt
    ),
    endDate: pickFirst(payload.endDate, payload.end_date, payload.endedAt),
    type: pickFirst(payload.type, payload.engagementType),
    children: [
      ...(projectId ? [`project:${SOURCE}:${projectId}`] : []),
      ...(roomId ? [`room:${SOURCE}:${roomId}`] : []),
    ],
  };
};

const roomLink = (payload) => {
  const id = String(pickFirst(payload.id, payload.roomId));
  const workstreamId = pickFirst(payload.workstreamId, payload.workstream?.id);
  const projectId = pickFirst(payload.projectId, payload.project?.id);
  const proposalId = pickFirst(payload.proposalId, payload.proposal?.id);
  return {
    id: `room:${SOURCE}:${id}`,
    tokens: ['room', SOURCE, id],
    source: SOURCE,
    workstreamId: workstreamId ?? null,
    projectId: projectId ?? null,
    proposalId: proposalId ?? null,
    topic: payload.topic ?? payload.name ?? null,
    children: [
      ...(workstreamId ? [`workstream:${SOURCE}:${workstreamId}`] : []),
      ...(projectId ? [`project:${SOURCE}:${projectId}`] : []),
      ...(proposalId ? [`proposal:${SOURCE}:${proposalId}`] : []),
    ],
  };
};

const invoiceLink = (payload) => {
  const id = String(
    pickFirst(
      payload.id,
      payload.invoiceId,
      payload.refId,
      payload.ref_id,
      payload['Reference']
    )
  );
  return {
    id: `invoice:${SOURCE}:${id}`,
    tokens: ['invoice', SOURCE, id],
    source: SOURCE,
    type: pickFirst(payload.type, payload.Type),
    description: pickFirst(payload.description, payload.Description),
    net: pickFirst(payload.net, payload.Net, payload.amount),
    gross: pickFirst(payload.gross, payload.Gross),
    buyer: pickFirst(payload.buyer, payload.Buyer),
    freelancer: pickFirst(payload.freelancer, payload.Freelancer),
    reference: pickFirst(payload.reference, payload.Reference),
    date: pickFirst(payload.date, payload.Date, payload.timestamp),
    children: [],
  };
};

const hourstreamLink = (payload) => {
  const workstream = String(
    pickFirst(payload.workstreamId, payload.workstream?.id, 'unknown')
  );
  const weekStart = String(
    pickFirst(
      payload.weekStart,
      payload.week_start,
      payload.weekStartDate,
      'unknown'
    )
  );
  return {
    id: `hourstream:${SOURCE}:${workstream}:${weekStart}`,
    tokens: ['hourstream', SOURCE, workstream, weekStart],
    source: SOURCE,
    workstreamId: workstream,
    weekStart,
    hours: pickFirst(payload.hours, payload.totalHours, payload.duration),
    earnings: pickFirst(payload.earnings, payload.amount),
    memo: payload.memo ?? null,
    children: [`workstream:${SOURCE}:${workstream}`],
  };
};

const isMessage = (p) =>
  p &&
  (p.text !== undefined || p.body !== undefined || p.message !== undefined) &&
  (p.roomId !== undefined ||
    p.room !== undefined ||
    p.workstreamId !== undefined ||
    p.proposalId !== undefined ||
    p.author !== undefined ||
    p.from !== undefined);

const isProject = (p) =>
  p &&
  (p.title !== undefined || p.description !== undefined) &&
  (p.budget !== undefined ||
    p.price !== undefined ||
    p.publishedAt !== undefined ||
    p.buyer !== undefined ||
    p.projectType !== undefined);

const isProposal = (p) =>
  p &&
  (p.coverLetter !== undefined ||
    p.cover_letter !== undefined ||
    p.bidAmount !== undefined ||
    (p.projectId !== undefined && p.freelancerId !== undefined));

const isWorkstream = (p) =>
  p &&
  (p.startDate !== undefined ||
    p.start_date !== undefined ||
    p.engagementType !== undefined ||
    (p.buyerId !== undefined &&
      p.freelancerId !== undefined &&
      p.status !== undefined));

const isRoom = (p) =>
  p &&
  (p.topic !== undefined || p.name !== undefined) &&
  (p.workstreamId !== undefined ||
    p.projectId !== undefined ||
    p.proposalId !== undefined) &&
  p.text === undefined &&
  p.body === undefined;

const isInvoice = (p) =>
  p &&
  (p.net !== undefined ||
    p.Net !== undefined ||
    p.gross !== undefined ||
    p.Gross !== undefined) &&
  (p.reference !== undefined ||
    p.Reference !== undefined ||
    p.type !== undefined ||
    p.Type !== undefined);

const isHourstream = (p) =>
  p &&
  (p.weekStart !== undefined ||
    p.week_start !== undefined ||
    p.hours !== undefined ||
    p.totalHours !== undefined);

const CLASSIFIERS = [
  [isMessage, messageToLink],
  [isHourstream, hourstreamLink],
  [isInvoice, invoiceLink],
  [isRoom, roomLink],
  [isWorkstream, workstreamLink],
  [isProposal, proposalLink],
  [isProject, projectLink],
];

const classify = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  for (const [test, build] of CLASSIFIERS) {
    if (test(payload)) {
      return build(payload);
    }
  }
  return null;
};

const ENVELOPE_FIELDS = [
  [['projects'], projectLink],
  [['proposals'], proposalLink],
  [['workstreams'], workstreamLink],
  [['rooms'], roomLink],
  [['messages'], messageToLink],
  [['invoices'], invoiceLink],
  [['hourstreams', 'hour_streams'], hourstreamLink],
];

const fieldFromEnvelope = (envelope, names) => {
  for (const name of names) {
    if (Array.isArray(envelope?.[name])) {
      return envelope[name];
    }
  }
  return [];
};

// CSV row splitter — PeoplePerHour "Reports -> Earnings" exports
// quote fields containing commas with double-quotes; the inner double
// quote is escaped as "". Anything fancier (mid-field newlines) is
// not emitted by PeoplePerHour, so the splitter stays small.
const splitCsvRow = (line) => {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
};

const EARNINGS_HEADER_HINT =
  /^date\s*,\s*type\s*,\s*description\s*,\s*net\s*,\s*gross/i;

const parseCsvEarnings = (text) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const header = splitCsvRow(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvRow(lines[i]);
    if (cells.length === 1 && cells[0] === '') {
      continue;
    }
    const row = {};
    for (let c = 0; c < header.length; c += 1) {
      row[header[c]] = cells[c] ?? '';
    }
    rows.push(row);
  }
  return rows.map(invoiceLink);
};

export const peoplePerHourPayloadsToLinks = (input) => {
  if (!input) {
    return [];
  }
  if (typeof input === 'string') {
    if (EARNINGS_HEADER_HINT.test(input)) {
      return parseCsvEarnings(input);
    }
    try {
      return peoplePerHourPayloadsToLinks(JSON.parse(input));
    } catch {
      return [];
    }
  }
  if (Array.isArray(input)) {
    return input.map(classify).filter(Boolean);
  }
  const out = [];
  for (const [names, build] of ENVELOPE_FIELDS) {
    for (const item of fieldFromEnvelope(input, names)) {
      out.push(build(item));
    }
  }
  return out;
};

// --- Live REST -----------------------------------------------------------

const DEFAULT_ENDPOINTS = {
  searchProjects: { method: 'GET', path: '/projects/search' },
  listWorkstreams: { method: 'GET', path: '/workstreams' },
  workstreamMessages: {
    method: 'GET',
    path: (ids) =>
      `/workstreams/${encodeURIComponent(ids.workstreamId)}/messages`,
  },
  proposalMessages: {
    method: 'GET',
    path: (ids) => `/proposals/${encodeURIComponent(ids.proposalId)}/messages`,
  },
  projectProposals: {
    method: 'GET',
    path: (ids) => `/projects/${encodeURIComponent(ids.projectId)}/proposals`,
  },
  myProposals: { method: 'GET', path: '/me/proposals' },
  postWorkstreamMessage: {
    method: 'POST',
    path: (ids) =>
      `/workstreams/${encodeURIComponent(ids.workstreamId)}/messages`,
  },
  postProposalMessage: {
    method: 'POST',
    path: (ids) => `/proposals/${encodeURIComponent(ids.proposalId)}/messages`,
  },
};

const cacheStamp = (link, now) => ({
  ...link,
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
  cachedAt: now,
  softCache: true,
});

const resolvePath = (endpoint, ids = {}) =>
  typeof endpoint.path === 'function' ? endpoint.path(ids) : endpoint.path;

const restRequest = async (
  ctx,
  operationName,
  endpoint,
  { ids = {}, search = null, body = undefined, token } = {}
) => {
  const { fetchImpl, baseUrl, headers } = ctx;
  const path = resolvePath(endpoint, ids);
  const url = `${baseUrl}${path}`;
  try {
    return await requestJson(fetchImpl, url, {
      method: endpoint.method,
      headers: headers(token),
      search: search ?? undefined,
      body,
    });
  } catch (err) {
    throw new Error(`peopleperhour ${operationName}: ${err.message}`);
  }
};

const extractPageItems = (page) => {
  if (Array.isArray(page)) {
    return page;
  }
  return page.items ?? page.data ?? [];
};

const extractPageCursor = (page) => {
  if (Array.isArray(page)) {
    return null;
  }
  return pickFirst(page.nextCursor, page.next_cursor, page.cursor);
};

const paginateCursor = async (
  ctx,
  operationName,
  endpoint,
  { ids = {}, search = {}, token, maxPages = 50, picker = null } = {}
) => {
  let cursor = null;
  let pages = 0;
  const collected = [];
  const choose = picker ?? ((data) => data);
  while (pages < maxPages) {
    const data = await restRequest(ctx, operationName, endpoint, {
      ids,
      search: cursor ? { ...search, cursor } : search,
      token,
    });
    const page = choose(data) ?? data ?? {};
    for (const item of extractPageItems(page)) {
      if (item) {
        collected.push(item);
      }
    }
    const next = extractPageCursor(page);
    if (!next) {
      break;
    }
    cursor = next;
    pages += 1;
  }
  return collected;
};

const liveSearchProjects = async (ctx, options = {}) => {
  const endpoint = ctx.endpoint('searchProjects');
  const search = {
    query: options.query ?? options.q ?? undefined,
    sort: options.sort ?? undefined,
    limit: options.limit ?? options.first ?? 25,
  };
  const nodes = await paginateCursor(ctx, 'searchProjects', endpoint, {
    search,
    token: options.token,
    maxPages: options.maxPages ?? 1,
  });
  const now = Date.now();
  const links = nodes.map(projectLink).map((l) => cacheStamp(l, now));
  return {
    links,
    rawCount: nodes.length,
    nextOffset: null,
  };
};

const liveListWorkstreams = async (ctx, options = {}) => {
  const endpoint = ctx.endpoint('listWorkstreams');
  const search = {
    perspective: options.perspective ?? 'both',
    limit: options.perPage ?? 50,
  };
  return paginateCursor(ctx, 'listWorkstreams', endpoint, {
    search,
    token: options.token,
    maxPages: options.maxPages ?? 20,
  });
};

const liveListProjectProposals = async (ctx, projectId, options = {}) => {
  const endpoint = ctx.endpoint('projectProposals');
  return paginateCursor(ctx, 'projectProposals', endpoint, {
    ids: { projectId },
    search: { limit: options.perPage ?? 50 },
    token: options.token,
    maxPages: options.maxPages ?? 5,
  });
};

const liveListMyProposals = async (ctx, options = {}) => {
  const endpoint = ctx.endpoint('myProposals');
  return paginateCursor(ctx, 'myProposals', endpoint, {
    search: { limit: options.perPage ?? 50 },
    token: options.token,
    maxPages: options.maxPages ?? 20,
  });
};

const liveWorkstreamMessages = async (ctx, workstreamId, options = {}) => {
  const endpoint = ctx.endpoint('workstreamMessages');
  return paginateCursor(ctx, 'workstreamMessages', endpoint, {
    ids: { workstreamId },
    search: { limit: options.perPage ?? 100 },
    token: options.token,
    maxPages: options.maxPages ?? 50,
  });
};

const liveProposalMessages = async (ctx, proposalId, options = {}) => {
  const endpoint = ctx.endpoint('proposalMessages');
  return paginateCursor(ctx, 'proposalMessages', endpoint, {
    ids: { proposalId },
    search: { limit: options.perPage ?? 100 },
    token: options.token,
    maxPages: options.maxPages ?? 50,
  });
};

const collectWorkstreamStage = async (ctx, options, now) => {
  const out = [];
  const workstreams = options.workstreamId
    ? [{ id: options.workstreamId }]
    : await liveListWorkstreams(ctx, options);
  for (const ws of workstreams) {
    const wsLink = cacheStamp(workstreamLink(ws), now);
    out.push(wsLink);
    const messages = await liveWorkstreamMessages(ctx, ws.id, options);
    for (const msg of messages) {
      out.push(cacheStamp(messageToLink({ ...msg, workstreamId: ws.id }), now));
    }
  }
  return out;
};

const proposalsForOptions = async (ctx, options) => {
  if (options.proposalId) {
    return [{ id: options.proposalId, projectId: options.projectId ?? null }];
  }
  if (options.projectId) {
    return liveListProjectProposals(ctx, options.projectId, options);
  }
  if (
    options.perspective === 'freelancer' ||
    options.perspective === 'both' ||
    options.perspective === undefined
  ) {
    return liveListMyProposals(ctx, options);
  }
  return [];
};

const collectProposalStage = async (ctx, options, now) => {
  const proposals = await proposalsForOptions(ctx, options);
  const out = [];
  for (const proposal of proposals) {
    out.push(cacheStamp(proposalLink(proposal), now));
    const messages = await liveProposalMessages(ctx, proposal.id, options);
    for (const msg of messages) {
      out.push(
        cacheStamp(messageToLink({ ...msg, proposalId: proposal.id }), now)
      );
    }
  }
  return out;
};

const livePullMessages = async (ctx, options = {}) => {
  const stage = options.stage ?? 'all';
  const now = Date.now();

  if (options.roomId) {
    // PeoplePerHour rooms are scoped under workstreams in the live API;
    // a bare roomId still requires the workstream id, so callers should
    // pass either workstreamId or proposalId. We keep this branch so
    // tests can pin the behaviour.
    return { links: [], rawCount: 0, nextOffset: null };
  }

  const links = [];
  if (stage === 'workstream' || stage === 'all') {
    links.push(...(await collectWorkstreamStage(ctx, options, now)));
  }
  if (stage === 'proposal' || stage === 'all') {
    links.push(...(await collectProposalStage(ctx, options, now)));
  }

  return {
    links,
    rawCount: links.length,
    nextOffset: null,
  };
};

const extractPostText = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  return content?.text ?? content?.body ?? '';
};

const extractPostId = (options, content, key) => {
  if (options[key]) {
    return options[key];
  }
  if (content && typeof content === 'object') {
    return content[key] ?? null;
  }
  return null;
};

const livePost = async (ctx, content, options = {}) => {
  const text = extractPostText(content);
  if (!text) {
    throw new Error('peopleperhour post text is required');
  }
  const workstreamId = extractPostId(options, content, 'workstreamId');
  const proposalId = extractPostId(options, content, 'proposalId');
  if (!workstreamId && !proposalId) {
    throw new Error(
      'peopleperhour post requires options.workstreamId or options.proposalId'
    );
  }
  const endpoint = workstreamId
    ? ctx.endpoint('postWorkstreamMessage')
    : ctx.endpoint('postProposalMessage');
  const data = await restRequest(ctx, 'post', endpoint, {
    ids: { workstreamId, proposalId },
    body: { text },
    token: options.token,
  });
  const node = data?.message ?? data ?? {};
  return cacheStamp(
    messageToLink({ ...node, workstreamId, proposalId }),
    Date.now()
  );
};

export const createPeoplePerHourLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  endpointOverrides = {},
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(
      override ?? token,
      'PEOPLEPERHOUR_TOKEN',
      'PeoplePerHour access token'
    );
  const headers = (override) => ({
    ...authHeaders(resolvedToken(override)),
    Accept: 'application/json',
  });
  const endpoint = (name) => endpointOverrides[name] ?? DEFAULT_ENDPOINTS[name];
  const ctx = {
    fetchImpl,
    baseUrl,
    headers,
    endpoint,
  };

  return {
    searchProjects: (options = {}) => liveSearchProjects(ctx, options),
    listWorkstreams: (options = {}) => liveListWorkstreams(ctx, options),
    pullMessages: (options = {}) => livePullMessages(ctx, options),
    post: (content, options = {}) => livePost(ctx, content, options),
  };
};

export const softCacheRetention = async (
  store,
  { ttlMs = DEFAULT_CACHE_TTL_MS, now = Date.now() } = {}
) => {
  const links = await store.query();
  let purged = 0;
  for (const link of links) {
    if (link.source !== SOURCE) {
      continue;
    }
    if (!link.softCache || link.cachedAt === undefined) {
      continue;
    }
    const age = now - Number(link.cachedAt);
    if (age >= ttlMs) {
      await store.delete(link.id);
      purged += 1;
    }
  }
  return { purged };
};

export const peoplePerHourSource = {
  name: SOURCE,
  async parseArchive(archive) {
    if (typeof archive === 'string') {
      return peoplePerHourPayloadsToLinks(archive);
    }
    return peoplePerHourPayloadsToLinks(archive);
  },
  live: createPeoplePerHourLive(),
};
