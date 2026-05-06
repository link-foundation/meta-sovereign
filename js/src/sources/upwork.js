/**
 * Upwork source adapter (R-S1..R-S12).
 *
 * Two surfaces in one file:
 *
 *   - `upworkSource.parseArchive(input)` ingests:
 *       * an array of GraphQL nodes / `gh-api`-style payloads,
 *       * the GDPR-style envelope
 *         `{ jobs, proposals, contracts, rooms, messages,
 *            transactions, timeLogs }`,
 *       * raw CSV strings (Upwork "Reports -> Transaction History").
 *     Output: one `msg:upwork:<external_id>` link per message, plus
 *     `job:upwork:*`, `proposal:upwork:*`, `contract:upwork:*`,
 *     `room:upwork:*`, `transaction:upwork:*`,
 *     `timelog:upwork:<contract>:<weekStart>` sibling links.
 *
 *   - `createUpworkLive({ token, fetchImpl, baseUrl, organizationId,
 *                        operationOverrides })` wraps the Upwork
 *     GraphQL endpoint with `Authorization: Bearer <PAT>`:
 *       * `searchJobs({ query, sort, limit })` runs
 *         `marketplaceJobPostingsSearch`.
 *       * `pullMessages({ stage, perspective, jobId, contractId,
 *                        roomId })` walks proposal / contract rooms
 *         and their messages with Relay-style cursor pagination.
 *       * `listContracts({ perspective })` paginates the contracts
 *         connection.
 *       * `post({ text }, { roomId, contractId })` issues the
 *         `roomsCreateMessage` mutation.
 *
 * `softCacheRetention(store, { ttlMs, now })` purges live-pulled
 * Upwork links whose `cacheTtlMs` has expired (R-S12); archive-only
 * links are left alone because the user owns those rows.
 *
 * The adapter is dependency-free — same file works in Bun, Node,
 * Deno, and the browser.
 *
 * Several Upwork GraphQL field names are unverified publicly because
 * the docs portal is gated; defaults document the likely names and
 * `operationOverrides` lets callers patch any operation without
 * forking the adapter.
 */

import { buildMessageLink } from './link.js';
import { authHeaders, requestJson, resolveOption } from './http.js';

const SOURCE = 'upwork';
const DEFAULT_BASE_URL = 'https://api.upwork.com/graphql';
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
      payload.client?.id,
      'unknown'
    )
  );

