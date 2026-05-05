/**
 * GitHub source adapter (R-R1..R-R8).
 *
 * Two surfaces in one file:
 *
 *   - `githubSource.parseArchive(input)` ingests `gh api`-style JSON
 *     dumps (an array of payloads) or the standard envelope
 *     `{ issues, comments, pulls, reviews, reviewComments, discussions }`
 *     and yields `msg:github:<external_id>` links via
 *     `buildMessageLink()` (R-R1, R-R2).
 *
 *   - `createGithubLive({ token, owner, repo, fetchImpl, baseUrl })`
 *     wraps the REST API:
 *       - `pullMessages()` walks issues -> issue comments -> pulls ->
 *         PR review comments -> reviews (R-R3, R-R4).
 *       - `listRepos()` paginates `/user/repos` (R-R8).
 *       - `cloneRepo({ owner, repo, ref, store })` downloads the
 *         tarball, gunzips it, walks USTAR/PAX entries and writes one
 *         `repo:<owner>/<name>:file:<path>` link per file plus a
 *         `repo:<owner>/<name>` index link with metadata children
 *         (R-R6, R-R7).
 *       - `post(content, { issueNumber })` creates an issue / PR
 *         comment (R-R5).
 *
 * Pagination follows the `Link: rel="next"` header. The adapter is
 * dependency-free; the tarball walker uses `node:zlib` and a small
 * USTAR reader local to this file so the SPA bundle is unaffected by
 * the clone path.
 */

import { buildMessageLink } from './link.js';
import { authHeaders, requestJson, resolveOption } from './http.js';

const SOURCE = 'github';
const DEFAULT_BASE_URL = 'https://api.github.com';

const pickFirst = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
};

