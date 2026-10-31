// Provider-neutral observations, never an inference about a person's beliefs.
export const reactionEmoji = (value) => {
  if (typeof value === 'string') {
    return value;
  }
  if (value?.emoticon) {
    return String(value.emoticon);
  }
  if (value?.documentId) {
    return `custom:${value.documentId}`;
  }
  return value?.className === 'ReactionPaid' ? '⭐' : '';
};

const peerOf = (peer = {}) => {
  if (!peer) {
    return null;
  }
  if (peer.userId !== undefined) {
    return { id: String(peer.userId), kind: 'user' };
  }
  if (peer.channelId !== undefined) {
    return { id: `-100${peer.channelId}`, kind: 'channel' };
  }
  if (peer.chatId !== undefined) {
    return { id: `-${peer.chatId}`, kind: 'group' };
  }
  return null;
};

export const rawReactionData = (raw = {}) => {
  const reactions = raw?.reactions;
  if (!reactions || Array.isArray(reactions)) {
    return null;
  }
  const counts = (reactions.results ?? [])
    .map((row) => ({
      emoji: reactionEmoji(row.reaction),
      count: reactionCount(row.count),
    }))
    .filter((row) => row.emoji && row.count);
  const actors = (reactions.recentReactions ?? []).flatMap((row) => {
    const peer = peerOf(row.peerId);
    const emoji = reactionEmoji(row.reaction);
    return peer && emoji
      ? [{ ...peer, emoji, at: reactionDate(Number(row.date) * 1000) }]
      : [];
  });
  return counts.length || actors.length
    ? {
        counts,
        actors,
        canSeeList:
          typeof reactions.canSeeList === 'boolean'
            ? reactions.canSeeList
            : null,
      }
    : null;
};

const reactionCount = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
export const reactionDate = (value) => {
  const date = new Date(value ?? NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const normalizedActor = (actor, source) => {
  if (actor && typeof actor === 'object') {
    const id = actor.id ?? actor.user ?? actor.peer;
    return {
      id: id === undefined ? null : String(id),
      name: actor.name ?? null,
      username: actor.username ?? null,
      kind: actor.kind ?? 'user',
    };
  }
  const value = String(actor ?? '');
  // Some exports identify a person by display name alone. Keep that distinction.
  const namedOnly =
    ['facebook', 'messenger', 'linkedin'].includes(source) &&
    !/^\d+$/.test(value);
  return value
    ? {
        id: namedOnly ? null : value,
        name: namedOnly ? value : null,
        kind: namedOnly ? 'unknown' : 'user',
      }
    : null;
};

const actorsForReaction = (entries, source, emoji) =>
  entries.flatMap((entry) => {
    const actor = normalizedActor(entry, source);
    return actor
      ? [
          {
            ...actor,
            emoji,
            at: typeof entry === 'object' ? (entry?.at ?? null) : null,
          },
        ]
      : [];
  });

export const reactionData = (link, raw = rawReactionData(link?.raw)) => {
  if (raw) {
    return raw;
  }
  const counts = [];
  const actors = [];
  for (const row of Array.isArray(link?.reactions) ? link.reactions : []) {
    const emoji = reactionEmoji(row.emoji ?? row.reaction);
    if (!emoji) {
      continue;
    }
    const by = Array.isArray(row.by) ? row.by : [];
    const count = reactionCount(row.count ?? by.length);
    if (count) {
      counts.push({ emoji, count });
    }
    actors.push(...actorsForReaction(by, link.source, emoji));
  }
  return counts.length || actors.length
    ? { counts, actors, canSeeList: null }
    : null;
};

export const reactionActorKey = (actor) =>
  `${actor.kind ?? 'user'}:${actor.id ?? `name:${actor.name}`}:${actor.emoji}`;
export const mergeReactionActors = (...lists) => {
  const merged = new Map();
  for (const actor of lists.flat()) {
    const key = reactionActorKey(actor);
    const before = merged.get(key);
    merged.set(key, {
      ...before,
      ...actor,
      name: actor.name ?? before?.name ?? null,
      username: actor.username ?? before?.username ?? null,
    });
  }
  return [...merged.values()];
};
