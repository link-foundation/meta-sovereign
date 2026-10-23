/**
 * The connected Telegram account — what makes "Connect" actually work.
 *
 * Connecting (the credential finder, the phone login or pasted keys) only
 * stores `secret:telegram:*` links. This service reads them and does the
 * work behind Chat and Contacts:
 *   - sync(): a user session (MTProto, GramJS) lists the dialogs, their
 *     recent messages and the address-book contacts; a bot token pulls
 *     `getUpdates`. Everything lands as ordinary `msg:telegram:*` and
 *     `person:telegram:*` links, so Chat and Contacts show it unchanged.
 *   - history(chat): more of one chat's messages, when it is opened.
 *   - post() / setTyping(): the chat composer sends through the same
 *     account — a user session as the user, a bot token as the bot.
 *   - markRead() / saveDraft(): reading a chat here marks it read on
 *     Telegram, and the composer's draft is the chat's cloud draft, as in
 *     Telegram's own apps (a user session only).
 *   - live updates (./telegram-account-live.js) and the catch-up after a
 *     gap or a reconnect (./telegram-catchup.js) keep a user session
 *     current; start() adds a light poll as the last safety net (only
 *     dialogs whose newest message changed are re-read).
 *
 * A user session wins over a bot token when both are stored: a bot only
 * sees messages sent to it, a user account sees their real chats. Bots
 * are never polled in the background — `getUpdates` would take updates
 * away from the bot's own process — and sync only when the user asks.
 *
 * Secret values never leave this module: results and logs carry counts,
 * chat ids and the account's public name only.
 */

import { buildMessageLink } from './link.js';
import { personLink } from './live-links.js';
import { accountOf, gramjsClientFactory } from './telegram-mtproto.js';
import { readProxy } from './telegram-proxy.js';
import { createTelegramBotLive } from './telegram.js';
import { stampSourceLink } from './index.js';
import { putAll } from '../storage/universal.js';
import {
  createTelegramLive,
  dialogInfo,
  readLink,
} from './telegram-account-live.js';
import { BACKFILL_EVERY_MS, createBackfill } from './telegram-backfill.js';
import { createTelegramCatchUp } from './telegram-catchup.js';
import { createChannelSync } from './telegram-channels.js';
import {
  createFetchQueue,
  floodSeconds,
  rawMessage,
} from './telegram-history.js';
import { createPeers } from './telegram-peers.js';
import { createActions } from './telegram-actions.js';
import { createPageReader, dialogsCursor } from './telegram-pages.js';
import { messageSenderId } from './telegram-updates.js';
import { statusFields } from './telegram-emoji-status.js';
import {
  nameForwards,
  repairSenders,
  rereadUnsupported,
} from './telegram-repair.js';
import {
  MAX_MESSAGE_LENGTH,
  sendError,
  sendText,
  formattedParts,
} from './telegram-send.js';
import { rawEntities } from './telegram-format.js';
import {
  paidField,
  validSendAs,
  withSendAs,
} from './telegram-send-as-client.js';
import { previewFields } from './telegram-link-preview.js';
import { EFFECT_ID } from './telegram-effects.js';
import { GENERAL_TOPIC, inTopicOnly } from '../web/forum-topics.js';
import {
  importTelegram,
  installTelegramLayer,
  LAYER,
  SCHEMA_REV,
} from './telegram-layer.js';

import { richPlainText } from './telegram-instant-view-shape.js';

const SOURCE = 'telegram';
export const TELEGRAM_SYNC_ID = 'sync:telegram';
// The address book changes seldom; Telegram turns down asking for it
// often (R-Y34).
const CONTACTS_EVERY_MS = 6 * 60 * 60_000;
// Listing the dialogs so GramJS knows a chat: at most this often.
const PEER_LOOKUP_EVERY_MS = 10 * 60_000;
// The chat list is re-read this often by the poll; live updates and the
// catch-up bring new messages in between (R-Y24).
const DIALOGS_EVERY_MS = 5 * 60_000;
// A channel's gap re-reads the dialogs; no more often than this.
const RESYNC_EVERY_MS = 15_000;
const CONNECTION = { 1: 'connected', 0: 'broken', '-1': 'disconnected' };

const secretValue = (link) =>
  link?.value ?? link?.token ?? link?.body ?? link?.text ?? null;

/** The stored credential to use: a user session first, else a bot token. */
export const readTelegramCredentials = async (store) => {
  const read = async (name) =>
    secretValue(await store.get(`secret:telegram:${name}`));
  const [session, apiId, apiHash, token] = await Promise.all([
    read('user-session'),
    read('api-id'),
    read('api-hash'),
    read('bot-token'),
  ]);
  if (session) {
    return { kind: 'user', session, apiId, apiHash };
  }
  if (token) {
    return { kind: 'bot', token };
  }
  return null;
};

// GramJS ids are big-integer objects (or BigInt); chats are addressed by
// their plain decimal string, which GramJS also accepts as a peer.
const idText = (value) =>
  value === null || value === undefined ? null : String(value.value ?? value);

const fullName = (entity) => {
  if (!entity) {
    return null;
  }
  const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
  return name || entity.title || entity.username || null;
};

const chatTypeOf = (dialog) => {
  if (dialog.isUser) {
    return 'personal_chat';
  }
  return dialog.isChannel && !dialog.isGroup ? 'channel' : 'group';
};

const isoOf = (date) => {
  if (!date) {
    return undefined;
  }
  const ms = date instanceof Date ? date.getTime() : Number(date) * 1000;
  return new Date(ms).toISOString();
};

// A media message without a caption still shows up in the chat.
// A rich message (layer 232, R-Y220) has no text of its own: its blocks'
// words stand in for it (the chat list, search), and it is never dropped.
const richWords = (message) => {
  if (!message.richMessage) {
    return '';
  }
  try {
    return richPlainText(message.richMessage) || '…';
  } catch {
    return '…';
  }
};