const repoFromIssueUrl = (url) => {
  if (typeof url !== 'string') {
    return null;
  }
  const match = url.match(/\/repos\/([^/]+\/[^/]+)\//);
  return match ? match[1] : null;
};

const repoFromPayload = (payload) =>
  pickFirst(
    payload.repository?.full_name,
    payload.base?.repo?.full_name,
    payload.head?.repo?.full_name,
    repoFromIssueUrl(
      payload.url ??
        payload.issue_url ??
        payload.pull_request_url ??
        payload.html_url
    )
  );

const senderFrom = (payload) =>
  String(
    pickFirst(
      payload.user?.login,
      payload.author?.login,
      payload.sender?.login,
      payload.user?.id,
      'unknown'
    )
  );

const issueChat = (payload) => {
  const repo = repoFromPayload(payload) ?? 'unknown';
  const number = payload.number ?? payload.issue?.number;
  return number ? `${repo}#${number}` : repo;
};

const commentChat = (payload) => {
  const repo = repoFromPayload(payload) ?? 'unknown';
  const issueUrl = payload.issue_url ?? payload.pull_request_url ?? '';
  const match = String(issueUrl).match(/\/(issues|pulls)\/(\d+)/);
  if (match) {
    return `${repo}#${match[2]}`;
  }
  return payload.path
    ? `${repo}#pr:${payload.pull_request_review_id ?? ''}`
    : repo;
};

const issueExternalId = (payload) => {
  const repo = repoFromPayload(payload);
  const number = payload.number ?? payload.issue?.number;
  if (repo && number) {
    return `issue:${repo}#${number}`;
  }
  return `issue:${payload.id}`;
};

const pullExternalId = (payload) => {
  const repo = repoFromPayload(payload);
  const number = payload.number ?? payload.pull_request?.number;
  if (repo && number) {
    return `pr:${repo}#${number}`;
  }
  return `pr:${payload.id}`;
};

const commentExternalId = (payload, kind) => {
  const repo = repoFromPayload(payload) ?? 'unknown';
  return `${kind}-comment:${repo}#${payload.id}`;
};

const reviewExternalId = (payload) => {
  const repo = repoFromPayload(payload) ?? 'unknown';
  const pull = payload.pull_request_url
    ? String(payload.pull_request_url).match(/\/pulls\/(\d+)/)?.[1]
    : null;
  return `review:${repo}#${pull ?? payload.pull_request_number ?? 'x'}:${payload.id}`;
};

const issueToLink = (payload) =>
  buildMessageLink({
    source: SOURCE,
    externalId: issueExternalId(payload),
    sender: senderFrom(payload),
    chat: issueChat(payload),
    body: payload.title
      ? `${payload.title}\n\n${payload.body ?? ''}`.trim()
      : (payload.body ?? ''),
    timestamp: payload.created_at ?? payload.updated_at ?? null,
  });

const pullToLink = (payload) =>
  buildMessageLink({
    source: SOURCE,
    externalId: pullExternalId(payload),
    sender: senderFrom(payload),
    chat: issueChat(payload),
    body: payload.title
      ? `${payload.title}\n\n${payload.body ?? ''}`.trim()
      : (payload.body ?? ''),
    timestamp: payload.created_at ?? payload.updated_at ?? null,
  });

const issueCommentToLink = (payload) =>
  buildMessageLink({
    source: SOURCE,
    externalId: commentExternalId(payload, 'issue'),
    sender: senderFrom(payload),
    chat: commentChat(payload),
    body: payload.body ?? '',
    timestamp: payload.created_at ?? payload.updated_at ?? null,
  });

const reviewCommentToLink = (payload) =>
  buildMessageLink({
    source: SOURCE,
    externalId: commentExternalId(payload, 'review'),
    sender: senderFrom(payload),
    chat: commentChat(payload),
    body: payload.body ?? '',
    timestamp: payload.created_at ?? payload.updated_at ?? null,
  });

const reviewToLink = (payload) =>
  buildMessageLink({
    source: SOURCE,
    externalId: reviewExternalId(payload),
    sender: senderFrom(payload),
    chat: commentChat(payload),
    body: payload.body
      ? `[${payload.state ?? 'review'}] ${payload.body}`
      : `[${payload.state ?? 'review'}]`,
    timestamp: payload.submitted_at ?? payload.created_at ?? null,
  });

const discussionToLink = (payload) =>
  buildMessageLink({
    source: SOURCE,
    externalId: `discussion:${repoFromPayload(payload) ?? 'unknown'}#${payload.number ?? payload.id}`,
    sender: senderFrom(payload),
    chat: `${repoFromPayload(payload) ?? 'unknown'}#discussion:${payload.number ?? payload.id}`,
    body: payload.title
      ? `${payload.title}\n\n${payload.body ?? ''}`.trim()
      : (payload.body ?? ''),
    timestamp: payload.created_at ?? payload.updated_at ?? null,
  });

const isDiscussion = (p) => p.kind === 'discussion' || p.discussion_id;
const isReviewComment = (p) => p.pull_request_review_id || p.diff_hunk;
const isReview = (p) =>
  p.state &&
  p.submitted_at &&
  (p.body !== undefined || p.html_url?.includes('#pullrequestreview-'));
const isIssueComment = (p) => p.issue_url || p.pull_request_url;
const isPull = (p) => p.pull_request || p.head?.sha;
const isIssue = (p) => p.title !== undefined && p.number !== undefined;

const CLASSIFIERS = [
  [isDiscussion, discussionToLink],
  [isReviewComment, reviewCommentToLink],
  [isReview, reviewToLink],
  [isIssueComment, issueCommentToLink],
  [isPull, pullToLink],
  [isIssue, issueToLink],
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
  [['issues'], issueToLink],
  [['pulls', 'pullRequests'], pullToLink],
  [['comments', 'issueComments'], issueCommentToLink],
  [['reviewComments', 'pullComments'], reviewCommentToLink],
  [['reviews'], reviewToLink],
  [['discussions'], discussionToLink],
];

const fieldFromEnvelope = (envelope, names) => {
  for (const name of names) {
    if (Array.isArray(envelope?.[name])) {
      return envelope[name];
    }
  }
  return [];
};

export const githubPayloadsToLinks = (input) => {
  if (!input) {
    return [];
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

const parseLinkHeader = (header) => {
  const out = {};
  if (!header) {
    return out;
  }
  for (const part of String(header).split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="?([^"]+)"?/);
    if (match) {
      out[match[2]] = match[1];
    }
  }
  return out;
};

const headerValue = (headers, name) => {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
  }
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
};

export const paginate = async (
  fetchImpl,
  url,
  { headers, maxPages = 50 } = {}
) => {
  let target = url;
  let pages = 0;
  const out = [];
  while (target && pages < maxPages) {
    const res = await fetchImpl(target, { method: 'GET', headers });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    const body = text ? JSON.parse(text) : null;
    if (Array.isArray(body)) {
      out.push(...body);
    } else if (body) {
      out.push(body);
    }
    const next = parseLinkHeader(headerValue(res.headers, 'Link')).next;
    target = next ?? null;
    pages += 1;
  }
  return out;
};

