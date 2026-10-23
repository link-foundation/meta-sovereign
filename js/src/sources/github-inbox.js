/**
 * The parts of a GitHub inbox the issue endpoints do not give (R-Z11):
 *
 *   - Notifications (`GET /notifications`, classic token): mentions, review
 *     requests, assignments with their `reason`. Polled with `since` and
 *     `If-Modified-Since` (a 304 is free) and never faster than the
 *     `X-Poll-Interval` GitHub asks for. Marking read is a separate,
 *     explicit call (`markThreadRead`, `markAllRead`); fetching never does it.
 *   - Discussions through GraphQL (the REST API has none), read and reply,
 *     where the token has access. Lists are walked by `pageInfo`.
 */

import { codedError, requestJson } from './http.js';
import { attachRef } from './github-ref.js';
import { buildMessageLink } from './link.js';

const GRAPHQL_HEADERS = { 'Content-Type': 'application/json' };

export const graphqlUrl = (baseUrl) =>
  `${String(baseUrl).replace(/\/v3\/?$/, '')}/graphql`;

const query = async (ctx, token, text, variables) => {
  const page = await ctx.http.request(graphqlUrl(ctx.baseUrl), {
    method: 'POST',
    headers: { ...ctx.headers(token), ...GRAPHQL_HEADERS },
    body: { query: text, variables },
  });
  return checked(page.body);
};

const NOT_ALLOWED = /FORBIDDEN|NOT_FOUND|INSUFFICIENT_SCOPES|SAML/;

const checked = (body) => {
  if (body?.errors?.length) {
    const kinds = body.errors.map((e) => e.type ?? '').join(',');
    const message = body.errors.map((e) => e.message).join('; ');
    if (NOT_ALLOWED.test(kinds)) {
      throw codedError(
        `GitHub Discussions are not available to this token: ${message}`,
        'discussions-unavailable'
      );
    }
    throw codedError(`GitHub GraphQL: ${message}`, 'graphql-error');
  }
  return body?.data ?? null;
};

// ----- notifications -------------------------------------------------

const subjectOf = (subject = {}) => ({
  title: subject.title ?? '',
  type: subject.type ?? null,
  url: subject.url ?? null,
});

const notificationLink = (n) => ({
  id: `notification:github:${n.id}`,
  tokens: ['notification', 'github', String(n.id)],
  source: 'github',
  kind: 'notification',
  threadId: String(n.id),
  reason: n.reason ?? null,
  unread: Boolean(n.unread),
  updatedAt: n.updated_at ?? null,
  lastReadAt: n.last_read_at ?? null,
  repo: n.repository?.full_name ?? null,
  subject: subjectOf(n.subject),
  body: `[${n.reason ?? 'notification'}] ${subjectOf(n.subject).title}`.trim(),
  timestamp: n.updated_at ?? null,
});

/**
 * Fetch the inbox. `since` (ISO) and `lastModified` make the request
 * conditional; `notModified` true means nothing changed.
 */
export const fetchNotifications = async (ctx, options = {}) => {
  const url = new URL(`${ctx.baseUrl}/notifications`);
  url.searchParams.set('all', options.all ? 'true' : 'false');
  url.searchParams.set('per_page', String(options.perPage ?? 50));
  if (options.since) {
    url.searchParams.set('since', options.since);
  }
  const result = await ctx.http.pages(url.toString(), {
    headers: ctx.headers(options.token),
    lastModified: options.lastModified ?? null,
  });
  return {
    links: result.items.map(notificationLink),
    notModified: result.notModified,
    lastModified: result.head?.lastModified ?? options.lastModified ?? null,
    pollInterval: result.head?.pollInterval ?? null,
  };
};

const sendWrite = (ctx, method, path, options) =>
  requestJson(ctx.fetchImpl, `${ctx.baseUrl}${path}`, {
    method,
    headers: ctx.headers(options.token),
    body: method === 'PUT' ? { read: true } : undefined,
  });

/** Mark one notification thread read -- only ever on the user's request. */
export const markThreadRead = async (ctx, threadId, options = {}) => {
  if (!/^\d+$/.test(String(threadId))) {
    throw codedError('a notification thread id is needed', 'bad-request');
  }
  await sendWrite(ctx, 'PATCH', `/notifications/threads/${threadId}`, options);
  return { ok: true, threadId: String(threadId) };
};

/** Mark every notification read -- only ever on the user's request. */
export const markAllRead = async (ctx, options = {}) => {
  await sendWrite(ctx, 'PUT', '/notifications', options);
  return { ok: true, all: true };
};

// ----- discussions (GraphQL) ----------------------------------------

const AUTHOR = 'author { login }';
const COMMENT_FIELDS = `id databaseId body createdAt updatedAt url ${AUTHOR}`;
const DISCUSSIONS = `
query($owner: String!, $repo: String!, $after: String) {
  repository(owner: $owner, name: $repo) {
    hasDiscussionsEnabled
    discussions(first: 25, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id databaseId number title body createdAt updatedAt url ${AUTHOR}
        comments(first: 50) {
          pageInfo { hasNextPage endCursor }
          nodes { ${COMMENT_FIELDS} replies(first: 50) { nodes { ${COMMENT_FIELDS} } } }
        }
      }
    }
  }
}`;
const MORE_COMMENTS = `
query($id: ID!, $after: String) {
  node(id: $id) {
    ... on Discussion {
      comments(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ${COMMENT_FIELDS} replies(first: 50) { nodes { ${COMMENT_FIELDS} } } }
      }
    }
  }
}`;