const messageChat = (payload) => {
  const room = pickFirst(payload.roomId, payload.room?.id, payload.chatId);
  if (room) {
    return `room:${room}`;
  }
  const contract = pickFirst(
    payload.contractId,
    payload.contract?.id,
    payload.engagement?.id
  );
  if (contract) {
    return `contract:${contract}`;
  }
  const proposal = pickFirst(payload.proposalId, payload.proposal?.id);
  if (proposal) {
    return `proposal:${proposal}`;
  }
  const job = pickFirst(payload.jobId, payload.job?.id);
  if (job) {
    return `job:${job}`;
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

const jobLink = (payload) => {
  const id = String(pickFirst(payload.id, payload.jobId, payload.ciphertext));
  return {
    id: `job:${SOURCE}:${id}`,
    tokens: ['job', SOURCE, id],
    source: SOURCE,
    title: payload.title ?? null,
    description: payload.description ?? null,
    status: payload.status ?? null,
    clientId: pickFirst(payload.client?.id, payload.clientId),
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
  const jobId = pickFirst(payload.jobId, payload.job?.id);
  return {
    id: `proposal:${SOURCE}:${id}`,
    tokens: ['proposal', SOURCE, id],
    source: SOURCE,
    jobId: jobId ?? null,
    freelancerId: pickFirst(payload.freelancer?.id, payload.freelancerId),
    clientId: pickFirst(payload.client?.id, payload.clientId),
    status: payload.status ?? null,
    coverLetter: payload.coverLetter ?? payload.cover_letter ?? null,
    createdAt: pickFirst(payload.createdAt, payload.created_at),
    children: jobId ? [`job:${SOURCE}:${jobId}`] : [],
  };
};

const contractLink = (payload) => {
  const id = String(pickFirst(payload.id, payload.contractId));
  const jobId = pickFirst(payload.jobId, payload.job?.id);
  const roomId = pickFirst(payload.roomId, payload.room?.id);
  return {
    id: `contract:${SOURCE}:${id}`,
    tokens: ['contract', SOURCE, id],
    source: SOURCE,
    jobId: jobId ?? null,
    clientId: pickFirst(payload.client?.id, payload.clientId),
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
      ...(jobId ? [`job:${SOURCE}:${jobId}`] : []),
      ...(roomId ? [`room:${SOURCE}:${roomId}`] : []),
    ],
  };
};

const roomLink = (payload) => {
  const id = String(pickFirst(payload.id, payload.roomId));
  const contractId = pickFirst(payload.contractId, payload.contract?.id);
  const jobId = pickFirst(payload.jobId, payload.job?.id);
  return {
    id: `room:${SOURCE}:${id}`,
    tokens: ['room', SOURCE, id],
    source: SOURCE,
    contractId: contractId ?? null,
    jobId: jobId ?? null,
    topic: payload.topic ?? payload.name ?? null,
    children: [
      ...(contractId ? [`contract:${SOURCE}:${contractId}`] : []),
      ...(jobId ? [`job:${SOURCE}:${jobId}`] : []),
    ],
  };
};

const transactionLink = (payload) => {
  const id = String(
    pickFirst(
      payload.id,
      payload.refId,
      payload.ref_id,
      payload.transactionId,
      payload['Ref ID']
    )
  );
  return {
    id: `transaction:${SOURCE}:${id}`,
    tokens: ['transaction', SOURCE, id],
    source: SOURCE,
    type: pickFirst(payload.type, payload.Type),
    description: pickFirst(payload.description, payload.Description),
    amount: pickFirst(payload.amount, payload.Amount),
    balance: pickFirst(payload.balance, payload.Balance),
    freelancer: pickFirst(payload.freelancer, payload.Freelancer),
    team: pickFirst(payload.team, payload.Team),
    accountName: pickFirst(payload.accountName, payload['Account name']),
    po: pickFirst(payload.po, payload.PO),
    date: pickFirst(payload.date, payload.Date, payload.timestamp),
    children: [],
  };
};

const timeLogLink = (payload) => {
  const contract = String(
    pickFirst(payload.contractId, payload.contract?.id, 'unknown')
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
    id: `timelog:${SOURCE}:${contract}:${weekStart}`,
    tokens: ['timelog', SOURCE, contract, weekStart],
    source: SOURCE,
    contractId: contract,
    weekStart,
    hours: pickFirst(payload.hours, payload.totalHours, payload.duration),
    earnings: pickFirst(payload.earnings, payload.amount),
    memo: payload.memo ?? null,
    children: [`contract:${SOURCE}:${contract}`],
  };
};

const isMessage = (p) =>
  p &&
  (p.text !== undefined || p.body !== undefined || p.message !== undefined) &&
  (p.roomId !== undefined ||
    p.room !== undefined ||
    p.contractId !== undefined ||
    p.proposalId !== undefined ||
    p.author !== undefined ||
    p.from !== undefined);
const isJob = (p) =>
  p &&
  (p.title !== undefined || p.description !== undefined) &&
  (p.budget !== undefined ||
    p.hourlyBudget !== undefined ||
    p.publishedAt !== undefined ||
    p.client !== undefined ||
    p.jobType !== undefined);
const isProposal = (p) =>
  p &&
  (p.coverLetter !== undefined ||
    p.cover_letter !== undefined ||
    (p.jobId !== undefined && p.freelancerId !== undefined));
const isContract = (p) =>
  p &&
  (p.startDate !== undefined ||
    p.start_date !== undefined ||
    p.engagementType !== undefined ||
    (p.clientId !== undefined &&
      p.freelancerId !== undefined &&
      p.status !== undefined));
const isRoom = (p) =>
  p &&
  (p.topic !== undefined || p.name !== undefined) &&
  (p.contractId !== undefined || p.jobId !== undefined) &&
  p.text === undefined &&
  p.body === undefined;
const isTransaction = (p) =>
  p &&
  (p.amount !== undefined || p.Amount !== undefined) &&
  (p.balance !== undefined ||
    p.Balance !== undefined ||
    p.type !== undefined ||
    p.Type !== undefined);
const isTimeLog = (p) =>
  p &&
  (p.weekStart !== undefined ||
    p.week_start !== undefined ||
    p.hours !== undefined ||
    p.totalHours !== undefined);

const CLASSIFIERS = [
  [isMessage, messageToLink],
  [isTimeLog, timeLogLink],
  [isTransaction, transactionLink],
  [isRoom, roomLink],
  [isContract, contractLink],
  [isProposal, proposalLink],
  [isJob, jobLink],
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
  [['jobs'], jobLink],
  [['proposals'], proposalLink],
  [['contracts'], contractLink],
  [['rooms'], roomLink],
  [['messages'], messageToLink],
  [['transactions'], transactionLink],
  [['timeLogs', 'time_logs'], timeLogLink],
];

const fieldFromEnvelope = (envelope, names) => {
  for (const name of names) {
    if (Array.isArray(envelope?.[name])) {
      return envelope[name];
    }
  }
  return [];
};

// CSV row splitter — Upwork "Reports -> Transaction History" exports
// quote fields containing commas with double-quotes; the inner double
// quote is escaped as "". Anything fancier (mid-field newlines) is not
// emitted by Upwork, so the splitter stays small.
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

const TRANSACTION_HEADER_HINT =
  /^date\s*,\s*type\s*,\s*description\s*,\s*amount/i;

const parseCsvTransactions = (text) => {
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
  return rows.map(transactionLink);
};

export const upworkPayloadsToLinks = (input) => {
  if (!input) {
    return [];
  }
  if (typeof input === 'string') {
    if (TRANSACTION_HEADER_HINT.test(input)) {
      return parseCsvTransactions(input);
    }
    try {
      return upworkPayloadsToLinks(JSON.parse(input));
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

// --- Live GraphQL --------------------------------------------------------

const DEFAULT_OPERATIONS = {
  searchJobs: `
    query SearchJobs($filter: MarketplaceJobFilter, $sort: MarketplaceJobSort, $first: Int, $after: String) {
      marketplaceJobPostingsSearch(marketPlaceJobFilter: $filter, sortAttributes: [$sort], pagination: { first: $first, after: $after }) {
        edges {
          node {
            id
            title
            description
            createdDateTime
            client { id name }
          }
          cursor
        }
        pageInfo { endCursor hasNextPage }
      }
    }
  `,
  listContracts: `
    query ListContracts($perspective: ContractPerspective, $first: Int, $after: String) {
      contracts(perspective: $perspective, first: $first, after: $after) {
        edges {
          node {
            id
            jobId
            status
            type
            startDate
            client { id }
            freelancer { id }
            roomId
          }
        }
        pageInfo { endCursor hasNextPage }
      }
    }
  `,
  listRooms: `
    query ListRooms($organizationId: ID, $first: Int, $after: String, $filter: RoomFilter) {
      roomsListRooms(organizationId: $organizationId, pagination: { first: $first, after: $after }, filter: $filter) {
        edges {
          node {
            id
            topic
            contractId
            jobId
          }
        }
        pageInfo { endCursor hasNextPage }
      }
    }
  `,
  roomMessages: `
    query RoomMessages($roomId: ID!, $first: Int, $after: String) {
      roomsRoomMessages(roomId: $roomId, pagination: { first: $first, after: $after }) {
        edges {
          node {
            id
            text
            createdAt
            author { id }
          }
        }
        pageInfo { endCursor hasNextPage }
      }
    }
  `,
  createMessage: `
    mutation CreateMessage($roomId: ID!, $text: String!) {
      roomsCreateMessage(input: { roomId: $roomId, text: $text }) {
        message {
          id
          text
          createdAt
          author { id }
        }
      }
    }
  `,
};

const cacheStamp = (link, now) => ({
  ...link,
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
  cachedAt: now,
  softCache: true,
});

const graphql = async (ctx, operationName, query, variables) => {
  const { fetchImpl, baseUrl, headers } = ctx;
  const body = { query, variables };
  const result = await requestJson(fetchImpl, baseUrl, {
    method: 'POST',
    headers: headers(),
    body,
  });
  if (result?.errors?.length) {
    const detail = result.errors.map((e) => e.message ?? '').join('; ');
    throw new Error(`upwork ${operationName}: ${detail}`);
  }
  return result?.data ?? {};
};

const paginateConnection = async (
  ctx,
  operationName,
  query,
  variables,
  picker
) => {
  let after = null;
  let pages = 0;
  const collected = [];
  while (pages < (variables.maxPages ?? 50)) {
    const data = await graphql(ctx, operationName, query, {
      ...variables,
      after,
    });
    const conn = picker(data);
    const edges = conn?.edges ?? [];
    for (const edge of edges) {
      if (edge?.node) {
        collected.push(edge.node);
      }
    }
    const info = conn?.pageInfo ?? {};
    if (!info.hasNextPage || !info.endCursor) {
      break;
    }
    after = info.endCursor;
    pages += 1;
  }
  return collected;
};

const liveSearchJobs = async (ctx, options = {}) => {
  const operation = ctx.operation('searchJobs');
  const variables = {
    filter:
      options.filter ??
      (options.query ? { searchExpression: options.query } : null),
    sort: options.sort ?? null,
    first: options.limit ?? 25,
    maxPages: options.maxPages ?? 1,
  };
  const nodes = await paginateConnection(
    ctx,
    'searchJobs',
    operation,
    variables,
    (data) => data.marketplaceJobPostingsSearch
  );
  const now = Date.now();
  const links = nodes.map(jobLink).map((l) => cacheStamp(l, now));
  return {
    links,
    rawCount: nodes.length,
    nextOffset: null,
  };
};

const liveListContracts = async (ctx, options = {}) => {
  const operation = ctx.operation('listContracts');
  const variables = {
    perspective: options.perspective ?? 'BOTH',
    first: options.perPage ?? 50,
    maxPages: options.maxPages ?? 20,
  };
  const nodes = await paginateConnection(
    ctx,
    'listContracts',
    operation,
    variables,
    (data) => data.contracts
  );
  return nodes;
};

const liveListRoomsForContract = async (ctx, contractId, options) => {
  const operation = ctx.operation('listRooms');
  const variables = {
    organizationId: ctx.organizationId,
    filter: { contractId },
    first: options.perPage ?? 50,
    maxPages: options.maxPages ?? 5,
  };
  return paginateConnection(
    ctx,
    'listRooms',
    operation,
    variables,
    (data) => data.roomsListRooms
  );
};

const liveRoomMessages = async (ctx, roomId, options) => {
  const operation = ctx.operation('roomMessages');
  const variables = {
    roomId,
    first: options.perPage ?? 100,
    maxPages: options.maxPages ?? 50,
  };
  return paginateConnection(
    ctx,
    'roomMessages',
    operation,
    variables,
    (data) => data.roomsRoomMessages
  );
};

const collectRoomMessages = async (ctx, roomId, parentLinks, now, options) => {
  const messages = await liveRoomMessages(ctx, roomId, options);
  const out = messages.map((msg) =>
    cacheStamp(messageToLink({ ...msg, roomId }), now)
  );
  for (const link of parentLinks) {
    out.push(cacheStamp(link, now));
  }
  return out;
};

const roomsForContract = async (ctx, contract, options) => {
  if (contract.roomId) {
    return [
      { id: contract.roomId, contractId: contract.id, jobId: contract.jobId },
    ];
  }
  return liveListRoomsForContract(ctx, contract.id, options);
};

const collectContractStage = async (ctx, options, now) => {
  const perspective = options.perspective ?? 'both';
  const contracts = await liveListContracts(ctx, {
    ...options,
    perspective: perspective === 'both' ? 'BOTH' : perspective.toUpperCase(),
  });
  const filtered = options.contractId
    ? contracts.filter((c) => c.id === options.contractId)
    : contracts;
  const out = [];
  for (const contract of filtered) {
    const rooms = await roomsForContract(ctx, contract, options);
    for (const room of rooms) {
      const roomLnk = roomLink({ ...room, contractId: contract.id });
      out.push(
        ...(await collectRoomMessages(ctx, room.id, [roomLnk], now, options))
      );
    }
    out.push(cacheStamp(contractLink(contract), now));
  }
  return out;
};

const collectProposalStage = async (ctx, options, now) => {
  if (!options.jobId) {
    return [];
  }
  const rooms = await liveListRoomsForContract(ctx, null, {
    ...options,
    filter: { jobId: options.jobId },
  });
  const out = [];
  for (const room of rooms) {
    const roomLnk = roomLink({ ...room, jobId: options.jobId });
    out.push(
      ...(await collectRoomMessages(ctx, room.id, [roomLnk], now, options))
    );
  }
  return out;
};

const livePullMessages = async (ctx, options = {}) => {
  const stage = options.stage ?? 'all';
  const now = Date.now();

  if (options.roomId) {
    const links = await collectRoomMessages(
      ctx,
      options.roomId,
      [],
      now,
      options
    );
    return { links, rawCount: links.length, nextOffset: null };
  }

  const links = [];
  if (stage === 'contract' || stage === 'all') {
    links.push(...(await collectContractStage(ctx, options, now)));
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

const livePost = async (ctx, content, options = {}) => {
  const text =
    typeof content === 'string'
      ? content
      : (content?.text ?? content?.body ?? '');
  if (!text) {
    throw new Error('upwork post text is required');
  }
  const roomId =
    options.roomId ?? (typeof content === 'object' ? content?.roomId : null);
  if (!roomId) {
    throw new Error('upwork post requires options.roomId');
  }
  const operation = ctx.operation('createMessage');
  const data = await graphql(ctx, 'createMessage', operation, { roomId, text });
  const node = data.roomsCreateMessage?.message ?? null;
  if (!node) {
    throw new Error('upwork post: empty response');
  }
  return cacheStamp(messageToLink({ ...node, roomId }), Date.now());
};

export const createUpworkLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  organizationId = null,
  operationOverrides = {},
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(override ?? token, 'UPWORK_TOKEN', 'Upwork access token');
  const headers = (override) => ({
    ...authHeaders(resolvedToken(override)),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(organizationId
      ? { 'X-Upwork-API-TenantId': String(organizationId) }
      : {}),
  });
  const operation = (name) =>
    operationOverrides[name] ?? DEFAULT_OPERATIONS[name];
  const ctx = {
    fetchImpl,
    baseUrl,
    headers,
    organizationId,
    operation,
  };

  return {
    searchJobs: (options = {}) => liveSearchJobs(ctx, options),
    listContracts: (options = {}) => liveListContracts(ctx, options),
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

export const upworkSource = {
  name: SOURCE,
  async parseArchive(archive) {
    if (typeof archive === 'string') {
      return upworkPayloadsToLinks(archive);
    }
    return upworkPayloadsToLinks(archive);
  },
  live: createUpworkLive(),
};
