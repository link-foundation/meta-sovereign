/**
 * The GitHub identity of a pulled item (R-Z11): which object on GitHub a
 * link is, so edit, delete, react and reply reach the right one.
 *
 * `link.externalId = { network: 'github', kind, id, nodeId, owner, repo,
 * number, inReplyTo? }` where `id` is the numeric REST id, `nodeId` the
 * GraphQL node id, `number` the issue / pull request / discussion number.
 * Items stored before this field existed have none: an action on them
 * refuses with `no-external-id` rather than guessing from the link id.
 */

import { codedError } from './http.js';

const KINDS = new Set([
  'issue',
  'pr',
  'issue-comment',
  'review-comment',
  'review',
  'discussion',
  'discussion-comment',
]);

const numberFromUrl = (url, pattern) => {
  const match = String(url ?? '').match(pattern);
  return match ? Number(match[1]) : null;
};

const numberOf = (kind, payload) => {
  if (kind === 'issue' || kind === 'pr' || kind === 'discussion') {
    return payload.number ?? payload.issue?.number ?? null;
  }
  return (
    numberFromUrl(payload.issue_url, /\/issues\/(\d+)/) ??
    numberFromUrl(payload.pull_request_url, /\/pulls\/(\d+)/) ??
    payload.pull_request_number ??
    payload.discussion_number ??
    null
  );
};

/** Attach the reference to a built link. `repoFull` is `owner/repo`. */
export const attachRef = (link, kind, payload, repoFull) => {
  const [owner, repo] = String(repoFull ?? '').split('/');
  const id = payload.id ?? payload.databaseId ?? null;
  const ref = {
    network: 'github',
    kind,
    id,
    nodeId: payload.node_id ?? payload.nodeId ?? null,
    owner: owner || null,
    repo: repo || null,
    number: numberOf(kind, payload),
    ...(payload.in_reply_to_id ? { inReplyTo: payload.in_reply_to_id } : {}),
  };
  return {
    ...link,
    externalId: ref,
    ...(id === null ? {} : { messageId: String(id) }),
    ...(payload.html_url ? { url: payload.html_url } : {}),
  };
};

const hasRepo = (ref) => Boolean(ref.owner && ref.repo);
const COMMENTS = ['issue-comment', 'review-comment'];

// What each action needs from the reference.
const NEEDS = {
  edit: (ref) =>
    hasRepo(ref) &&
    (COMMENTS.includes(ref.kind)
      ? ref.id
      : (ref.kind === 'issue' || ref.kind === 'pr') && ref.number),
  delete: (ref) => hasRepo(ref) && ref.id && COMMENTS.includes(ref.kind),
  react: (ref) => hasRepo(ref) && ref.id && COMMENTS.includes(ref.kind),
  reply: (ref) =>
    hasRepo(ref) &&
    (ref.kind === 'review-comment'
      ? ref.id && ref.number
      : ['issue', 'pr', 'issue-comment', 'review'].includes(ref.kind) &&
        ref.number),
};

const refusal = (message, code) =>
  Object.assign(codedError(message, code), { fallback: false });

/**
 * The reference of a link for an action, or a `no-external-id` refusal
 * (nothing was sent) when an old item has none or the kind cannot do it.
 */
export const requireRef = (link, action) => {
  const ref = link?.externalId;
  if (!ref || typeof ref !== 'object' || !KINDS.has(ref.kind)) {
    throw refusal(
      'this GitHub item was pulled before its id was kept; fetch the repository again to act on it',
      'no-external-id'
    );
  }
  if (!NEEDS[action]?.(ref)) {
    throw refusal(
      `GitHub cannot "${action}" a ${ref.kind} from here`,
      'unsupported-action'
    );
  }
  return ref;
};