const buildUrl = (baseUrl, path, search = {}) => {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const trimTrailingNulls = (str) => {
  let end = str.length;
  while (end > 0 && str.charCodeAt(end - 1) === 0) {
    end -= 1;
  }
  return str.slice(0, end);
};

const TAR_BLOCK = 512;
const NULL_BLOCK = ' '.repeat(TAR_BLOCK);

const readUstarString = (bytes, offset, length) => {
  let end = offset;
  while (end < offset + length && bytes[end] !== 0) {
    end += 1;
  }
  return new TextDecoder('ascii').decode(bytes.slice(offset, end));
};

const readUstarOctal = (bytes, offset, length) => {
  const text = readUstarString(bytes, offset, length).trim();
  return text ? parseInt(text, 8) : 0;
};

export const readTarEntries = (bytes) => {
  const entries = [];
  let offset = 0;
  let pendingLongName = null;
  while (offset + TAR_BLOCK <= bytes.length) {
    const header = bytes.slice(offset, offset + TAR_BLOCK);
    const headerString = new TextDecoder('latin1').decode(header);
    if (headerString === NULL_BLOCK) {
      break;
    }
    const name = readUstarString(header, 0, 100);
    const size = readUstarOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] || 0x30);
    const prefix = readUstarString(header, 345, 155);
    const fullName = pendingLongName ?? (prefix ? `${prefix}/${name}` : name);
    const dataStart = offset + TAR_BLOCK;
    const padded = Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
    const body = bytes.slice(dataStart, dataStart + size);
    if (typeflag === 'L') {
      pendingLongName = trimTrailingNulls(new TextDecoder('utf8').decode(body));
    } else if (typeflag === '0' || typeflag === ' ') {
      entries.push({ name: fullName, size, body });
      pendingLongName = null;
    } else {
      // Skip directories, symlinks, PAX headers, etc.
      pendingLongName = null;
    }
    offset = dataStart + padded;
  }
  return entries;
};

const stripLeadingDir = (name) => {
  const slash = name.indexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
};

const gunzip = async (bytes) => {
  const zlib = await import('node:zlib');
  return new Promise((resolve, reject) => {
    zlib.gunzip(Buffer.from(bytes), (err, out) => {
      if (err) {
        reject(err);
      } else {
        resolve(new Uint8Array(out));
      }
    });
  });
};

const fileLink = ({ owner, repo, path, body, ref }) => ({
  id: `repo:${owner}/${repo}:file:${path}`,
  tokens: ['repo', owner, repo, 'file', path],
  source: SOURCE,
  owner,
  repo,
  path,
  ref: ref ?? null,
  size: body.length,
  body: new TextDecoder('utf8', { fatal: false }).decode(body),
});

const repoIndexLink = ({ owner, repo, ref, files, metadata }) => ({
  id: `repo:${owner}/${repo}`,
  tokens: ['repo', owner, repo],
  source: SOURCE,
  owner,
  repo,
  ref: ref ?? null,
  defaultBranch: metadata?.default_branch ?? null,
  description: metadata?.description ?? null,
  topics: metadata?.topics ?? [],
  pushedAt: metadata?.pushed_at ?? null,
  fileCount: files.length,
  children: files.map((f) => `repo:${owner}/${repo}:file:${f.path}`),
});

const pullGithubMessages = async (ctx, options) => {
  const { fetchImpl, baseUrl, headers, requireRepo } = ctx;
  const { owner: o, repo: r } = requireRepo(options);
  const auth = headers(options.token);
  const perPage = options.perPage ?? 100;
  const collect = async (path, search = {}) =>
    paginate(
      fetchImpl,
      buildUrl(baseUrl, path, { per_page: perPage, ...search }),
      { headers: auth, maxPages: options.maxPages ?? 50 }
    );

  const state = options.state ?? 'all';
  const issues = await collect(`/repos/${o}/${r}/issues`, { state });
  const issueComments = await collect(`/repos/${o}/${r}/issues/comments`);
  const pulls = await collect(`/repos/${o}/${r}/pulls`, { state });
  const reviewComments = await collect(`/repos/${o}/${r}/pulls/comments`);
  const reviews = [];
  for (const pr of pulls) {
    const prReviews = await collect(
      `/repos/${o}/${r}/pulls/${pr.number}/reviews`
    );
    for (const review of prReviews) {
      review.pull_request_url = pr.url;
      reviews.push(review);
    }
  }

  const links = [
    ...issues.filter((i) => !i.pull_request).map(issueToLink),
    ...issueComments.map(issueCommentToLink),
    ...pulls.map(pullToLink),
    ...reviewComments.map(reviewCommentToLink),
    ...reviews.map(reviewToLink),
  ];

  return {
    links,
    rawCount:
      issues.length +
      issueComments.length +
      pulls.length +
      reviewComments.length +
      reviews.length,
    nextOffset: null,
  };
};

