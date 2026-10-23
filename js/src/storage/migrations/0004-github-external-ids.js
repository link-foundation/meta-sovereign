/**
 * 0004 — GitHub items remember which object on GitHub they are (R-Z11,
 * R-Z17).
 *
 * Before R-Z11 a pulled GitHub link kept only its link id and `raw: { id,
 * url, node_id }`. R-Z11 stores `externalId = { network: 'github', kind,
 * id, nodeId, owner, repo, number }` and `messageId` (the REST id), which
 * edit, delete, react and reply use to reach the right endpoint.
 *
 * Backfilled only from fields already stored: the kind and the number /
 * REST id from the link id (`msg:github:<kind>:<owner>/<repo>#<n>`), the
 * owner and repository from `raw.url` (`/repos/o/r/` or a github.com page)
 * with the link id as the fallback, the REST and node ids from `raw`, a
 * comment's issue or pull number from its chat (`o/r#12`). A link where
 * the repository or the object cannot be worked out stays as it is and
 * keeps refusing edit/delete/react with `no-external-id` (counted as
 * `unresolved`). Nothing is fetched. Idempotent: a link that has its
 * `externalId` is a fixed point.
 */

export const id = '0004-github-external-ids';
export const from = 3;
export const to = 4;
export const description =
  'GitHub: backfill externalId and messageId from the stored url / raw payload (items it cannot place keep no-external-id).';

const PREFIX = 'msg:github:';
const REPO = '([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)';
const FROM_ID = new RegExp(
  `^(issue|pr|issue-comment|review-comment|review):(?:${REPO}|unknown)#(.+)$`
);
const COMMENT_KINDS = new Set(['issue-comment', 'review-comment']);

const isGithub = (link) =>
  typeof link?.id === 'string' &&
  link.id.startsWith(PREFIX) &&
  !(link.externalId && typeof link.externalId === 'object');

// `owner/repo` from the stored url, or null.
const repoOfUrl = (url) => {
  const text = String(url ?? '');
  const match =
    text.match(new RegExp(`/repos/${REPO}/`)) ??
    text.match(new RegExp(`github\\.com/${REPO}/`));
  return match ? [match[1], match[2]] : null;
};

const digits = (value) => (/^\d+$/.test(String(value)) ? Number(value) : null);

const numberOf = (kind, tail, chat, repoKey) => {
  if (kind === 'issue' || kind === 'pr') {
    return digits(tail);
  }
  if (kind === 'review') {
    return digits(String(tail).split(':')[0]);
  }
  const inChat = String(chat ?? '').match(/#(\d+)$/);
  return inChat && String(chat).startsWith(repoKey) ? Number(inChat[1]) : null;
};

const restIdOf = (kind, tail, raw) => {
  if (COMMENT_KINDS.has(kind)) {
    return digits(tail) ?? digits(raw?.id);
  }
  if (kind === 'review') {
    return digits(String(tail).split(':')[1]) ?? digits(raw?.id);
  }
  return digits(raw?.id);
};

/** The `{ externalId, messageId }` for a stored link, or null. */
export const referenceOf = (link) => {
  const match = link.id.slice(PREFIX.length).match(FROM_ID);
  if (!match) {
    return null;
  }
  const [, kind, idOwner, idRepo, tail] = match;
  const [owner, repo] = repoOfUrl(link.raw?.url) ??
    repoOfUrl(link.url) ?? [idOwner, idRepo];
  const number = numberOf(kind, tail, link.chat, `${owner}/${repo}`);
  const restId = restIdOf(kind, tail, link.raw);
  const needed = COMMENT_KINDS.has(kind) ? restId : (number ?? restId);
  if (!owner || !repo || needed === null) {
    return null;
  }
  return {
    externalId: {
      network: 'github',
      kind,
      id: restId,
      nodeId: link.raw?.node_id ?? null,
      owner,
      repo,
      number,
    },
    ...(restId === null ? {} : { messageId: String(restId) }),
  };
};

export const up = async (ctx) => {
  let unresolved = 0;
  await ctx.scan({ prefix: PREFIX, where: isGithub }, async (batch) => {
    const out = [];
    for (const link of batch) {
      const reference = referenceOf(link);
      if (reference) {
        out.push({ ...link, ...reference });
      } else {
        unresolved += 1;
      }
    }
    await ctx.putMany(out);
  });
  ctx.log('github_external_ids', { unresolved });
};
