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
import { createTelegramBotLive } from './telegram.js';
import { stampSourceLink } from './index.js';
import { putAll } from '../storage/universal.js';
import {
  createTelegramLive,
  dialogInfo,
  readLink,
} from './telegram-account-live.js';
import { createTelegramCatchUp } from './telegram-catchup.js';
import {
  MAX_MESSAGE_LENGTH,
  sendError,
  sendText,
  splitMessage,
} from './telegram-send.js';

const SOURCE = 'telegram';
export const TELEGRAM_SYNC_ID = 'sync:telegram';
const CONTACTS_EVERY_MS = 10 * 60_000;
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
const bodyOf = (message) => message.message || (message.media ? '📎' : '');

/** One dialog's GramJS messages as `msg:telegram:<chat>:<id>` links. */
export const telegramDialogLinks = (dialog, messages = []) => {
  const chat = idText(dialog.id);
  const chatType = chatTypeOf(dialog);
  const chatName = dialog.title ?? dialog.name ?? fullName(dialog.entity);
  return messages
    .filter((m) => m && m.id !== undefined && bodyOf(m))
    .map((m) => {
      const mine = Boolean(m.out);
      const replyId = m.replyTo?.replyToMsgId;
      return buildMessageLink({
        source: SOURCE,
        externalId: `${chat}:${m.id}`,
        sender: mine ? 'me' : (idText(m.senderId) ?? chat),
        chat,
        body: bodyOf(m),
        timestamp: isoOf(m.date),
        replyTo: replyId ? `${chat}:${replyId}` : null,
        chatType,
        chatName,
        senderName: mine
          ? null
          : (fullName(m.sender) ?? (dialog.isUser ? chatName : null)),
      });
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
  'outboxMaxId',
  'inboxMaxId',
  'unreadCount',
  'unreadTopId',
  'draft',
];
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
      (link.contact && !before.contact);
    if (changed) {
      fresh.push(stampSourceLink({ ...(before ?? {}), ...link }, SOURCE));
    }
  }
  await putAll(store, fresh);
  return fresh.length;
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
];

const publicStatus = (link = {}) =>
  Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, link?.[f] ?? null]));

// One connected GramJS client per stored session, reused across requests.
// `onOpen(client, me)` runs once per new client (live updates attach
// there).
const createUserConnection = ({ clientFactory, dialogLimit, onOpen }) => {
  let connection = null; // { key, client, me }
  const disconnect = async () => {
    const current = connection;
    connection = null;
    try {
      await current?.client?.disconnect?.();
    } catch {
      // Already gone.
    }
  };
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
    await disconnect();
    const client = await clientFactory({
      apiId: creds.apiId,
      apiHash: creds.apiHash,
      session: creds.session,
    });
    client.setLogLevel?.('error');
    await client.connect();
    const me = accountOf(await client.getMe());
    connection = { key, client, me };
    onOpen?.(client, me);
    return connection;
  };
  // GramJS resolves a bare chat id only for peers it has seen; after a
  // restart, list the dialogs once so it knows them, then retry.
  const withPeer = async (client, chat, use) => {
    try {
      return await use(chat);
    } catch (error) {
      if (!/input entity|PEER_ID_INVALID/i.test(error.message ?? '')) {
        throw error;
      }
      await client.getDialogs({ limit: dialogLimit });
      return use(chat);
    }
  };
  return { open, disconnect, withPeer };
};

const readContacts = async (client, { importer, log }) => {
  if (typeof client.getContacts === 'function') {
    return client.getContacts();
  }
  try {
    const { Api, helpers } = await importer();
    const result = await client.invoke(
      new Api.contacts.GetContacts({ hash: helpers.returnBigInt(0) })
    );
    return result?.users ?? [];
  } catch (error) {
    log({ event: 'telegram_contacts_failed', error: error.message });
    return null;
  }
};

