import { mergeReactionActors, reactionDate } from '../sources/reaction-data.js';
import { feedbackAuthorsId } from './feedback-index.js';
import { personLink } from '../sources/live-links.js';

export const FEEDBACK_SETTINGS_ID = 'feedback:settings';
export const feedbackSettings = (record = {}) => ({
  enabled: record.enabled !== false,
  profiles: record.profiles !== false,
});
const DAY = 86400000;
const services = new WeakMap();
const actorsOf = (answer) =>
  (answer.items ?? [])
    .filter((one) => one.peer)
    .map((one) => ({
      id: String(one.peer),
      kind: one.kind ?? (String(one.peer).startsWith('-') ? 'channel' : 'user'),
      name: one.name ?? null,
      username: one.username ?? null,
      deletedAccount: one.deletedAccount === true,
      emoji: one.customEmojiId
        ? `custom:${one.customEmojiId}`
        : (one.emoji ?? '⭐'),
      at: one.date ? reactionDate(one.date) : null,
    }));

const actorPage = (row, record, { offset, limit }, account) => {
  const status =
    record?.status ??
    (row.canSeeList === false
      ? 'hidden'
      : row.source === 'telegram'
        ? 'partial'
        : 'cached');
  return {
    ok: true,
    actors: row.actors.slice(offset, offset + limit),
    cachedTotal: row.actors.length,
    cachedNext: offset + limit < row.actors.length ? offset + limit : null,
    total: row.total,
    status,
    next: record?.next ?? null,
    complete: record?.complete === true,
    code: record?.code ?? null,
    liveSupported:
      row.source === 'telegram' &&
      row.canSeeList !== false &&
      typeof account?.messageReactors === 'function',
  };
};

const authorRecord = (row, previous, answer, fresh, checkedAt) => {
  const all = mergeReactionActors(previous?.actors ?? [], row.actors, fresh);
  const complete = answer.ok && !answer.next;
  return {
    id: feedbackAuthorsId(row.id),
    messageId: row.id,
    source: row.source,
    chat: row.chat,
    actors: all,
    status: collectionStatus(answer, complete),
    code: answer.ok ? null : (answer.code ?? 'unavailable'),
    next: answer.ok ? (answer.next ?? null) : (previous?.next ?? null),
    complete,
    checkedAt,
    retryAt: checkedAt + collectionDelay(answer),
    observedAt: previous?.observedAt ?? new Date(checkedAt).toISOString(),
  };
};

const saveActorProfiles = async (store, source, fresh) => {
  for (const actor of fresh.filter((one) => one.kind === 'user' && one.id)) {
    const person = personLink({
      source,
      user: actor.id,
      name: actor.name,
      handle: actor.username,
    });
    const saved = await store.get(person.id);
    await store.put({
      ...person,
      ...saved,
      name: saved?.name ?? actor.name,
      handle: saved?.handle ?? actor.username,
      ...(actor.deletedAccount ? { deletedAccount: true } : {}),
    });
  }
};
const collectionDelay = (answer) =>
  answer.ok && answer.next
    ? 0
    : answer.ok || answer.code === 'authors-hidden'
      ? DAY
      : 60_000;
const collectionStatus = (answer, complete) =>
  answer.ok
    ? complete
      ? 'complete'
      : 'partial'
    : answer.code === 'authors-hidden'
      ? 'hidden'
      : 'error';

const requestAuthors = async (account, row, page, priority) => {
  let answer =
    row.canSeeList === false
      ? { ok: false, code: 'authors-hidden' }
      : await account.messageReactors({
          chat: row.chat,
          id: Number(row.id.split(':').at(-1)),
          offset: page,
          priority,
        });
  if (answer.ok && answer.next && answer.next === page) {
    answer = { ok: false, code: 'stalled-cursor' };
  }
  return answer;
};

export const createFeedbackService = ({
  store,
  index,
  account,
  log = () => {},
  now = Date.now,
}) => {
  let running = null;
  let closed = false;
  const settings = async () =>
    feedbackSettings((await store.get(FEEDBACK_SETTINGS_ID)) ?? {});
  const actors = async (id, { offset = 0, limit = 50 } = {}) => {
    const row = index.feedback.row(id);
    if (!row) {
      return { ok: false, code: 'not-found', actors: [] };
    }
    const record = index.feedback.collected(id);
    return actorPage(row, record, { offset, limit }, account);
  };
  const collect = async (id, { offset, priority = 'view' } = {}) => {
    await index.ready();
    const row = index.feedback.row(id);
    if (!row) {
      return { ok: false, code: 'not-found', actors: [] };
    }
    if (row.source !== 'telegram' || !account?.messageReactors) {
      return actors(id);
    }
    const previous = index.feedback.collected(id);
    const page = offset ?? previous?.next ?? '';
    const answer = await requestAuthors(account, row, page, priority);
    if (closed) {
      return { ok: false, code: 'closed', actors: [] };
    }
    const fresh = answer.ok ? actorsOf(answer) : [];
    const record = authorRecord(row, previous, answer, fresh, now());
    await store.put(record);
    await saveActorProfiles(store, row.source, fresh);
    log?.({
      level: answer.ok || answer.code === 'authors-hidden' ? 'debug' : 'warn',
      event: 'feedback_authors',
      source: row.source,
      count: fresh.length,
      retained: record.actors.length,
      complete: record.complete,
      code: record.code,
    });
    return actors(id);
  };
  return {
    settings,
    async saveSettings(patch) {
      const next = feedbackSettings({ ...(await settings()), ...patch });
      await store.put({ id: FEEDBACK_SETTINGS_ID, ...next });
      return next;
    },
    actors,
    collect: (id, options) => {
      // Only one provider page per account in flight; repeated clicks share it.
      if (running) {
        return running.id === id
          ? running.promise
          : Promise.resolve({ ok: false, code: 'busy', actors: [] });
      }
      const promise = collect(id, options).finally(() => {
        running = null;
      });
      running = { id, promise };
      return promise;
    },
    async step() {
      if (
        closed ||
        running ||
        !account?.messageReactors ||
        !(await settings()).enabled
      ) {
        return;
      }
      await index.ready();
      const id = index.feedback.nextCollection(now());
      if (id) {
        return this.collect(id, { priority: 'prefetch' });
      }
    },
    close: () => {
      closed = true;
    },
  };
};

export const feedbackServiceFor = (store, ctx) => {
  let entry = services.get(store);
  if (!entry || entry.index !== ctx.chatIndex) {
    const service = createFeedbackService({
      store,
      index: ctx.chatIndex,
      account: ctx.telegramAccount,
      log: ctx.log,
    });
    entry = { index: ctx.chatIndex, service };
    services.set(store, entry);
  }
  return entry.service;
};
