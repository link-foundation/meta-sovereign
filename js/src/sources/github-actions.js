/**
 * What the user does to a GitHub item: reply, edit, delete, react (R-Z11).
 *
 * Every action names the object by the reference kept at pull time
 * (`link.externalId`, ./github-ref.js) -- never by parsing the link id --
 * so an issue comment, a review comment and an issue body each reach their
 * own endpoint. An item pulled before the reference existed is refused with
 * `no-external-id`; nothing is sent and the browser is not tried.
 */

import { codedError, requestJson } from './http.js';
import { requireRef } from './github-ref.js';
import { replyToDiscussion } from './github-inbox.js';

export const GITHUB_EMOJI_TO_REACTION = {
  '👍': '+1',
  '👎': '-1',
  '😄': 'laugh',
  '🎉': 'hooray',
  '😕': 'confused',
  '❤️': 'heart',
  '🚀': 'rocket',
  '👀': 'eyes',
};

const api = (ctx, path) => `${ctx.baseUrl}${path}`;
const repoPath = (ref) => `/repos/${ref.owner}/${ref.repo}`;
// Issue and pull request conversation comments live under /issues, the
// inline comments on the diff under /pulls.
const commentPath = (ref) =>
  `${repoPath(ref)}/${ref.kind === 'review-comment' ? 'pulls' : 'issues'}/comments/${ref.id}`;

const send = (ctx, method, path, options, body) =>
  requestJson(ctx.fetchImpl, api(ctx, path), {
    method,
    headers: ctx.headers(options.token),
    ...(body === undefined ? {} : { body }),
  });

// A bare numeric id with an owner and repo is the old programmatic call.
const legacyRef = (ctx, id, options) => {
  const { owner, repo } = ctx.requireRepo(options);
  return { kind: 'issue-comment', id, owner, repo };
};

const refFor = (ctx, { id, link }, options, action) =>
  link ? requireRef(link, action) : legacyRef(ctx, id, options);

// An issue or pull request is shown as "title, blank line, body".
const titleAndBody = (text) => {
  const [title, ...rest] = String(text).split(/\n\s*\n/);
  return { title: title.trim(), body: rest.join('\n\n') };
};

export const editGithubComment = async (ctx, params = {}, options = {}) => {
  const ref = refFor(ctx, params, options, 'edit');
  if (ref.kind === 'issue' || ref.kind === 'pr') {
    return send(
      ctx,
      'PATCH',
      `${repoPath(ref)}/issues/${ref.number}`,
      options,
      titleAndBody(params.text)
    );
  }
  return send(ctx, 'PATCH', commentPath(ref), options, { body: params.text });
};

export const deleteGithubComments = async (ctx, params = {}, options = {}) => {
  const refs = params.links
    ? params.links.map((link) => requireRef(link, 'delete'))
    : (params.ids ?? []).map((id) => legacyRef(ctx, id, options));
  let deleted = 0;
  for (const ref of refs) {
    await send(ctx, 'DELETE', commentPath(ref), options);
    deleted += 1;
  }
  return { ok: true, deleted };
};

export const reactGithubComment = async (ctx, params = {}, options = {}) => {
  const content = GITHUB_EMOJI_TO_REACTION[params.emoji];
  if (!content) {
    throw Object.assign(
      codedError(
        params.emoji
          ? `github: unsupported reaction emoji: ${params.emoji}`
          : 'github: taking a reaction back needs its id and is not supported',
        'unsupported-action'
      ),
      { fallback: false }
    );
  }
  const ref = refFor(ctx, params, options, 'react');
  return send(ctx, 'POST', `${commentPath(ref)}/reactions`, options, {
    content,
  });
};

// `owner/repo#12` -- a chat of an issue or pull request.
const CHAT = /^([^/#\s]+)\/([^#\s]+)#(\d+)$/;
const DISCUSSION_CHAT = /^([^/#\s]+)\/([^#\s]+)#discussion:(\d+)$/;

const textOf = (content) =>
  typeof content === 'string'
    ? content
    : (content?.text ?? content?.body ?? '');

const chatOf = (content) =>
  content && typeof content === 'object' ? String(content.chat ?? '') : '';

const issueNumberOf = (content, options, parsed, reply) => {
  const number =
    options.issueNumber ?? content?.issueNumber ?? parsed?.[3] ?? reply?.number;
  if (!number) {
    throw codedError(
      'github post requires an issue or pull request number (options.issueNumber, or a chat like owner/repo#12)',
      'unsupported-chat'
    );
  }
  return number;
};

// The issue or pull request a post goes to: options, the reply's saved
// reference, or the chat `owner/repo#12`, in that order.
const issueEndpoint = (ctx, content, options) => {
  const parsed = chatOf(content).match(CHAT);
  const reply = content?.replyToLink?.externalId;
  const { owner, repo } = ctx.requireRepo({
    owner: options.owner ?? parsed?.[1] ?? reply?.owner,
    repo: options.repo ?? parsed?.[2] ?? reply?.repo,
  });
  const number = issueNumberOf(content, options, parsed, reply);
  return `/repos/${owner}/${repo}/issues/${number}/comments`;
};

// Where a post goes: a review comment's reply endpoint, or the issue.
const targetOf = (ctx, content, options) => {
  if (content?.replyToLink?.externalId?.kind === 'review-comment') {
    const ref = requireRef(content.replyToLink, 'reply');
    return `${repoPath(ref)}/pulls/${ref.number}/comments/${ref.id}/replies`;
  }
  return issueEndpoint(ctx, content, options);
};

const isDiscussionPost = (content) =>
  DISCUSSION_CHAT.test(chatOf(content)) ||
  Boolean(content?.replyToLink?.externalId?.kind?.startsWith('discussion'));

export const postGithubComment = async (ctx, content, options = {}) => {
  const text = textOf(content);
  if (!text) {
    throw new Error('github post text is required');
  }
  if (isDiscussionPost(content)) {
    const discussion = chatOf(content).match(DISCUSSION_CHAT);
    return replyToDiscussion(ctx, { content, text, discussion }, options);
  }
  return send(ctx, 'POST', targetOf(ctx, content, options), options, {
    body: text,
  });
};