// What Telegram knows about a chat's reading and draft, as listed.
const dialogReadLink = (chat, dialog) => {
  const state = dialog.dialog ?? {};
  const draft = state.draft;
  return readLink(chat, {
    outboxMaxId: state.readOutboxMaxId,
    inboxMaxId: state.readInboxMaxId,
    unreadCount: dialog.unreadCount ?? state.unreadCount,
    unreadTopId: dialog.message?.id ?? state.topMessage,
    draft: draft?.message ?? '',
    draftAt: draft?.date ? isoOf(draft.date) : null,
  });
};

// The recent dialogs; only those whose newest message changed since the
// last sync (`tops`, updated in place) have their messages read again.
const readDialogs = async (
  client,
  { dialogs, messages, tops, chats: known }
) => {
  const links = [];
  const partners = [];
  let chats = 0;
  for (const dialog of await client.getDialogs({ limit: dialogs })) {
    const chat = idText(dialog.id);
    if (!chat) {
      continue;
    }
    chats += 1;
    known?.set(chat, dialogInfo(chat, dialog.entity));
    links.push(dialogReadLink(chat, dialog));
    if (dialog.isUser && dialog.entity) {
      partners.push(dialog.entity);
    }
    const top = idText(dialog.message?.id);
    if (top && tops[chat] === top) {
      continue;
    }
    const history = await client.getMessages(dialog.entity ?? chat, {
      limit: messages,
    });
    links.push(...telegramDialogLinks(dialog, [...(history ?? [])]));
    if (top) {
      tops[chat] = top;
    }
  }
  links.push(...telegramPersonLinks(partners, { contact: false }));
  return { links, chats };
};

// The address book is re-read on a full sync, for a new account, and
// every CONTACTS_EVERY_MS otherwise.
const contactsDue = (state, { full, sameAccount, now }) =>
  full ||
  !sameAccount ||
  now() - (Date.parse(state.contactsAt ?? '') || 0) >= CONTACTS_EVERY_MS;

