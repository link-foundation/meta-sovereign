/**
 * Live presence and audience links (issue #31, PR #34).
 *
 * Two requirements from PR #34 live here:
 *
 * - Typing status in every messenger: when a person or our own
 *   automation is typing, a `typing` link records it (with a short TTL
 *   so stale indicators expire), and `setTypingFor` asks the adapter to
 *   show "typing..." upstream before a reply — the read -> typing ->
 *   reply pacing used by konard/vk-bot.
 * - Automation can target friends, chat members and community members:
 *   `syncMembership` pulls those audiences from each adapter's live
 *   listing methods and stores them as `member` + `person` links.
 *
 * All links are plain objects with `id` and `tokens`, ready for the
 * link store's `put`.
 */

export const MEMBER_GROUP_KINDS = ['friends', 'chat', 'community', 'list'];

const toIso = (at) => new Date(at ?? Date.now()).toISOString();

export const memberLink = ({
  source,
  group,
  groupKind,
  groupName = null,
  user,
  name = null,
  at = new Date().toISOString(),
}) => ({
  id: `member:${source}:${group}:${user}`,
  tokens: ['member', source, String(group), String(user)],
  kind: 'member',
  source,
  group: String(group),
  groupKind,
  groupName,
  user: String(user),
  name,
  at: toIso(at),
});

export const personLink = ({
  source,
  user,
  name = null,
  handle = null,
  at = new Date().toISOString(),
}) => ({
  id: `person:${source}:${user}`,
  tokens: ['person', source, String(user)],
  kind: 'person',
  source,
  user: String(user),
  name,
  handle,
  at: toIso(at),
});

export const typingLink = ({
  source,
  chat,
  user,
  state = 'typing',
  at = new Date().toISOString(),
  ttlMs = 6000,
}) => {
  const started = toIso(at);
  return {
    id: `typing:${source}:${chat}:${user}`,
    tokens: ['typing', source, String(chat), String(user)],
    kind: 'typing',
    source,
    chat: String(chat),
    user: String(user),
    state,
    at: started,
    until: new Date(Date.parse(started) + ttlMs).toISOString(),
  };
};

export const isTypingActive = (link, now = Date.now()) =>
  link?.kind === 'typing' &&
  link.state === 'typing' &&
  Date.parse(link.until) > Number(now);

// Group kind -> adapter listing method and its positional arguments.
// `list` groups are curated locally, so there is nothing to pull.
const memberListers = {
  friends: { method: 'friends', args: () => [] },
  chat: { method: 'chatMembers', args: (group) => [group.id] },
  community: { method: 'communityMembers', args: (group) => [group.id] },
};

// Adapters return either a plain array or `{ members, count }` when the
// upstream API only exposes part of the audience (Telegram Bot API).
const normalizeMembers = (listed) =>
  Array.isArray(listed)
    ? { members: listed, total: listed.length }
    : {
        members: listed?.members ?? [],
        total: listed?.count ?? listed?.members?.length ?? 0,
      };

/**
 * Pull friends / chat / community members through `live` and `put` a
 * member link plus a person link for each. Returns per-group counts.
 */
export const syncMembership = async ({
  source,
  live,
  groups = [{ kind: 'friends' }],
  put,
  now = Date.now(),
  options = {},
}) => {
  const at = toIso(now);
  const summary = { groups: [], members: 0 };
  for (const group of groups) {
    const lister = memberListers[group.kind];
    if (!lister) {
      throw new Error(
        `cannot sync member group kind "${group.kind}"; supported: ${Object.keys(memberListers).join(', ')}`
      );
    }
    const { method } = lister;
    if (typeof live?.[method] !== 'function') {
      throw new Error(`${source} live API does not support ${method}`);
    }
    const id = group.kind === 'friends' ? 'friends' : String(group.id);
    const listed = normalizeMembers(
      await live[method](...lister.args(group), options)
    );
    for (const member of listed.members) {
      await put(
        memberLink({
          source,
          group: id,
          groupKind: group.kind,
          groupName: group.name ?? null,
          user: member.user,
          name: member.name ?? null,
          at,
        })
      );
      await put(
        personLink({
          source,
          user: member.user,
          name: member.name ?? null,
          handle: member.handle ?? null,
          at,
        })
      );
    }
    summary.groups.push({
      kind: group.kind,
      id,
      count: listed.members.length,
      total: listed.total,
    });
    summary.members += listed.members.length;
  }
  return summary;
};

/**
 * Show "typing..." in `chat` through the source's live adapter. Returns
 * `{ supported: false }` for adapters without typing indicators (email,
 * job boards...). When `put` is given, the automation's own typing state
 * is also recorded as a typing link for `user` (default `'me'`).
 */
export const setTypingFor = async (
  getSource,
  {
    source,
    chat,
    messageId,
    user = 'me',
    put = null,
    options = {},
    cancel = false,
  }
) => {
  const live = getSource(source)?.live;
  if (typeof live?.setTyping !== 'function') {
    return { supported: false, source };
  }
  const result = await live.setTyping(
    { chat, messageId, ...(cancel ? { cancel: true } : {}) },
    options
  );
  const link = typingLink({
    source,
    chat,
    user,
    ...(cancel ? { state: 'idle' } : {}),
  });
  if (put) {
    await put(link);
  }
  return { supported: true, source, result, link };
};
