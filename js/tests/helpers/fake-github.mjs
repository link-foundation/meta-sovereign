// A fake GitHub on a loopback port (R-Z11): the REST lists the app reads
// (issues, comments, pulls, review comments, reviews, repos,
// notifications), `?since=` and sort by update, `per_page` paging with a
// `Link: rel="next"` header, ETag / If-None-Match and If-Modified-Since
// answers (304), rate-limit headers and a queue of refusals, a GraphQL
// endpoint for discussions, and the writes (recorded in `writes`).
// Nothing reaches the real GitHub.

import http from 'node:http';
import crypto from 'node:crypto';

const byUpdated = (a, b) => String(b.updated_at).localeCompare(a.updated_at);
const since = (list, value) =>
  value ? list.filter((i) => i.updated_at >= value) : list;

const page = (items, url, perPage) => {
  const n = Number(url.searchParams.get('page') ?? 1);
  const size = Number(url.searchParams.get('per_page') ?? perPage);
  const slice = items.slice((n - 1) * size, n * size);
  const more = n * size < items.length;
  const next = new URL(url);
  next.searchParams.set('page', String(n + 1));
  return { slice, link: more ? `<${next}>; rel="next"` : null };
};

const lists = (state, owner, repo, route, url) => {
  const key = `${owner}/${repo}`;
  const data = state.repos[key];
  if (!data) {
    return null;
  }
  const q = (name) => url.searchParams.get(name);
  switch (route) {
    case 'issues':
      return since([...(data.issues ?? [])], q('since')).sort(byUpdated);
    case 'issues/comments':
      return since([...(data.comments ?? [])], q('since')).sort(byUpdated);
    case 'pulls':
      return [...(data.pulls ?? [])].sort(byUpdated);
    case 'pulls/comments':
      return since([...(data.reviewComments ?? [])], q('since')).sort(
        byUpdated
      );
    default: {
      const match = route.match(/^pulls\/(\d+)\/reviews$/);
      return match ? (data.reviews?.[match[1]] ?? []) : null;
    }
  }
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const limitHeaders = (state) => ({
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': String(state.remaining ?? 4999),
  'x-ratelimit-reset': String(
    state.reset ?? Math.floor(Date.now() / 1000) + 3600
  ),
});

const conditional = (req, res, body, extra) => {
  const tag = `"${crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex')}"`;
  // Weak comparison (RFC 9110): Deno's server turns a strong ETag into W/"…".
  if (req.headers['if-none-match']?.replace(/^W\//, '') === tag) {
    send(res, 304, undefined, { etag: tag, ...extra });
    return true;
  }
  extra.etag = tag;
  return false;
};

const graphql = async (state, req, res, readJson) => {
  const { query, variables } = await readJson();
  state.graphql.push({ query, variables });
  if (state.graphqlError) {
    return send(res, 200, { errors: [state.graphqlError] });
  }
  if (/addDiscussionComment/.test(query)) {
    return send(res, 200, {
      data: {
        addDiscussionComment: {
          comment: { id: 'DC_new', databaseId: 900, url: 'u' },
        },
      },
    });
  }
  if (/discussion\(number/.test(query)) {
    return send(res, 200, {
      data: { repository: { discussion: { id: 'D_1' } } },
    });
  }
  const found = state.repos[`${variables.owner}/${variables.repo}`];
  return send(res, 200, {
    data: {
      repository: {
        hasDiscussionsEnabled: Boolean(found?.discussions),
        discussions: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: found?.discussions ?? [],
        },
      },
    },
  });
};

const writes = (state, req, url, body) => {
  state.writes.push({ method: req.method, path: url.pathname, body });
  return { id: 777, body: body?.body ?? null };
};

const rest = (state, req, res, url) => {
  const extra = limitHeaders(state);
  const queued = state.refuse.shift();
  if (queued) {
    return send(
      res,
      queued.status,
      { message: queued.message ?? 'refused' },
      {
        ...extra,
        ...queued.headers,
      }
    );
  }
  const repoMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/(.+)$/);
  let body = null;
  if (url.pathname === '/user/repos') {
    body = state.userRepos;
  } else if (url.pathname === '/notifications') {
    body = since(state.notifications, url.searchParams.get('since'));
    extra['x-poll-interval'] = String(state.pollInterval ?? 60);
    extra['last-modified'] =
      state.lastModified ?? 'Wed, 21 Oct 2026 07:28:00 GMT';
    if (req.headers['if-modified-since'] === extra['last-modified']) {
      return send(res, 304, undefined, extra);
    }
  } else if (repoMatch) {
    body = lists(state, repoMatch[1], repoMatch[2], repoMatch[3], url);
  }
  if (body === null) {
    return send(res, 404, { message: 'Not Found' }, extra);
  }
  const { slice, link } = page(body, url, 30);
  if (link) {
    extra.link = link;
  }
  if (conditional(req, res, slice, extra)) {
    return;
  }
  return send(res, 200, slice, extra);
};

export const startFakeGithub = async (initial = {}) => {
  const state = {
    repos: {},
    userRepos: [],
    notifications: [],
    refuse: [],
    requests: [],
    writes: [],
    graphql: [],
    ...initial,
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    state.requests.push({
      method: req.method,
      path: url.pathname,
      search: url.search,
      headers: req.headers,
    });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const text = Buffer.concat(chunks).toString();
      const readJson = async () => JSON.parse(text || '{}');
      if (url.pathname === '/graphql') {
        return graphql(state, req, res, readJson);
      }
      if (req.method !== 'GET') {
        const body = text ? JSON.parse(text) : null;
        const made = writes(state, req, url, body);
        return req.method === 'DELETE'
          ? send(res, 204, undefined)
          : send(res, 200, made);
      }
      return rest(state, req, res, url);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    state,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