const bodyOf = (message) =>
  message.message || richWords(message) || (message.media ? '📎' : '');

// A service message (a join, a pin, a call) has no text: what happened
// is its action's name, and the chat shows it as a line of its own.
const serviceOf = (message) => message.action?.className ?? null;

/** One dialog's GramJS messages as `msg:telegram:<chat>:<id>` links. */
// Who a forwarded message came from, by name, while GramJS knows the
// chat or person (the app names the rest from its chat list).
const forwardedFromOf = (message) => {
  if (!message.fwdFrom) {
    return undefined;
  }
  try {
    const forward = message.forward;
    const name =
      message.fwdFrom.fromName ??
      forward?.chat?.title ??
      fullName(forward?.sender);
    return name ? { name } : undefined;
  } catch {
    return undefined;
  }
};

export const telegramDialogLinks = (dialog, messages = []) => {
  const chat = idText(dialog.id);
  const chatType = chatTypeOf(dialog);
  const chatName = dialog.title ?? dialog.name ?? fullName(dialog.entity);
  return messages
    .filter((m) => m && m.id !== undefined && (bodyOf(m) || serviceOf(m)))
    .map((m) => {
      const service = serviceOf(m);
      const mine = Boolean(m.out);
      // In a forum topic, naming only the topic's first message is being
      // in the topic, not answering it (R-Y122).
      const replyId = inTopicOnly(m.replyTo) ? null : m.replyTo?.replyToMsgId;
      const link = buildMessageLink({
        source: SOURCE,
        externalId: `${chat}:${m.id}`,
        sender: mine ? 'me' : (messageSenderId(m) ?? chat),
        chat,
        body: bodyOf(m),
        timestamp: isoOf(m.date),
        replyTo: replyId ? `${chat}:${replyId}` : null,
        chatType,
        chatName,
        senderName: mine
          ? null
          : (fullName(m.sender) ?? (dialog.isUser ? chatName : null)),
        forwardedFrom: forwardedFromOf(m),
      });
      // Everything Telegram said about it, for offline analysis (R-Y28);
      // the author's emoji status, shown by their name (R-Y162).
      return {
        ...link,
        ...(service ? { service } : {}),
        ...(mine ? {} : statusFields(m.sender, 'senderEmoji')),
        raw: rawMessage(m),
      };
    });
};

/** Address-book users (and private-chat partners) as `person:` links. */
export const telegramPersonLinks = (users = [], { contact = true } = {}) =>
  users
    .filter((u) => u && !u.self && !u.deleted && u.id !== undefined)
    .map((u) => ({
      ...personLink({
        source: SOURCE,
        user: idText(u.id),
        name: fullName(u),
        handle: u.username ?? null,
      }),
      ...(contact ? { contact: true } : {}),
      ...(u.bot ? { bot: true } : {}),
      ...statusFields(u, 'emoji'),
    }));

// A GramJS entity as the dialog shape `telegramDialogLinks` reads.
const dialogOfEntity = (chat, entity) => {
  const kind = entity?.className;
  const megagroup = Boolean(entity?.megagroup);
  return {
    id: chat,
    entity,
    title: fullName(entity),
    isUser: kind === 'User',
    isGroup: kind === 'Chat' || megagroup,
    isChannel: kind === 'Channel',
  };
};

// Re-put a link only when what it shows changed, so a re-sync does not
// re-announce every old message to the store's subscribers. Links with
// the same id merge in order (a chat partner, then the address book).
const SHOWN_FIELDS = [
  'body',
  'name',
  'handle',
  'chatName',
  'senderName',
  'senderEmojiStatus',
  'senderEmojiUntil',
  'emojiStatus',
  'emojiUntil',
  'outboxMaxId',
  'inboxMaxId',
  'unreadCount',
  'unreadTopId',
  'unreadMentions',
  'unreadReactions',
  'muteUntil',
  'pinnedRank',
  'folder',
  'unreadMark',
  'draft',
];
// A forward's source named now, where it was not before.
const namesForward = (before, link) =>
  Boolean(link.forwardedFrom?.name) &&
  before.forwardedFrom?.name !== link.forwardedFrom.name;

const writeChanged = async (store, links) => {
  const byId = new Map();
  for (const link of links) {
    byId.set(link.id, { ...(byId.get(link.id) ?? {}), ...link });
  }
  const fresh = [];
  for (const link of byId.values()) {
    const before = await store.get(link.id);
    const changed =
      !before ||
      SHOWN_FIELDS.some((f) => (before[f] ?? null) !== (link[f] ?? null)) ||
      (link.contact && !before.contact) ||
      namesForward(before, link) ||
      (link.raw !== undefined &&
        JSON.stringify(before.raw ?? null) !== JSON.stringify(link.raw));
    if (changed) {
      fresh.push(stampSourceLink({ ...(before ?? {}), ...link }, SOURCE));
    }
  }
  await putAll(store, fresh);
  return fresh.length;
};

// Every Telegram chat in the store with its type and newest message —
// for the background download when the server has no chat index.
const storedChats = async (store) => {
  const chats = new Map();
  for (const link of await store.query(
    (l) => l?.source === SOURCE && l.id?.startsWith('msg:')
  )) {
    const chat = String(link.chat);
    const known = chats.get(chat);
    if (!known || String(link.timestamp) > String(known.at)) {
      chats.set(chat, { chat, chatType: link.chatType, at: link.timestamp });
    }
  }
  return [...chats.values()];
};

const codeError = (code, message) =>
  Object.assign(new Error(message), { code });

const PUBLIC_FIELDS = [
  'kind',
  'account',
  'at',
  'changedAt',
  'chats',
  'written',
  'contacts',
  'error',
  'code',
  'connection',
  'dialogsComplete',
  'unreachableSince',
];