const fetchRepoMetadata = async (ctx, o, r, auth, options) => {
  if (options.metadata) {
    return options.metadata;
  }
  if (options.fetchMetadata === false) {
    return null;
  }
  try {
    return await requestJson(
      ctx.fetchImpl,
      buildUrl(ctx.baseUrl, `/repos/${o}/${r}`),
      { headers: auth }
    );
  } catch {
    return null;
  }
};

const cloneGithubRepo = async (ctx, options) => {
  const { fetchImpl, baseUrl, headers, requireRepo } = ctx;
  const { owner: o, repo: r } = requireRepo(options);
  const auth = headers(options.token);
  const refPath = options.ref ? `/${options.ref}` : '';
  const archiveUrl = buildUrl(baseUrl, `/repos/${o}/${r}/tarball${refPath}`);
  const res = await fetchImpl(archiveUrl, {
    method: 'GET',
    headers: auth,
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: tarball ${o}/${r}`);
  }
  const buf = await res.arrayBuffer();
  const tar = await gunzip(new Uint8Array(buf));
  const entries = readTarEntries(tar);
  const metadata = await fetchRepoMetadata(ctx, o, r, auth, options);

  const files = entries
    .map((entry) => ({
      path: stripLeadingDir(entry.name),
      body: entry.body,
    }))
    .filter((f) => f.path && !f.path.endsWith('/'));

  const ref = options.ref ?? metadata?.default_branch ?? null;
  const fileLinks = files.map((f) =>
    fileLink({ owner: o, repo: r, path: f.path, body: f.body, ref })
  );
  const indexLink = repoIndexLink({
    owner: o,
    repo: r,
    ref,
    files,
    metadata,
  });

  const links = [indexLink, ...fileLinks];
  if (options.store) {
    for (const link of links) {
      await options.store.put(link);
    }
  }
  return { indexLink, fileLinks, links };
};

const postGithubComment = async (ctx, content, options) => {
  const { fetchImpl, baseUrl, headers, requireRepo } = ctx;
  const { owner: o, repo: r } = requireRepo(options);
  const text =
    typeof content === 'string'
      ? content
      : (content?.text ?? content?.body ?? '');
  if (!text) {
    throw new Error('github post text is required');
  }
  const issueNumber = options.issueNumber ?? content?.issueNumber;
  if (!issueNumber) {
    throw new Error('github post requires options.issueNumber');
  }
  return requestJson(
    fetchImpl,
    buildUrl(baseUrl, `/repos/${o}/${r}/issues/${issueNumber}/comments`),
    {
      method: 'POST',
      headers: headers(options.token),
      body: { body: text },
    }
  );
};

export const createGithubLive = ({
  token = null,
  owner = null,
  repo = null,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
} = {}) => {
  const resolvedToken = (override) =>
    resolveOption(override ?? token, 'GITHUB_TOKEN', 'GitHub access token');
  const headers = (override) => ({
    ...authHeaders(resolvedToken(override)),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  const requireRepo = (overrides = {}) => {
    const o = overrides.owner ?? owner;
    const r = overrides.repo ?? repo;
    if (!o || !r) {
      throw new Error('github live API requires owner and repo');
    }
    return { owner: o, repo: r };
  };
  const ctx = { fetchImpl, baseUrl, headers, requireRepo };

  return {
    pullMessages: (options = {}) => pullGithubMessages(ctx, options),
    listRepos: async (options = {}) => {
      const target = buildUrl(baseUrl, '/user/repos', {
        per_page: options.perPage ?? 100,
        affiliation:
          options.affiliation ?? 'owner,collaborator,organization_member',
        sort: options.sort ?? 'updated',
      });
      return paginate(fetchImpl, target, {
        headers: headers(options.token),
        maxPages: options.maxPages ?? 20,
      });
    },
    cloneRepo: (options = {}) => cloneGithubRepo(ctx, options),
    post: (content, options = {}) => postGithubComment(ctx, content, options),
  };
};

export const githubSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    return githubPayloadsToLinks(obj);
  },
  live: createGithubLive(),
};
