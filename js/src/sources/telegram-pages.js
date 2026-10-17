/**
 * Reading Telegram page by page, store first (R-Y24 .. R-Y26): one
 * chat's history (newest, then older pages as the user scrolls back) and
 * the chat list beyond its first page. What the store already holds is
 * never asked for again (./telegram-history.js says what that is); every
 * request goes through the account's queue at the caller's priority.
 *
 * The helpers that turn GramJS objects into links live in
 * ./telegram-account.js and come in through `tools`, so this module has
 * no import cycle with it.
 */

import {
  coverSlice,
  historyLink,
  historyLinkId,
  historyPlan,
} from './telegram-history.js';

const iso = (ms) => new Date(ms).toISOString();

const idOf = (value) =>
  value === undefined || value === null ? null : String(value?.value ?? value);

/**
 * Where the next page of the chat list starts: after the oldest dialog of
 * this one (pinned dialogs are listed first, out of date order).
 */
export const dialogsCursor = (listed = []) => {
  const dated = listed
    .filter((d) => !d?.pinned && d?.message?.date)
    .map((d) => ({
      offsetDate: Number(d.message.date),
      offsetId: Number(d.message.id) || 0,
      chat: idOf(d.id),
    }));
  if (dated.length === 0) {
    return null;
  }
  return dated.reduce((oldest, d) =>
    d.offsetDate < oldest.offsetDate ? d : oldest
  );
};

// A page that ends where the last one did would loop forever.
const cursorMoved = (next, cursor) =>
  !cursor ||
  next.offsetDate < cursor.offsetDate ||
  (next.offsetDate === cursor.offsetDate && next.chat !== cursor.chat);

export const createPageReader = (env, tools) => {
  const { store, connection, queue, now } = env;
  // Input peers of listed dialogs, so the next page can say where to go on.
  const peers = new Map();

  const getMessages = (client, entity, chat, plan, priority) =>
    queue.run(
      `messages:${chat}:${plan.mode}:${JSON.stringify(plan.options)}`,
      priority,
      () => client.getMessages(entity, plan.options)
    );

  /** Messages of a listed dialog after what is stored, as the sync reads them. */
  const readNew = async (client, dialog, chat, { limit, since, priority }) => {
    const record = await store.get(historyLinkId(chat));
    const after = record?.newest ?? (since ? Number(since) : null);
    const plan = after
      ? { mode: 'since', options: { limit, minId: Number(after) } }
      : { mode: 'newest', options: { limit } };
    const list = [
      ...((await getMessages(
        client,
        dialog.entity ?? chat,
        chat,
        plan,
        priority
      )) ?? []),
    ];
    const cover = coverSlice(record ? { ...record } : null, {
      ids: list.map((m) => m?.id),
      limit,
      mode: plan.mode,
      at: iso(now()),
    });
    return {
      links: tools.toLinks(dialog, list),
      cover: historyLink(chat, cover),
    };
  };

  /**
   * One chat's history, store first: `before` asks for the page older
   * than that message id (the user scrolls back), none for the newest.
   * Returns what was written and whether the chat's start is stored.
   */
  const history = async ({
    chat,
    limit = 50,
    before = null,
    priority = 'view',
  } = {}) => {
    const creds = await tools.credentials();
    if (creds?.kind !== 'user' || !chat) {
      return { written: 0 };
    }
    const target = String(chat);
    const record = await store.get(historyLinkId(target));
    const plan = historyPlan(record ? { ...record, chat: target } : null, {
      before,
      limit,
      now: now(),
    });
    if (!plan) {
      return { written: 0, cached: true, complete: Boolean(record?.complete) };
    }
    const { client } = await connection.open(creds);
    const entity = await connection.withPeer(client, target, (peer) =>
      client.getEntity(peer)
    );
    const list = [
      ...((await getMessages(client, entity, target, plan, priority)) ?? []),
    ];
    const written = await tools.writeChanged(
      store,
      tools.toLinks(tools.dialogOfEntity(target, entity), list)
    );
    const cover = coverSlice(record, {
      ids: list.map((m) => m?.id),
      limit,
      mode: plan.mode,
      at: iso(now()),
    });
    await store.put(historyLink(target, cover));
    if (written > 0) {
      await tools.recordSync(store, { changedAt: iso(now()) });
    }
    return { written, cached: false, complete: Boolean(cover.complete) };
  };

  /** Remember the input peers of listed dialogs (for `offsetPeer`). */
  const remember = (listed) => {
    for (const dialog of listed) {
      const chat = idOf(dialog?.id);
      if (chat && dialog.inputEntity) {
        peers.set(chat, dialog.inputEntity);
      }
    }
  };

  const pageParams = (cursor, limit) => {
    if (!cursor) {
      return { limit };
    }
    const peer = peers.get(cursor.chat);
    return {
      limit,
      offsetDate: cursor.offsetDate,
      offsetId: cursor.offsetId,
      ignorePinned: true,
      ...(peer ? { offsetPeer: peer } : {}),
    };
  };

  // Each listed chat's read state and newest message (its row in Chat).
  const listedLinks = (listed) => {
    const links = [];
    for (const dialog of listed) {
      const chat = idOf(dialog?.id);
      if (!chat) {
        continue;
      }
      env.live?.chats?.set(chat, tools.dialogInfo(chat, dialog.entity));
      links.push(tools.dialogReadLink(chat, dialog));
      if (dialog.message) {
        links.push(...tools.toLinks(dialog, [dialog.message]));
      }
    }
    return [...links, ...tools.partnersOf(listed)];
  };

  /**
   * The next page of the chat list, after the furthest one read. A chat's
   * history is read when it is opened or shown (`history`).
   */
  const moreDialogs = async ({ limit = 40, priority = 'list' } = {}) => {
    const creds = await tools.credentials();
    if (creds?.kind !== 'user') {
      return { written: 0, complete: true };
    }
    const state = (await store.get(tools.syncId)) ?? {};
    if (state.dialogsComplete) {
      return { written: 0, complete: true, cached: true };
    }
    const { client } = await connection.open(creds);
    const cursor = state.dialogsCursor ?? null;
    const listed = [
      ...((await queue.run(`dialogs:${JSON.stringify(cursor)}`, priority, () =>
        client.getDialogs(pageParams(cursor, limit))
      )) ?? []),
    ];
    remember(listed);
    const written = await tools.writeChanged(store, listedLinks(listed));
    const next = dialogsCursor(listed);
    const moved = Boolean(next) && cursorMoved(next, cursor);
    const complete = listed.length < limit || !moved;
    await tools.recordSync(store, {
      dialogsCursor: moved ? next : cursor,
      dialogsComplete: complete,
      ...(written > 0 ? { changedAt: iso(now()) } : {}),
    });
    return { written, complete, chats: listed.length };
  };

  return { readNew, history, moreDialogs, remember };
};