// Telegram unreachable this long shows as Offline in the header (R-Y96);
// meanwhile everything keeps being retried, as Telegram's apps do.
export const OFFLINE_AFTER_MS = 60_000;
// Telegram answered but asked to wait: not a lost connection.
const askedToWait = (error) =>
  error?.code === 'flood-wait' || floodSeconds(error) > 0;
// What only signing in again fixes.
const NEEDS_LOGIN =
  /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/;

/** Whether Telegram has been out of reach for long, and whether only a new sign-in helps. */
export const reachability = (link, at) => {
  const since = Date.parse(link?.unreachableSince ?? '');
  return {
    offline: Number.isFinite(since) && at - since >= OFFLINE_AFTER_MS,
    needsLogin: NEEDS_LOGIN.test(`${link?.code ?? ''} ${link?.error ?? ''}`),
  };
};

const publicStatus = (link = {}) =>
  Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, link?.[f] ?? null]));

// One connected GramJS client per stored session, reused across requests.
// `onOpen(client, me)` runs once per new client (live updates attach
// there). Chats are addressed by their stored input peer (`peers`).
// GramJS drops an answer holding a type its schema does not know, and
// says so only at "info": the request then waits until it is given up
// as stuck. Which constructor, in the log (never the data).
const UNDECODABLE =
  /^(?:Type (-?\d+) not found|Received response without parent request)/;
export const watchUndecodable = (client, log) => {
  const logger = client?._log;
  if (!logger?.info || !log) {
    return;
  }
  const info = logger.info.bind(logger);
  logger.info = (message) => {
    const found = UNDECODABLE.exec(String(message));
    if (found) {
      log({
        level: 'warn',
        event: 'telegram_type_unknown',
        constructor: found[1]
          ? (Number(found[1]) >>> 0).toString(16).padStart(8, '0')
          : null,
      });
    }
    info(message);
  };
};

// Every dialog, the archived ones too, each one's peer stored: a chat
// beyond the recent ones (an old conversation an automation writes to)
// is then found by its stored peer (R-Y85).
const lookupAllDialogs = (env, client) =>
  env.queue.run('dialogs:lookup', 'list', async () => {
    let listed = 0;
    for (const params of [{}, { folder: 1 }]) {
      const dialogs = [...((await client.getDialogs(params)) ?? [])];
      await env.pages?.remember(dialogs);
      listed += dialogs.length;
    }
    env.log?.({ level: 'info', event: 'telegram_dialogs_lookup', listed });
    return listed;
  });

export const createUserConnection = ({
  clientFactory,
  dialogLimit,
  log,
  onOpen,
  peers,
  request,
  now,
  lookup = (client) =>
    request('dialogs:lookup', () => client.getDialogs({ limit: dialogLimit })),
}) => {
  let lookedUpAt = -Infinity;
  let connection = null; // { key, client, me }
  let opening = null; // { key, promise }: the open in flight, shared
  let generation = 0; // a disconnect during an open makes it stale
  // GramJS's disconnect() leaves the client's update loop running: its
  // next ping fails and reconnects it, handlers and all. destroy() ends
  // the loop, so a dropped client is really gone.
  const end = async (client) => {
    try {
      await (client?.destroy ?? client?.disconnect)?.call(client);
    } catch {
      // Already gone.
    }
  };
  const disconnect = async () => {
    generation += 1;
    const current = connection;
    connection = null;
    await end(current?.client);
  };
  const connect = async (creds, key) => {
    await disconnect();
    const mine = generation;
    const client = await clientFactory({
      apiId: creds.apiId,
      apiHash: creds.apiHash,
      session: creds.session,
    });
    client.setLogLevel?.('error');
    watchUndecodable(client, log);
    try {
      await client.connect();
      const me = accountOf(await client.getMe());
      if (mine !== generation) {
        throw codeError('telegram-reconnect', 'the connection was dropped');
      }
      connection = { key, client, me };
      onOpen?.(client, me);
      return connection;
    } catch (error) {
      await end(client);
      throw error;
    }
  };
  // One client at a time: callers arriving while it opens share it.
  const open = async (creds) => {
    if (!creds.apiId || !creds.apiHash) {
      throw codeError(
        'needs-api-credentials',
        'this Telegram session has no api_id/api_hash stored; sign in with your phone once (Connections → Telegram) to add them'
      );
    }
    const key = `${creds.apiId}:${creds.session}`;
    if (connection?.key === key) {
      return connection;
    }
    if (opening?.key !== key) {
      const promise = connect(creds, key).finally(() => {
        if (opening?.promise === promise) {
          opening = null;
        }
      });
      opening = { key, promise };
    }
    return opening.promise;
  };
  // The stored input peer when there is one. Otherwise GramJS resolves
  // a bare chat id only for peers it has seen: the dialogs are listed
  // (`lookup`: all of them, each one's peer stored, so an old chat is
  // found and never looked up again) — at most every ten minutes, so an
  // unknown chat never costs a request each time.
  const withPeer = async (client, chat, use) => {
    const stored = await peers?.input(chat).catch(() => null);
    try {
      return await use(stored ?? chat);
    } catch (error) {
      const unknown = /input entity|PEER_ID_INVALID/i.test(error.message ?? '');
      if (!unknown || now() - lookedUpAt < PEER_LOOKUP_EVERY_MS) {
        throw error;
      }
      lookedUpAt = now();
      await lookup(client);
      const found = await peers?.input(chat).catch(() => null);
      return use(found ?? chat);
    }
  };
  return { open, disconnect, withPeer };
};

const readContacts = async (client, { importer, log, queue }) => {
  try {
    if (typeof client.getContacts === 'function') {
      return await queue.run('contacts', 'background', () =>
        client.getContacts()
      );
    }
    const { Api, helpers } = await importer();
    const result = await queue.run('contacts', 'background', () =>
      client.invoke(
        new Api.contacts.GetContacts({ hash: helpers.returnBigInt(0) })
      )
    );
    return result?.users ?? [];
  } catch (error) {
    log({
      level: 'warn',
      event: 'telegram_contacts_failed',
      code: error.code ?? null,
      error: error.message,
    });
    return null;
  }
};