const discussionPayload = (node, repoFull) => ({
  id: node.databaseId,
  node_id: node.id,
  number: node.number,
  title: node.title,
  body: node.body,
  user: { login: node.author?.login ?? 'ghost' },
  created_at: node.createdAt,
  updated_at: node.updatedAt,
  html_url: node.url,
  repository: { full_name: repoFull },
});

const commentLink = (node, discussion, repoFull, parent = null) => {
  const externalId = `discussion-comment:${repoFull}#${node.databaseId}`;
  const link = buildMessageLink({
    source: 'github',
    externalId,
    sender: node.author?.login ?? 'ghost',
    chat: `${repoFull}#discussion:${discussion.number}`,
    body: node.body ?? '',
    timestamp: node.createdAt,
    edited: node.updatedAt !== node.createdAt ? node.updatedAt : null,
    replyTo: parent
      ? `discussion-comment:${repoFull}#${parent.databaseId}`
      : null,
  });
  const withRef = attachRef(
    link,
    'discussion-comment',
    {
      id: node.databaseId,
      node_id: node.id,
      html_url: node.url,
      discussion_number: discussion.number,
    },
    repoFull
  );
  return {
    ...withRef,
    externalId: {
      ...withRef.externalId,
      discussionNodeId: discussion.id,
      // GitHub threads one level deep: a reply answers the top comment.
      parentNodeId: parent ? parent.id : node.id,
    },
  };
};

const commentLinks = (nodes, discussion, repoFull) =>
  nodes.flatMap((node) => [
    commentLink(node, discussion, repoFull),
    ...(node.replies?.nodes ?? []).map((reply) =>
      commentLink(reply, discussion, repoFull, node)
    ),
  ]);

const allComments = async (ctx, discussion, token) => {
  const first = discussion.comments;
  const nodes = [...(first?.nodes ?? [])];
  let info = first?.pageInfo;
  while (info?.hasNextPage) {
    const data = await query(ctx, token, MORE_COMMENTS, {
      id: discussion.id,
      after: info.endCursor,
    });
    const page = data?.node?.comments;
    nodes.push(...(page?.nodes ?? []));
    info = page?.pageInfo;
  }
  return nodes;
};

/**
 * Discussions of one repository, updated since `since` (ISO), newest
 * first, as links: the discussion and every comment and reply.
 * `discussionToLink` builds the first message. A repository with
 * discussions off gives none.
 */
export const fetchDiscussions = async (
  ctx,
  { owner, repo, token, since = null },
  discussionToLink
) => {
  const repoFull = `${owner}/${repo}`;
  const links = [];
  let after = null;
  for (;;) {
    const data = await query(ctx, token, DISCUSSIONS, { owner, repo, after });
    const found = data?.repository;
    if (!found?.hasDiscussionsEnabled) {
      return { links, enabled: false };
    }
    for (const node of found.discussions.nodes) {
      if (since && Date.parse(node.updatedAt) < Date.parse(since)) {
        return { links, enabled: true };
      }
      links.push(discussionToLink(discussionPayload(node, repoFull)));
      links.push(
        ...commentLinks(await allComments(ctx, node, token), node, repoFull)
      );
    }
    if (!found.discussions.pageInfo.hasNextPage) {
      return { links, enabled: true };
    }
    after = found.discussions.pageInfo.endCursor;
  }
};

const FIND_DISCUSSION = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { discussion(number: $number) { id } }
}`;
const ADD_COMMENT = `
mutation($discussionId: ID!, $body: String!, $replyToId: ID) {
  addDiscussionComment(input: {discussionId: $discussionId, body: $body, replyToId: $replyToId}) {
    comment { id databaseId url }
  }
}`;

// The discussion and the top comment a reply goes under.
const replyTarget = async (ctx, { content, discussion }, token) => {
  const ref = content?.replyToLink?.externalId;
  if (ref?.kind === 'discussion-comment' && ref.discussionNodeId) {
    return { discussionId: ref.discussionNodeId, replyToId: ref.parentNodeId };
  }
  if (ref?.kind === 'discussion' && ref.nodeId) {
    return { discussionId: ref.nodeId, replyToId: null };
  }
  if (!discussion) {
    throw Object.assign(
      codedError(
        'this GitHub discussion item has no id; fetch the repository again',
        'no-external-id'
      ),
      { fallback: false }
    );
  }
  const data = await query(ctx, token, FIND_DISCUSSION, {
    owner: discussion[1],
    repo: discussion[2],
    number: Number(discussion[3]),
  });
  const id = data?.repository?.discussion?.id;
  if (!id) {
    throw codedError('that discussion was not found', 'not-found');
  }
  return { discussionId: id, replyToId: null };
};

/** Reply in a discussion (a write: sent once, outcome marked if unclear). */
export const replyToDiscussion = async (ctx, request, options = {}) => {
  const target = await replyTarget(ctx, request, options.token);
  const body = await requestJson(ctx.fetchImpl, graphqlUrl(ctx.baseUrl), {
    method: 'POST',
    headers: { ...ctx.headers(options.token), ...GRAPHQL_HEADERS },
    body: {
      query: ADD_COMMENT,
      variables: { ...target, body: request.text },
    },
  });
  const data = checked(body);
  return data?.addDiscussionComment?.comment ?? null;
};
