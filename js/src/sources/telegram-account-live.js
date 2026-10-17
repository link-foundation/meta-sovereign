/**
 * Real-time Telegram for a connected user session.
 *
 * While the GramJS client is connected, Telegram pushes updates over the
 * same MTProto connection: new and edited messages, deletions, "read"
 * receipts and typing. `createTelegramLive` registers one raw handler on
 * each client the account opens and writes what the update means to the
 * store, as the same links a sync would write — so a message that arrives
 * live and the next sync agree, and nothing shows twice:
 *
 *   msg:telegram:<chat>:<id>   new / edited (`edited`) / deleted (`deleted`)
 *   read:telegram:<chat>       the chat's read and draft state:
 *                              `outboxMaxId`  the other side read our
 *                                             messages up to this id
 *                              `inboxMaxId`   we read theirs up to it
 *                              `unreadCount`  unread at `unreadTopId`
 *                                             (Telegram's count; newer
 *                                             ones are counted from links)
 *                              `draft`, `draftAt`  the cloud draft
 *   typing:telegram:<chat>:<user>
 *
 * Updates missed while the connection was down come through the same
 * handler from the catch-up (./telegram-catchup.js); the background poll
 * stays as the last safety net.
 */

import { typingLink } from './live-links.js';
import { stampSourceLink } from './index.js';
import { updateEffect } from './telegram-updates.js';

const SOURCE = 'telegram';

export const readLinkId = (chat) => `read:${SOURCE}:${chat}`;

const READ_FIELDS = ['outboxMaxId', 'inboxMaxId', 'unreadCount', 'unreadTopId'];

/** One chat's read (and draft) state; only the given fields are set. */
export const readLink = (chat, fields = {}) => ({
  id: readLinkId(chat),
  tokens: ['read', SOURCE, String(chat)],
  kind: 'read',
  source: SOURCE,
  chat: String(chat),
  ...Object.fromEntries(
    READ_FIELDS.filter(
      (f) => fields[f] !== undefined && fields[f] !== null
    ).map((f) => [f, Number(fields[f]) || 0])
  ),
  ...(fields.draft !== undefined
    ? { draft: String(fields.draft ?? ''), draftAt: fields.draftAt ?? null }
    : {}),
});

const isoOf = (date) =>
  date ? new Date(Number(date) * 1000).toISOString() : null;

// What `telegramDialogLinks` needs to know about a chat, from a GramJS
// entity (a User, Chat or Channel).
export const dialogInfo = (chat, entity) => {
  const kind = entity?.className;
  const name = [entity?.firstName, entity?.lastName].filter(Boolean).join(' ');
  return {
    id: chat,
    entity,
    title: name || entity?.title || entity?.username || null,
    isUser: kind ? kind === 'User' : !String(chat).startsWith('-'),
    isGroup: kind === 'Chat' || Boolean(entity?.megagroup),
    isChannel: kind === 'Channel',
  };
};

/**
 * Our own messages being sent right now, by chat, with their text: the
 * copy Telegram echoes (another device's view, a catch-up) is matched to
 * the composer's bubble (`clientId`) instead of showing twice. This plays
 * the role of Telegram Web K's pendingByRandomId: GramJS does not expose
 * the random_id on the message it hands us.
 */
const createOwnMessages = () => {
  const own = new Map(); // chat -> [{ clientId, texts }]
  const expect = ({ chat, clientId, texts }) => {
    if (!clientId) {
      return () => {};
    }
    const entry = { clientId, texts: new Set(texts) };
    own.set(chat, [...(own.get(chat) ?? []), entry]);
    return () => {
      const rest = (own.get(chat) ?? []).filter((e) => e !== entry);
      if (rest.length > 0) {
        own.set(chat, rest);
      } else {
        own.delete(chat);
      }
    };
  };
  const clientIdOf = (chat, link) =>
    link.sender === 'me'
      ? ((own.get(chat) ?? []).find((e) => e.texts.has(link.body))?.clientId ??
        null)
      : null;
  return { expect, clientIdOf };
};

// The read markers, the cloud draft and typing of a chat, as links.
const chatStateWriters = ({ store, now }) => {
  // Read markers only move forward (Element never rewinds a receipt).
  const onRead = async ({ chat, maxId }) => {
    const before = await store.get(readLinkId(chat));
    if ((before?.outboxMaxId ?? 0) >= maxId) {
      return false;
    }
    await store.put({
      ...(before ?? {}),
      ...readLink(chat, { outboxMaxId: maxId }),
    });
    return false; // a marker, not a message: no refresh needed for it
  };

  // We read the chat up to maxId (here or on another device): what is
  // still unread is newer than maxId, so it is counted from the links.
  const onReadInbox = async ({ chat, maxId }) => {
    const before = await store.get(readLinkId(chat));
    if ((before?.inboxMaxId ?? 0) >= maxId) {
      return false;
    }
    await store.put({
      ...(before ?? {}),
      ...readLink(chat, {
        inboxMaxId: maxId,
        unreadCount: 0,
        unreadTopId: maxId,
      }),
    });
    return false;
  };

  const onDraft = async ({ chat, text: draft, date }) => {
    const before = await store.get(readLinkId(chat));
    await store.put({
      ...(before ?? {}),
      ...readLink(chat, { draft, draftAt: isoOf(date) }),
    });
    return false;
  };

  const onTyping = async ({ chat, user, typing }) => {
    await store.put(
      typingLink({
        source: SOURCE,
        chat,
        user,
        state: typing ? 'typing' : 'idle',
        at: new Date(now()).toISOString(),
      })
    );
    return false;
  };

  return { onRead, onReadInbox, onDraft, onTyping };
};