// How Telegram lists a chat: muted, pinned (its place, from `rank`),
// archived.
const listing = (dialog, rank) => {
  const state = dialog.dialog ?? {};
  const pinned = Boolean(dialog.pinned ?? state.pinned);
  return {
    muteUntil: Number(state.notifySettings?.muteUntil ?? 0) || 0,
    ...(rank === undefined ? {} : { pinnedRank: pinned ? rank : 0 }),
    folder: Number(dialog.folderId ?? state.folderId ?? 0) === 1 ? 1 : 0,
    unreadMark: Boolean(dialog.unreadMark ?? state.unreadMark),
    // A forum group (R-Y122).
    forum: Boolean(dialog.entity?.forum),
  };
};

/**
 * Each listed dialog's place among the pinned of its folder, 1 first
 * (Telegram lists the pinned first, in their order).
 */
export const pinnedRanks = (listed) => {
  const ranks = new Map();
  const next = new Map();
  for (const dialog of listed) {
    const pinned = Boolean(dialog?.pinned ?? dialog?.dialog?.pinned);
    const folder = Number(dialog?.folderId ?? dialog?.dialog?.folderId ?? 0);
    const rank = pinned ? (next.get(folder) ?? 0) + 1 : 0;
    if (pinned) {
      next.set(folder, rank);
    }
    ranks.set(dialog, rank);
  }
  return ranks;
};

// What Telegram knows about a chat's reading and draft, as listed.
const dialogReadLink = (chat, dialog, rank) => {
  const state = dialog.dialog ?? {};
  const draft = state.draft;
  return readLink(chat, {
    ...listing(dialog, rank),
    outboxMaxId: state.readOutboxMaxId,
    inboxMaxId: state.readInboxMaxId,
    unreadCount: dialog.unreadCount ?? state.unreadCount,
    unreadTopId: dialog.message?.id ?? state.topMessage,
    unreadMentions: state.unreadMentionsCount,
    unreadReactions: state.unreadReactionsCount,
    draft: draft?.message ?? '',
    draftAt: draft?.date ? isoOf(draft.date) : null,
  });
};

// The recent dialogs; only those whose newest message changed since the
// last sync (`tops`, updated in place) are read again, and then only what
// came after the stored messages (`env.pages.readNew`).
const readDialogs = async (
  env,
  client,
  { dialogs, messages, tops, chats: known }
) => {
  const links = [];
  const covers = [];
  const partners = [];
  let chats = 0;
  const listed = [
    ...((await env.queue.run('dialogs:first', 'list', () =>
      client.getDialogs({ limit: dialogs })
    )) ?? []),
  ];
  await env.pages.remember(listed);
  const ranks = pinnedRanks(listed);
  for (const dialog of listed) {
    const chat = idText(dialog.id);
    if (!chat) {
      continue;
    }
    chats += 1;
    known?.set(chat, dialogInfo(chat, dialog.entity));
    links.push(dialogReadLink(chat, dialog, ranks.get(dialog)));
    if (dialog.isUser && dialog.entity) {
      partners.push(dialog.entity);
    }
    const top = idText(dialog.message?.id);
    if (top && tops[chat] === top) {
      continue;
    }
    const read = await env.pages.readNew(client, dialog, chat, {
      limit: messages,
      since: tops[chat],
      priority: 'list',
    });
    links.push(...read.links);
    covers.push(read.cover);
    if (top) {
      tops[chat] = top;
    }
  }
  links.push(...telegramPersonLinks(partners, { contact: false }));
  return { links, covers, chats, listed };
};

// The address book is read for a new account and every
// CONTACTS_EVERY_MS otherwise — counted from the last try, so a refusal
// is not asked again on every sync.
const contactsDue = (state, { sameAccount, now }) =>
  !sameAccount ||
  now() -
    Math.max(
      Date.parse(state.contactsAt ?? '') || 0,
      Date.parse(state.contactsTriedAt ?? '') || 0
    ) >=
    CONTACTS_EVERY_MS;

const syncUser = async (env, creds, state, { dialogs, messages }) => {
  const { client, me } = await env.connection.open(creds);
  // Another account than last time: forget what was seen. The same one
  // keeps it even on a full sync: what is stored is not read again.
  const sameAccount = Boolean(state.account?.id) && state.account.id === me.id;
  const tops = sameAccount ? { ...(state.tops ?? {}) } : {};
  const { links, covers, chats, listed } = await readDialogs(env, client, {
    dialogs,
    messages,
    tops,
    chats: env.live?.chats,
  });
  let contacts = state.contacts ?? 0;
  let contactsAt = state.contactsAt ?? null;
  let contactsTriedAt = state.contactsTriedAt ?? null;
  if (contactsDue(state, { sameAccount, now: env.now })) {
    contactsTriedAt = new Date(env.now()).toISOString();
    const users = await readContacts(client, env);
    if (users) {
      links.push(...telegramPersonLinks(users));
      contacts = users.filter((u) => u && !u.self).length;
      contactsAt = new Date(env.now()).toISOString();
    }
  }
  await putAll(env.store, covers);
  // The chat list's next page starts after the furthest one read.
  const keepCursor = sameAccount && state.dialogsCursor;
  return {
    kind: 'user',
    account: me,
    chats,
    contacts,
    contactsAt,
    contactsTriedAt,
    tops,
    dialogsAt: new Date(env.now()).toISOString(),
    dialogsCursor: keepCursor ? state.dialogsCursor : dialogsCursor(listed),
    dialogsComplete: keepCursor
      ? Boolean(state.dialogsComplete)
      : listed.length < dialogs,
    written: await writeChanged(env.store, links),
  };
};

