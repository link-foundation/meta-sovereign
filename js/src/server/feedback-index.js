import {
  mergeReactionActors,
  reactionActorKey,
} from '../sources/reaction-data.js';
import { createFeedbackEvidence } from './feedback-evidence.js';

export const FEEDBACK_AUTHORS_PREFIX = 'feedback-authors:';
export const feedbackAuthorsId = (id) => `${FEEDBACK_AUTHORS_PREFIX}${id}`;
const personKey = (source, id) => `${source}\0${id}`;
const scoreOf = (data) =>
  data?.counts?.reduce((sum, row) => sum + row.count, 0) ?? 0;

const preview = (link) => ({
  id: link.id,
  source: link.source,
  chat: String(link.chat),
  name: link.name ?? link.chatName ?? String(link.chat),
  sender: link.sender,
  senderName: link.senderName ?? null,
  text: String(link.text ?? link.body ?? '').slice(0, 4000),
  at: link.at ?? link.timestamp ?? null,
  kind: link.kind ?? link.chatType ?? 'unknown',
  url: link.url ?? link.permalink ?? null,
});

const rowActors = (previous, known, data) =>
  mergeReactionActors(
    previous?.actors ?? [],
    known?.actors ?? [],
    data?.actors ?? []
  );
const observationRow = (link, previous, known, deleted) => {
  const data = link.feedback;
  return {
    id: link.id,
    source: link.source,
    chat: String(link.chat),
    mine: link.sender === 'me' || link.outgoing === true,
    at: link.timestamp ?? '',
    kind: link.chatType ?? 'unknown',
    counts: data?.counts ?? [],
    total: scoreOf(data),
    canSeeList: data?.canSeeList ?? previous?.canSeeList ?? null,
    actors: rowActors(previous, known, data),
    deleted: deleted || Boolean(link.deleted),
  };
};
const lostActors = (previous, data) => {
  const current = new Set((data?.actors ?? []).map(reactionActorKey));
  return previous?.actors.some(
    (actor) => !current.has(reactionActorKey(actor))
  );
};

const shapeFeedback = async (store, row) => {
  const link = await store.get(row.id, preview);
  return link
    ? {
        ...preview(link),
        total: row.total,
        reactions: row.counts,
        knownAuthors: new Set(
          row.actors.map((actor) => `${actor.kind}:${actor.id ?? actor.name}`)
        ).size,
        canSeeList: row.canSeeList,
      }
    : null;
};

/** Sparse message metadata and person→message IDs, never raw payload copies. */
export const createFeedbackIndex = (store, log) => {
  const evidence = createFeedbackEvidence(store, log);
  const rows = new Map();
  const collected = new Map();
  const people = new Map();
  let revision = 0;
  const remember = (row) => {
    for (const actor of row.actors) {
      if (!actor.id || actor.kind !== 'user') {
        continue;
      }
      const key = personKey(row.source, actor.id);
      const ids = people.get(key) ?? new Set();
      ids.add(row.id);
      people.set(key, ids);
    }
  };
  const observeAuthors = (link, deleted) => {
    const id = link.messageId;
    if (deleted) {
      collected.delete(id);
    } else {
      collected.set(id, link);
    }
    const row = rows.get(id);
    if (row) {
      row.actors = mergeReactionActors(row.actors, link.actors ?? []);
      remember(row);
    }
  };
  const observe = (link, deleted = false, live = false) => {
    if (link?.id?.startsWith(FEEDBACK_AUTHORS_PREFIX)) {
      observeAuthors(link, deleted);
      revision += 1;
      return;
    }
    if (!link?.id?.startsWith('msg:')) {
      return;
    }
    const data = link.feedback;
    const previous = rows.get(link.id);
    if (!data && !previous) {
      return;
    }
    const known = collected.get(link.id);
    const row = observationRow(link, previous, known, deleted);
    rows.set(link.id, row);
    remember(row);
    if (live && lostActors(previous, data)) {
      evidence.preserve(row);
    }
    revision += 1;
  };
  const shape = (row) => shapeFeedback(store, row);
  return {
    flush: evidence.flush,
    close: evidence.close,
    observe,
    row: (id) => rows.get(id) ?? null,
    collected: (id) => collected.get(id) ?? null,
    revision: () => revision,
    nextCollection(now) {
      return (
        [...rows.values()]
          .filter(
            (row) =>
              row.mine &&
              row.source === 'telegram' &&
              !row.deleted &&
              row.total > 0 &&
              row.canSeeList !== false &&
              (collected.get(row.id)?.retryAt ?? 0) <= now
          )
          .sort((a, b) => b.total - a.total || b.at.localeCompare(a.at))[0]
          ?.id ?? null
      );
    },
    async list({
      source = '',
      mine = true,
      scope = 'all',
      since = '',
      offset = 0,
      limit = 25,
      sort = 'score',
    } = {}) {
      const matches = [...rows.values()].filter(
        (row) =>
          !row.deleted &&
          row.total > 0 &&
          (!source || row.source === source) &&
          (!mine || row.mine) &&
          (!since || row.at >= since) &&
          (scope !== 'shared' || /group|channel|supergroup/.test(row.kind))
      );
      matches.sort((a, b) =>
        sort === 'recent'
          ? b.at.localeCompare(a.at)
          : b.total - a.total ||
            b.at.localeCompare(a.at) ||
            a.id.localeCompare(b.id)
      );
      return {
        items: (
          await Promise.all(matches.slice(offset, offset + limit).map(shape))
        ).filter(Boolean),
        total: matches.length,
        next: offset + limit < matches.length ? offset + limit : null,
        sources: [
          ...new Set([...rows.values()].map((row) => row.source)),
        ].sort(),
        revision,
      };
    },
    async person(source, peer, { offset = 0, limit = 25 } = {}) {
      const rowsForPerson = [...(people.get(personKey(source, peer)) ?? [])]
        .map((id) => rows.get(id))
        .filter(Boolean)
        .sort((a, b) => b.at.localeCompare(a.at));
      const items = [];
      for (const row of rowsForPerson.slice(offset, offset + limit)) {
        const message = await shape(row);
        if (message) {
          items.push({
            message,
            reactions: row.actors.filter(
              (actor) => actor.kind === 'user' && actor.id === peer
            ),
          });
        }
      }
      return {
        items,
        total: rowsForPerson.length,
        next: offset + limit < rowsForPerson.length ? offset + limit : null,
      };
    },
  };
};