const syncUser = async (env, creds, state, { full, dialogs, messages }) => {
  const { client, me } = await env.connection.open(creds);
  // Another account than last time: forget what was seen.
  const sameAccount = Boolean(state.account?.id) && state.account.id === me.id;
  const tops = sameAccount && !full ? { ...(state.tops ?? {}) } : {};
  const { links, chats } = await readDialogs(client, {
    dialogs,
    messages,
    tops,
    chats: env.live?.chats,
  });
  let contacts = state.contacts ?? 0;
  let contactsAt = state.contactsAt ?? null;
  if (contactsDue(state, { full, sameAccount, now: env.now })) {
    const users = await readContacts(client, env);
    if (users) {
      links.push(...telegramPersonLinks(users));
      contacts = users.filter((u) => u && !u.self).length;
      contactsAt = new Date(env.now()).toISOString();
    }
  }
  return {
    kind: 'user',
    account: me,
    chats,
    contacts,
    contactsAt,
    tops,
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
    await env.connection.disconnect();
    const link = await recordSync(store, {
      kind: creds.kind,
      at,
      error: error.message,
      code: error.code ?? error.errorMessage ?? 'sync-failed',
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

// The same link the next sync gives a message we just sent, so it is
// never shown twice.
const sentLink = (chat, messageId, text, at) =>
  messageId
    ? // GramJS gives users positive ids, groups and channels negative ones.
      telegramDialogLinks({ id: chat, isUser: !chat.startsWith('-') }, [
        { id: messageId, out: true, message: text, date: at },
      ])[0]
    : null;

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

// Send as the user: exactly once (random_id), plain text, long text in
// parts; returns the network's links for what was sent.
const postAsUser = async (env, creds, { chat, text, clientId }) => {
  const { client } = await env.connection.open(creds);
  const { Api, helpers } = await env.importer().catch(() => ({}));
  const maxLength = await messageLengthMax(client, Api);
  const release = env.live.expectOwn({
    chat,
    clientId,
    texts: splitMessage(text, maxLength),
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
  if (sent.some((part) => part.duplicate)) {
    // An earlier try got through but its answer was lost: the catch-up
    // brings that message in.
    env.catchUp?.run('duplicate').catch(() => {});
  }
  const at = new Date(env.now());
  const links = sent
    .map((part) => sentLink(chat, idText(part.id), part.text, part.date ?? at))
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

/** history / post / setTyping through the connected account. */
const createMessaging = (env) => {
  const { store, connection, botLive, importer, now } = env;

  /** Read more of one chat (a user session only). */
  const history = async ({ chat, limit = 50 } = {}) => {
    const creds = await readTelegramCredentials(store);
    if (creds?.kind !== 'user' || !chat) {
      return { written: 0 };
    }
    const { client } = await connection.open(creds);
    const target = String(chat);
    const entity = await connection.withPeer(client, target, (peer) =>
      client.getEntity(peer)
    );
    const list = await client.getMessages(entity, { limit });
    const links = telegramDialogLinks(dialogOfEntity(target, entity), [
      ...(list ?? []),
    ]);
    const written = await writeChanged(store, links);
    if (written > 0) {
      await recordSync(store, { changedAt: new Date(now()).toISOString() });
    }
    return { written };
  };

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
  const markRead = async ({ chat, maxId } = {}) => {
    const max = Number(maxId);
    const target =
      Number.isInteger(max) && max > 0 ? await userChat(chat) : null;
    if (!target) {
      return { ok: false, supported: false };
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

  return { history, post, setTyping, markRead, saveDraft };
};

export const createTelegramAccount = ({
  store,
  clientFactory = gramjsClientFactory(),
  importer = () => import('telegram'),
  botLive = createTelegramBotLive(),
  log = () => {},
  now = () => Date.now(),
  dialogLimit = 40,
  messageLimit = 30,
  pollMs = 30_000,
} = {}) => {
  const live = createTelegramLive({
    store,
    toLinks: telegramDialogLinks,
    log,
    now,
    // Pollers (no event stream) look at `changedAt` to know to refresh.
    touch: () =>
      recordSync(store, { changedAt: new Date(now()).toISOString() }),
  });
  let resync = async () => {}; // set once `sync` exists
  let connectionState = null;
  const catchUp = createTelegramCatchUp({
    store,
    handle: live.handle,
    resync: (reason) => resync(reason),
    importer,
    log,
    // Shown in Chat ("Telegram: reconnecting…"); written on change only.
    onConnection: (state) => {
      const next = CONNECTION[state] ?? null;
      if (next !== connectionState) {
        connectionState = next;
        recordSync(store, { connection: next }).catch(() => {});
      }
    },
  });
  const connection = createUserConnection({
    clientFactory,
    dialogLimit,
    onOpen: (client, me) => {
      live.attach(client);
      catchUp.attach(client, me).catch(() => {});
    },
  });
  const env = { store, connection, botLive, importer, log, now, live, catchUp };
  const messaging = createMessaging(env);
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
      connected: Boolean(creds),
      kind: creds?.kind ?? null,
      syncing: Boolean(running),
      // Only a user session is kept up to date in the background.
      auto: creds?.kind === 'user',
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
    const tick = async () => {
      const creds = await readTelegramCredentials(store);
      if (creds?.kind === 'user') {
        // Ask Telegram what we missed (cheap when nothing: Web A does it
        // on every ping), then re-read changed dialogs (channels).
        await catchUp.run('poll');
        await sync({ reason: 'poll' });
      }
    };
    timer = globalThis.setInterval(() => {
      tick().catch(() => {});
    }, pollMs);
    timer.unref?.();
    tick().catch(() => {});
  };

  const stop = async () => {
    globalThis.clearInterval(timer);
    timer = null;
    await catchUp.stop();
    await connection.disconnect();
  };

  return {
    sync,
    status,
    ...messaging,
    connected,
    start,
    stop,
    catchUp: () => catchUp.run('manual'),
    // The adapter shape the sender and the typing helper look up.
    live: { post: messaging.post, setTyping: messaging.setTyping },
  };
};