const syncBot = async (env, creds, state) => {
  const pulled = await env.botLive.pullMessages({
    token: creds.token,
    offset: state.offset ?? undefined,
    limit: 100,
  });
  const links = pulled.links ?? [];
  return {
    kind: 'bot',
    account: state.account ?? null,
    chats: new Set(links.map((l) => l.chat)).size,
    contacts: 0,
    offset: pulled.nextOffset ?? state.offset ?? null,
    written: await writeChanged(env.store, links),
  };
};

const recordSync = async (store, patch) => {
  const before = (await store.get(TELEGRAM_SYNC_ID)) ?? {};
  const link = {
    ...before,
    ...patch,
    id: TELEGRAM_SYNC_ID,
    tokens: ['sync', SOURCE],
    kind: patch.kind ?? before.kind ?? null,
    source: SOURCE,
  };
  await store.put(link);
  return link;
};

const runSync = async (env, { full, reason, dialogs, messages }) => {
  const { store, now, log } = env;
  const started = now();
  const creds = await readTelegramCredentials(store);
  if (!creds) {
    return { ...publicStatus(), connected: false };
  }
  const state = (await store.get(TELEGRAM_SYNC_ID)) ?? {};
  const at = new Date(started).toISOString();
  try {
    const result =
      creds.kind === 'user'
        ? await syncUser(env, creds, state, { full, dialogs, messages })
        : await syncBot(env, creds, state);
    const changedAt =
      result.written > 0 ? new Date(now()).toISOString() : state.changedAt;
    const link = await recordSync(store, {
      ...result,
      at,
      changedAt: changedAt ?? null,
      error: null,
      code: null,
      unreachableSince: null,
    });
    log({
      event: 'telegram_sync',
      kind: creds.kind,
      reason,
      chats: result.chats,
      written: result.written,
      contacts: result.contacts,
      duration_ms: now() - started,
    });
    return { ...publicStatus(link), connected: true };
  } catch (error) {
    // Asked to wait: the next tick asks again; nothing to show or drop.
    if (askedToWait(error)) {
      log({
        level: 'warn',
        event: 'telegram_sync_waits',
        kind: creds.kind,
        reason,
        seconds: floodSeconds(error) || error.retryAfter || null,
      });
      return { ...publicStatus(state), connected: true };
    }
    await env.connection.disconnect();
    const link = await recordSync(store, {
      kind: creds.kind,
      at,
      error: error.message,
      code: error.code ?? error.errorMessage ?? 'sync-failed',
      unreachableSince: state.unreachableSince ?? at,
    });
    log({
      level: 'error',
      event: 'telegram_sync_failed',
      kind: creds.kind,
      reason,
      error: error.message,
    });
    return { ...publicStatus(link), connected: true };
  }
};

// The reply header of a message we just sent; in a forum topic it says
// so, as Telegram's echo will (R-Y122).
const sentReply = (replyTo, quote, topic) => {
  const inTopic = topic && topic !== GENERAL_TOPIC;
  return replyTo || inTopic
    ? {
        replyToMsgId: replyTo ?? topic,
        ...(inTopic ? { forumTopic: true, replyToTopId: topic } : {}),
        ...(quote ? { quote: true, quoteText: quote } : {}),
      }
    : undefined;
};

// The same link the next sync gives a message we just sent, so it is
// never shown twice. Its full data comes with Telegram's echo of it.
const sentLink = (
  chat,
  messageId,
  text,
  at,
  { replyTo = null, quote = null, topic = null, entities = [] } = {}
) => {
  if (!messageId) {
    return null;
  }
  const reply = sentReply(replyTo, quote, topic);
  // GramJS gives users positive ids, groups and channels negative ones.
  const [link] = telegramDialogLinks(
    { id: chat, isUser: !chat.startsWith('-') },
    [{ id: messageId, out: true, message: text, date: at, replyTo: reply }]
  );
  const { raw: _raw, ...known } = link;
  // The quote and the formatting show at once; the rest of `raw` comes
  // with the echo.
  const raw = {
    ...(reply ? { replyTo: reply } : {}),
    ...(entities.length > 0 ? { entities: rawEntities(entities) } : {}),
  };
  return Object.keys(raw).length > 0 ? { ...known, raw } : known;
};

// Telegram's message length limit (help.getConfig), once per client.
const lengthLimits = new WeakMap();
const messageLengthMax = async (client, Api) => {
  if (!lengthLimits.has(client)) {
    const ask =
      Api?.help?.GetConfig && typeof client.invoke === 'function'
        ? client
            .invoke(new Api.help.GetConfig())
            .then((config) => Number(config?.messageLengthMax) || null)
            .catch(() => null)
        : Promise.resolve(null);
    lengthLimits.set(client, ask);
  }
  return (await lengthLimits.get(client)) ?? MAX_MESSAGE_LENGTH;
};