/**
 * Apply live updates to the store.
 *   toLinks(dialog, messages)  the sync's message mapping
 *   chats                      Map chat -> dialog info, filled by syncs
 *   touch()                    marks the store changed (for pollers)
 */
export const createTelegramLive = ({
  store,
  toLinks,
  chats = new Map(),
  touch = async () => {},
  log = () => {},
  now = () => Date.now(),
}) => {
  const entityOf = (entities, id) =>
    id === null || id === undefined
      ? null
      : (entities?.get?.(String(id)) ?? null);

  const dialogFor = async (client, chat, entities) => {
    const known = chats.get(chat);
    if (known) {
      return known;
    }
    let entity = entityOf(entities, chat);
    if (!entity) {
      try {
        entity = await client?.getEntity?.(chat);
      } catch {
        entity = null; // a name is nice to have, not required
      }
    }
    const dialog = dialogInfo(chat, entity);
    if (entity) {
      chats.set(chat, dialog);
    }
    return dialog;
  };

  const own = createOwnMessages();

  const merge = async (link) => {
    const before = await store.get(link.id);
    const next = stampSourceLink({ ...(before ?? {}), ...link }, SOURCE);
    await store.put(next);
    return next;
  };

  const onMessage = async (client, { kind, chat, message, entities }) => {
    const dialog = await dialogFor(client, chat, entities);
    const sender = entityOf(
      entities,
      message.senderId?.value ?? message.senderId
    );
    const [link] = toLinks(dialog, [
      { ...message, sender: message.sender ?? sender },
    ]);
    if (!link) {
      return false;
    }
    const edited = kind === 'edit' ? isoOf(message.editDate) : null;
    const clientId = own.clientIdOf(chat, link);
    await merge({
      ...link,
      ...(edited ? { edited } : {}),
      ...(clientId ? { clientId } : {}),
    });
    if (kind === 'message' && link.sender !== 'me') {
      await stopTyping(chat, link.sender);
    }
    return true;
  };

  // Their message is here, so they are no longer typing it (as Telegram
  // apps show it, without waiting for the typing status to time out).
  const stopTyping = async (chat, user) => {
    const id = `typing:${SOURCE}:${chat}:${user}`;
    const before = await store.get(id);
    if (before?.state === 'typing') {
      await store.put({ ...before, state: 'idle' });
    }
  };

  const onDelete = async ({ chat, ids }) => {
    const wanted = new Set(ids.map(String));
    // Without a chat, the ids are the account-wide ones of private chats
    // and basic groups (never channels).
    const matches = await store.query(
      (l) =>
        l.id?.startsWith(`msg:${SOURCE}:`) &&
        !l.deleted &&
        (chat ? l.chat === chat : !String(l.chat).startsWith('-100')) &&
        wanted.has(l.id.split(':').pop())
    );
    for (const link of matches) {
      await store.put({ ...link, deleted: true });
    }
    return matches.length > 0;
  };

  const { onRead, onReadInbox, onDraft, onTyping } = chatStateWriters({
    store,
    now,
  });

  const apply = async (client, effect) => {
    if (!effect?.chat && effect?.kind !== 'delete') {
      return false;
    }
    switch (effect.kind) {
      case 'message':
      case 'edit':
        return onMessage(client, effect);
      case 'delete':
        return onDelete(effect);
      case 'read':
        return onRead(effect);
      case 'read-inbox':
        return onReadInbox(effect);
      case 'draft':
        return onDraft(effect);
      case 'typing':
        return onTyping(effect);
      default:
        return false;
    }
  };

  /** One raw GramJS update. */
  const handle = async (client, update) => {
    const effect = updateEffect(update);
    if (!effect) {
      return;
    }
    try {
      if (await apply(client, effect)) {
        await touch();
      }
    } catch (error) {
      log({
        level: 'error',
        event: 'telegram_update_failed',
        kind: effect.kind,
        error: error.message,
      });
    }
  };

  /** Listen on a freshly connected client. */
  const attach = (client) => {
    if (typeof client?.addEventHandler !== 'function') {
      return;
    }
    client.addEventHandler((update) => handle(client, update));
  };

  return {
    attach,
    handle,
    chats,
    expectOwn: own.expect,
    readInbox: onReadInbox,
    draft: onDraft,
  };
};
