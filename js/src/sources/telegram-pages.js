/**
 * Reading Telegram page by page, store first (R-Y24 .. R-Y26): one
 * chat's history (newest, then older pages as the user scrolls back) and
 * the chat list beyond its first page. What the store already holds is
 * never asked for again (./telegram-history.js says what that is); every
 * request goes through the account's queue at the caller's priority.
 *
 * A chat is asked for by its stored input peer (./telegram-peers.js),
 * so reading it is one request; a channel the user reads is caught up
 * through its own difference (./telegram-channels.js), which also brings
 * its edits and deletions.
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
import { createHistoryJump } from './telegram-jump.js';

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

// The chat's input peer and kind: stored, else looked up once (through
// the queue) and stored.
const whereIs = async (env, tools, client, chat, priority) => {
  const { queue, connection } = env;
  const stored = await env.peers?.input(chat);
  const known = env.live?.chats?.get(chat) ?? (await env.peers?.dialog(chat));
  if (stored && known) {
    return { peer: stored, dialog: known };
  }
  const entity = await queue.run(`entity:${chat}`, priority, () =>
    connection.withPeer(client, chat, (peer) => client.getEntity(peer))
  );
  const dialog = tools.dialogOfEntity(chat, entity);
  await env.peers?.remember(chat, entity, dialog);
  return { peer: stored ?? entity, dialog };
};

// The chat list's next page: after `cursor`, from that chat's peer.
const pageParams = (listedPeers, cursor, limit) => {
  if (!cursor) {
    return { limit };
  }
  const peer = listedPeers.get(cursor.chat);
  return {
    limit,
    offsetDate: cursor.offsetDate,
    offsetId: cursor.offsetId,
    ignorePinned: true,
    ...(peer ? { offsetPeer: peer } : {}),
  };
};

// A channel the user reads: its own difference brings what came after
// the stored messages, with edits and deletions (instead of `since`).
const channelCatchUp = async (env, chat, plan, priority) => {
  if (priority === 'view') {
    env.channels?.opened(chat);
  }
  if (plan.mode !== 'since' || !(await env.channels?.follows(chat))) {
    return null;
  }
  const fed = await env.channels.difference(chat, priority);
  return { written: fed ?? 0, cached: false };
};

const createPages = (env, tools) => {
  const { store, connection, queue, now } = env;
  // Input peers of listed dialogs, so the next page can say where to go on.
  const listedPeers = new Map();

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
      return {
        written: 0,
        cached: true,
        complete: Boolean(record?.complete),
      };
    }
    const caughtUp = await channelCatchUp(env, target, plan, priority);
    if (caughtUp) {
      return { ...caughtUp, complete: Boolean(record?.complete) };
    }
    const { client } = await connection.open(creds);
    const { peer, dialog } = await whereIs(
      env,
      tools,
      client,
      target,
      priority
    );
    const list = [
      ...((await getMessages(client, peer, target, plan, priority)) ?? []),
    ];
    const written = await tools.writeChanged(
      store,
      tools.toLinks(dialog, list)
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

  /**
   * Remember the input peers of listed dialogs (for `offsetPeer`, and in
   * the store for reading the chat later) and each channel's number.
   */
  const remember = async (listed) => {
    for (const dialog of listed) {
      const chat = idOf(dialog?.id);
      if (chat && dialog.inputEntity) {
        listedPeers.set(chat, dialog.inputEntity);
        await env.peers?.remember(
          chat,
          dialog.inputEntity,
          tools.dialogInfo(chat, dialog.entity)
        );
        await env.channels?.seed(chat, dialog.dialog?.pts);
      }
    }
  };

  // Each listed chat's read state and newest message (its row in Chat).
  const listedLinks = (listed) => {
    const links = [];
    const ranks = tools.pinnedRanks?.(listed) ?? new Map();
    for (const dialog of listed) {
      const chat = idOf(dialog?.id);
      if (!chat) {
        continue;
      }
      env.live?.chats?.set(chat, tools.dialogInfo(chat, dialog.entity));
      links.push(tools.dialogReadLink(chat, dialog, ranks.get(dialog)));
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
        client.getDialogs(pageParams(listedPeers, cursor, limit))
      )) ?? []),
    ];
    await remember(listed);
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

/** The page reader, with jumps far back (./telegram-jump.js, R-Y106). */
export const createPageReader = (env, tools) => ({
  ...createPages(env, tools),
  ...createHistoryJump(env, tools, { whereIs }),
});