// Send as the user: exactly once (random_id), formatted, long text in
// parts; returns the network's links for what was sent.
const postAsUser = async (
  env,
  creds,
  {
    chat,
    text,
    clientId,
    replyTo,
    replyQuote = null,
    topic = null,
    silent,
    scheduleDate,
    sendAs,
    allowPaidStars,
    preview = null,
    effect,
  }
) => {
  const { client: own } = await env.connection.open(creds);
  // Sent as another identity (R-Y141).
  const client = await withSendAs(env, own, sendAs, allowPaidStars).catch(
    (error) => {
      throw sendError(error);
    }
  );
  const { Api, helpers } = await env.importer().catch(() => ({}));
  const maxLength = await messageLengthMax(client, Api);
  const release = env.live.expectOwn({
    chat,
    clientId,
    texts: formattedParts(text, maxLength).map((part) => part.text),
  });
  let sent;
  try {
    sent = await env.connection.withPeer(client, chat, (peer) =>
      sendText({
        client,
        Api,
        helpers,
        peer,
        text,
        clientId,
        maxLength,
        replyTo,
        replyQuote,
        topic,
        silent,
        scheduleDate,
        effect,
        preview,
        onResult: (result) => env.catchUp?.observeResult(result),
      })
    );
  } catch (error) {
    throw sendError(error);
  } finally {
    release();
  }
  // The send cleared the chat's cloud draft (`clear_draft`); so does its
  // read link, or the composer would take the sent text back as a draft.
  await Promise.resolve(
    env.live.draft?.({ chat, text: '', date: Math.floor(env.now() / 1000) })
  ).catch(() => {});
  if (scheduleDate) {
    // Held by Telegram, not in the chat: its scheduled ones (R-Y102).
    env.actions?.scheduledChanged?.(chat);
    return { ok: true, scheduled: true, chat, parts: sent.length, links: [] };
  }
  if (sent.some((part) => part.duplicate)) {
    // An earlier try got through but its answer was lost: the catch-up
    // brings that message in.
    env.catchUp?.run('duplicate').catch(() => {});
  }
  const at = new Date(env.now());
  const links = sent
    .map((part, index) =>
      sentLink(chat, idText(part.id), part.text, part.date ?? at, {
        replyTo: index === 0 ? replyTo : null,
        quote: index === 0 ? replyQuote : null,
        topic,
        entities: part.entities ?? [],
      })
    )
    .filter(Boolean);
  return {
    ok: true,
    messageId: idText(sent.at(-1)?.id),
    chat,
    parts: sent.length,
    ...(sent.some((part) => part.duplicate) ? { duplicate: true } : {}),
    ...(links.length > 0 ? { link: links.at(-1), links } : {}),
  };
};

// A draft's reply, quote, sound and time, as postAsUser takes them.
const draftOptions = (draft) => {
  const replyTo = Number(draft.replyTo);
  const topic = Number(draft.topic);
  return {
    replyTo: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null,
    // A forum topic it goes to (R-Y122).
    topic: Number.isInteger(topic) && topic > 0 ? topic : null,
    replyQuote: typeof draft.replyQuote === 'string' ? draft.replyQuote : null,
    silent: draft.silent === true,
    scheduleDate: Number.isInteger(draft.scheduleDate)
      ? draft.scheduleDate
      : null,
    // The identity it is sent as (R-Y141).
    sendAs: validSendAs(draft.sendAs) ? draft.sendAs : undefined,
    // The Stars the user confirmed for a paid chat (R-Y184).
    ...paidField(draft),
    // The link preview's choice (R-Y145), validated when it came in.
    preview: previewFields(draft),
    // A message effect (R-Y149), a decimal string.
    effect: EFFECT_ID.test(String(draft.effect ?? ''))
      ? draft.effect
      : undefined,
  };
};

/** history / post / setTyping through the connected account. */
const createMessaging = (env) => {
  const { store, connection, botLive, importer, now } = env;

  /** Send through the connected account (the chat composer, automations). */
  const post = async (draft = {}, options = {}) => {
    const creds = await readTelegramCredentials(store);
    if (creds?.kind !== 'user') {
      // A stored bot token, else the environment's one (as before).
      const token = creds?.token ?? options.token;
      return botLive.post(draft, token ? { ...options, token } : options);
    }
    const text = draft.text ?? draft.body;
    const target = draft.chat ?? draft.chatId ?? draft.to;
    if (!target) {
      throw new Error('telegram post requires a chat/chatId target');
    }
    return postAsUser(env, creds, {
      chat: String(target),
      text,
      clientId: draft.clientId,
      ...draftOptions(draft),
    });
  };

  // `cancel`: the user sent the message or cleared the box, so the
  // other side stops showing "typing…" at once (Telegram Desktop, Web A).
  const setTyping = async (
    { chat, chatId, cancel = false } = {},
    options = {}
  ) => {
    const creds = await readTelegramCredentials(store);
    const target = chat ?? chatId;
    if (creds?.kind !== 'user') {
      if (cancel) {
        return { ok: true, supported: false }; // bots have no cancel
      }
      const token = creds?.token ?? options.token;
      return botLive.setTyping({ chat: target }, token ? { token } : options);
    }
    const { client } = await connection.open(creds);
    const { Api } = await importer();
    return connection.withPeer(client, String(target), (peer) =>
      client.invoke(
        new Api.messages.SetTyping({
          peer,
          action: cancel
            ? new Api.SendMessageCancelAction()
            : new Api.SendMessageTypingAction(),
        })
      )
    );
  };

  // A user session and the chat to act on, else null (a bot, no chat).
  const userChat = async (chat) => {
    const creds = await readTelegramCredentials(store);
    if (creds?.kind !== 'user' || chat === undefined || chat === null) {
      return null;
    }
    const { client } = await connection.open(creds);
    return { client, chat: String(chat), Api: (await importer()).Api };
  };

  /**
   * Mark the chat read up to `maxId` on Telegram (the user saw those
   * messages here). Only forward: an older id than already read is a
   * no-op, as in TDLib and Element.
   */
  const markRead = async ({ chat, maxId, topic = null } = {}) => {
    const max = Number(maxId);
    const target =
      Number.isInteger(max) && max > 0 ? await userChat(chat) : null;
    if (!target) {
      return { ok: false, supported: false };
    }
    if (topic) {
      // A forum topic is read on its own, as Telegram's apps read it
      // (messages.readDiscussion, R-Y122); the chat's marker stays.
      const { client, Api } = target;
      await connection.withPeer(client, target.chat, (peer) =>
        client.invoke(
          new Api.messages.ReadDiscussion({
            peer,
            msgId: Number(topic),
            readMaxId: max,
          })
        )
      );
      return { ok: true };
    }
    const before = await store.get(`read:${SOURCE}:${target.chat}`);
    if ((before?.inboxMaxId ?? 0) >= max) {
      return { ok: true, already: true };
    }
    const { client, Api } = target;
    const result = await connection.withPeer(client, target.chat, (peer) =>
      client.invoke(
        target.chat.startsWith('-100')
          ? new Api.channels.ReadHistory({ channel: peer, maxId: max })
          : new Api.messages.ReadHistory({ peer, maxId: max })
      )
    );
    env.catchUp?.observeResult(result);
    await env.live.readInbox({ chat: target.chat, maxId: max });
    return { ok: true };
  };

  /** The chat's cloud draft (empty text clears it). */
  const saveDraft = async ({ chat, text = '' } = {}) => {
    const target = await userChat(chat);
    if (!target) {
      return { ok: false, supported: false };
    }
    const draft = String(text ?? '');
    const { client, Api } = target;
    await connection.withPeer(client, target.chat, (peer) =>
      client.invoke(new Api.messages.SaveDraft({ peer, message: draft }))
    );
    const before = await store.get(`read:${SOURCE}:${target.chat}`);
    await store.put({
      ...(before ?? {}),
      ...readLink(target.chat, {
        draft,
        draftAt: new Date(now()).toISOString(),
      }),
    });
    return { ok: true };
  };

  return { post, setTyping, markRead, saveDraft };
};

// The user's connection, opened again if it was dropped.
const reopenerOf = (store, connection) => async () => {
  const creds = await readTelegramCredentials(store);
  if (creds?.kind === 'user') {
    await connection.open(creds);
  }
};

// The account's request queue, stored peers, channel catch-up, page
// reader and message actions (on `env`).
const addReaders = (env, { pace, mediaDir }) => {
  const { store, now, log } = env;
  env.reopen = reopenerOf(store, env.connection);
  // Every Telegram request goes through one queue, the most urgent first,
  // paced; Telegram's "wait" is kept across restarts (R-Y34).
  env.queue = createFetchQueue({
    now,
    log,
    ...(pace ? { pace } : {}),
    onHold: (holds) => recordSync(store, { holds }).catch(() => {}),
    // No answer: the connection is likely gone. A new one is opened at
    // once, so the catch-up and the live updates follow it (not only
    // the next request).
    onStuck: () =>
      env.connection
        ?.disconnect()
        .then(() => env.reopen?.())
        .catch(() => {}),
  });
  env.peers = createPeers({ store, importer: env.importer });
  env.channels = createChannelSync({
    store,
    peers: env.peers,
    request: env.queue.run,
    handle: env.live.handle,
    client: async () => {
      const creds = await readTelegramCredentials(store);
      return creds?.kind === 'user'
        ? (await env.connection.open(creds)).client
        : null;
    },
    importer: env.importer,
    log,
    now,
  });
  env.pages = createPageReader(env, {
    credentials: () => readTelegramCredentials(store),
    toLinks: telegramDialogLinks,
    dialogOfEntity,
    dialogInfo,
    dialogReadLink,
    pinnedRanks,
    partnersOf: (listed) =>
      telegramPersonLinks(
        listed.filter((d) => d?.isUser && d.entity).map((d) => d.entity),
        { contact: false }
      ),
    writeChanged,
    recordSync,
    syncId: TELEGRAM_SYNC_ID,
  });
  env.actions = createActions(
    env,
    {
      credentials: () => readTelegramCredentials(store),
      toLinks: telegramDialogLinks,
      dialogOfEntity,
      writeChanged,
    },
    { mediaDir }
  );
};

// Telegram's "wait" for any request of the client — a send, a read
// marker, GramJS's own lookups — holds the queue too (R-Y34).
const watchFloods = (client, queue) => {
  if (typeof client?.invoke !== 'function' || client.invoke.watched) {
    return;
  }
  const invoke = client.invoke.bind(client);
  client.invoke = Object.assign(
    async (request, ...rest) => {
      try {
        return await invoke(request, ...rest);
      } catch (error) {
        queue.note(error, { method: request?.className ?? null });
        throw error;
      }
    },
    { watched: true }
  );
};

// Telegram's "wait" from before a restart still holds.
const restoreHolds = ({ store, queue }) =>
  store
    .get(TELEGRAM_SYNC_ID)
    .then((state) => queue.hold(state?.holds ?? {}))
    .catch(() => {});

// What the account reads on request: a chat's pages, more of the chat
// list, and a chat's whole history before others' (someone is being
// learned about, R-Y50).
const readersOf = (env, backfill) => ({
  history: env.pages.history,
  historyAt: env.pages.historyAt,
  historyAround: env.pages.historyAround,
  newer: env.pages.newer,
  moreDialogs: env.pages.moreDialogs,
  readFirst: backfill.prefer,
});

// The slow download of whole histories, through the account's readers.
const backfillOf = (env, { chats, everyMs }) =>
  createBackfill({
    store: env.store,
    queue: env.queue,
    pages: env.pages,
    chats: chats ?? (() => storedChats(env.store)),
    credentials: () => readTelegramCredentials(env.store),
    syncId: TELEGRAM_SYNC_ID,
    log: env.log,
    now: env.now,
    everyMs,
  });

// The minimal adapter object the sender and typing helper look up on the
// account; actions that act on existing messages live here too (R-Y36).
const buildLiveAdapter = (messaging, actions) => ({
  post: messaging.post,
  setTyping: messaging.setTyping,
  editMessage: actions.editMessage,
  react: actions.react,
  deleteMessages: actions.deleteMessages,
  forwardMessages: actions.forwardMessages,
  markRead: messaging.markRead,
});

// Mend what older versions stored wrong, once each, in the background.
const runRepairs = (store, log, refresh) =>
  repairSenders(store, { log })
    // Only worth it when GramJS really speaks the current layer.
    .then(() =>
      installTelegramLayer().layer === LAYER
        ? rereadUnsupported(store, {
            refresh,
            layer: LAYER,
            rev: SCHEMA_REV,
            log,
          })
        : 0
    )
    .then(() => nameForwards(store, { refresh, log }))
    .catch((error) =>
      log({
        level: 'warn',
        event: 'telegram_repair_failed',
        error: error.message,
      })
    );

// The connection's state, shown in Chat ("Telegram: reconnecting…");
// written on change only.
const connectionRecorder = (store) => {
  let current = null;
  return (state) => {
    const next = CONNECTION[state] ?? null;
    if (next !== current) {
      current = next;
      // Reached again, or out of reach since now (kept while it lasts).
      const mark = async () => {
        const before = (await store.get(TELEGRAM_SYNC_ID)) ?? {};
        const since = before.unreachableSince ?? null;
        const unreachableSince =
          next === 'connected'
            ? null
            : next
              ? (since ?? new Date().toISOString())
              : since;
        await recordSync(store, { connection: next, unreachableSince });
      };
      mark().catch(() => {});
    }
  };
};

export const createTelegramAccount = ({
  store,
  // The saved connection proxy is read whenever a client is built (R-Y192).
  clientFactory = gramjsClientFactory(importTelegram, {
    proxy: () => readProxy(store),
  }),
  importer = importTelegram,
  botLive = createTelegramBotLive(),
  log = () => {},
  now = () => Date.now(),
  dialogLimit = 40,
  messageLimit = 30,
  pollMs = 30_000,
  // The slow download of whole histories (./telegram-backfill.js): one
  // request this often; 0 turns it off. `chats()` lists the chats.
  backfillMs = BACKFILL_EVERY_MS,
  chats = null,
  // The queue's pace (./telegram-history.js PACE); tests pass NO_PACE.
  pace = null,
  // Where downloaded pictures are kept (null: none are downloaded).
  mediaDir = null,
} = {}) => {
  const live = createTelegramLive({
    store,
    toLinks: telegramDialogLinks,
    log,
    now,
    onPhoneCall: (client, effect) => env.phoneCalls?.handle(client, effect),
    // Pollers (no event stream) look at `changedAt` to know to refresh.
    touch: () =>
      recordSync(store, { changedAt: new Date(now()).toISOString() }),
  });
  let resync = async () => {}; // set once `sync` exists
  const env = { store, botLive, importer, log, now, live };
  const catchUp = createTelegramCatchUp({
    store,
    handle: live.handle,
    resync: (reason) => resync(reason),
    // A channel's gap: that channel's own catch-up, not the chat list.
    channelTooLong: (update) => env.channels.observe(update),
    request: (key, task) => env.queue.run(key, 'list', task),
    importer,
    log,
    onConnection: connectionRecorder(store),
  });
  const connection = createUserConnection({
    clientFactory,
    dialogLimit,
    log,
    peers: { input: (chat) => env.peers.input(chat) },
    request: (key, task) => env.queue.run(key, 'list', task),
    lookup: (client) => lookupAllDialogs(env, client),
    now,
    onOpen: (client, me) => {
      watchFloods(client, env.queue);
      live.attach(client);
      client.addEventHandler?.((update) => env.channels.observe(update));
      catchUp.attach(client, me).catch(() => {});
    },
  });
  Object.assign(env, { connection, catchUp });
  addReaders(env, { pace, mediaDir });
  const messaging = createMessaging(env);
  const backfill = backfillOf(env, { chats, everyMs: backfillMs });
  let running = null; // the sync in flight
  let timer = null;
  let resyncedAt = 0;

  /** Pull chats, messages and contacts into the store (one at a time). */
  const sync = ({
    full = false,
    reason = 'manual',
    dialogs = dialogLimit,
    messages = messageLimit,
  } = {}) => {
    running ??= runSync(env, { full, reason, dialogs, messages }).finally(
      () => {
        running = null;
      }
    );
    return running;
  };
  resync = async (reason) => {
    if (now() - resyncedAt < RESYNC_EVERY_MS) {
      return;
    }
    resyncedAt = now();
    await sync({ reason });
  };

  /** Whether an account is connected, and how the last sync went. */
  const status = async () => {
    const creds = await readTelegramCredentials(store);
    const link = await store.get(TELEGRAM_SYNC_ID);
    return {
      ...publicStatus(link ?? {}),
      ...reachability(creds ? link : null, now()),
      connected: Boolean(creds),
      kind: creds?.kind ?? null,
      syncing: Boolean(running),
      // Only a user session is kept up to date in the background.
      auto: creds?.kind === 'user',
      backfill: backfill.progress(),
      // How fast Telegram is asked now, and any wait it asked for.
      requests: env.queue.state(),
    };
  };

  /** The stored credential changed: drop the old connection, sync anew. */
  const connected = async () => {
    await connection.disconnect();
    const creds = await readTelegramCredentials(store);
    // A bot syncs only on request (see the module comment).
    return creds?.kind === 'user'
      ? sync({ full: true, reason: 'connect' })
      : status();
  };

  const start = () => {
    if (timer || !pollMs) {
      return;
    }
    restoreHolds(env);
    runRepairs(store, log, env.actions?.refreshMessages);
    const tick = async () => {
      const creds = await readTelegramCredentials(store);
      if (creds?.kind === 'user') {
        // Reopen a dropped connection, ask what we missed (cheap: Web A
        // asks on every ping); the chat list only now and then.
        await env.reopen().catch(() => {});
        await catchUp.run('poll');
        const state = (await store.get(TELEGRAM_SYNC_ID)) ?? {};
        if (
          now() - (Date.parse(state.dialogsAt ?? '') || 0) >=
          DIALOGS_EVERY_MS
        ) {
          await sync({ reason: 'poll' });
        }
      }
    };
    timer = globalThis.setInterval(() => {
      tick().catch(() => {});
    }, pollMs);
    timer.unref?.();
    tick().catch(() => {});
    backfill.start();
  };

  const stop = async () => {
    globalThis.clearInterval(timer);
    timer = null;
    backfill.stop();
    await env.channels.flush().catch(() => {});
    await catchUp.stop();
    await connection.disconnect();
  };

  return {
    sync,
    status,
    ...messaging,
    ...env.actions,
    ...readersOf(env, backfill),
    connected,
    start,
    stop,
    catchUp: () => catchUp.run('manual'),
    live: buildLiveAdapter(messaging, env.actions),
  };
};
