/**
 * Chat metadata for the sidebar and header (R-Y36): member count, online
 * count, about text, username and whether the peer has a profile photo.
 *   GET /api/telegram/chat-info?chat=<id>
 *   → { chat, kind, title, members, online, username, about, photo,
 *       pinned (the newest pinned message's id), broadcast?, bot?,
 *       lastSeen? }
 *
 * Fetched through the account's queue at `view` priority and cached in
 * memory for 60 s (online counts change, so longer is wrong). The three
 * chat kinds each need their own Telegram call:
 *   - channel/supergroup (-100N): channels.GetFullChannel + GetOnlines
 *   - basic group (-N):           messages.GetFullChat  + GetOnlines
 *   - user (positive id):         users.GetFullUser
 * Secrets are never logged; only the error code on failure.
 */

import { importTelegram } from './telegram-layer.js';

const CHAT = /^-?\d{1,20}$/;
const CACHE_TTL_MS = 60_000;

const isChannel = (chat) => chat.startsWith('-100');
const isGroup = (chat) => !isChannel(chat) && chat.startsWith('-');

// Parse UserStatus into { online, lastSeen? }.
const statusOf = (status) => {
  const cn = status?.className;
  if (cn === 'UserStatusOnline') {
    return { online: true };
  }
  if (cn === 'UserStatusOffline') {
    return {
      online: false,
      lastSeen: new Date(Number(status.wasOnline) * 1000).toISOString(),
    };
  }
  if (cn === 'UserStatusRecently') {
    return { online: false, lastSeen: 'recently' };
  }
  if (cn === 'UserStatusLastWeek') {
    return { online: false, lastSeen: 'week' };
  }
  if (cn === 'UserStatusLastMonth') {
    return { online: false, lastSeen: 'month' };
  }
  return { online: false };
};

const hasPhoto = (photo) =>
  Boolean(
    photo &&
    photo.className !== 'ChatPhotoEmpty' &&
    photo.className !== 'UserProfilePhotoEmpty'
  );

// Online count for a peer — 0 on any failure (not critical).
const getOnlines = async (client, Api, inputPeer) => {
  try {
    const r = await client.invoke(
      new Api.messages.GetOnlines({ peer: inputPeer })
    );
    return r?.onlines ?? 0;
  } catch {
    return 0;
  }
};

/**
 * Whether the user may pin messages in a group or channel, from its
 * entity, as Telegram's apps decide: its creator always; in a channel an
 * admin who may edit messages; in a group an admin who may pin, or
 * anyone when neither the group nor the user's own restrictions forbid it.
 */
export const canPinIn = (entity = {}) => {
  if (entity.creator) {
    return true;
  }
  if (entity.broadcast) {
    return Boolean(entity.adminRights?.editMessages);
  }
  if (entity.adminRights?.pinMessages) {
    return true;
  }
  return !(
    entity.bannedRights?.pinMessages || entity.defaultBannedRights?.pinMessages
  );
};

// Whether the user may see and replace the chat's invite link: its
// creator, or an admin with the right to invite (R-Y123).
export const canInviteIn = (entity = {}) =>
  Boolean(entity.creator || entity.adminRights?.inviteUsers);

// The primary invite link the full chat carries, for those who may see it.
const inviteOf = (entity, full) =>
  canInviteIn(entity) && typeof full.exportedInvite?.link === 'string'
    ? { canInvite: true, inviteLink: full.exportedInvite.link }
    : { canInvite: canInviteIn(entity) };

const fetchChannel = async (client, Api, inputPeer) => {
  const result = await client.invoke(
    new Api.channels.GetFullChannel({ channel: inputPeer })
  );
  const full = result.fullChat;
  const entity = (result.chats ?? []).find(Boolean) ?? {};
  const online = await getOnlines(client, Api, inputPeer);
  return {
    kind: 'channel',
    title: entity.title ?? null,
    members: full.participantsCount ?? null,
    online,
    username: entity.username ?? null,
    about: full.about ?? null,
    photo: hasPhoto(entity.photo),
    pinned: full.pinnedMsgId ?? null,
    canPin: canPinIn(entity),
    broadcast: Boolean(entity.broadcast),
    ...inviteOf(entity, full),
  };
};

const fetchGroup = async (client, Api, helpers, inputPeer, chat) => {
  // A basic group's id is its marked id without the minus.
  const chatId = helpers.returnBigInt(chat.slice(1));
  const result = await client.invoke(new Api.messages.GetFullChat({ chatId }));
  const full = result.fullChat;
  const entity = (result.chats ?? []).find(Boolean) ?? {};
  const parts = full.participants?.participants ?? [];
  const online = await getOnlines(client, Api, inputPeer);
  return {
    kind: 'group',
    title: entity.title ?? null,
    members: parts.length,
    online,
    username: null,
    about: full.about ?? null,
    photo: hasPhoto(entity.photo),
    pinned: full.pinnedMsgId ?? null,
    canPin: canPinIn(entity),
    ...inviteOf(entity, full),
  };
};

// A person's InputUser: from their stored peer, else by id alone.
const inputUserOf = (Api, helpers, storedPeer, chat) =>
  storedPeer?.userId !== undefined
    ? new Api.InputUser({
        userId: storedPeer.userId,
        accessHash: storedPeer.accessHash,
      })
    : new Api.InputUser({
        userId: helpers.returnBigInt(String(chat)),
        accessHash: helpers.returnBigInt('0'),
      });

const nameOf = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
  user.username ||
  null;

const fetchUser = async (client, Api, helpers, inputPeer, peers, chat) => {
  const storedPeer = inputPeer ?? (await peers.input(chat));
  const id = inputUserOf(Api, helpers, storedPeer, chat);
  const result = await client.invoke(new Api.users.GetFullUser({ id }));
  const full = result.fullUser ?? result;
  const user = (result.users ?? []).find(Boolean) ?? {};
  const { online = false, lastSeen } = statusOf(user.status);
  return {
    kind: 'user',
    title: nameOf(user),
    members: 1,
    online,
    username: user.username ?? null,
    about: full.about ?? null,
    photo: hasPhoto(user.photo),
    pinned: full.pinnedMsgId ?? null,
    // Blocked by us, and in our contacts (R-Y128).
    blocked: Boolean(full.blocked),
    contact: Boolean(user.contact),
    ...(user.bot ? { bot: true } : {}),
    ...(lastSeen !== undefined ? { lastSeen } : {}),
  };
};

/**
 * `read({ chat })` → the chat's metadata, or null on failure.
 * Results are cached in memory for 60 s. `client()` is the connected
 * GramJS client (or null), `peers` the account's peer store.
 */
export const createChatInfoReader = ({
  queue,
  client: clientOf,
  peers,
  importer = importTelegram,
  log = () => {},
}) => {
  const cache = new Map(); // chat → { data, at }

  const fetch = async (chat, client, Api, helpers, inputPeer) => {
    if (isChannel(chat)) {
      return fetchChannel(client, Api, inputPeer);
    }
    if (isGroup(chat)) {
      return fetchGroup(client, Api, helpers, inputPeer, chat);
    }
    return fetchUser(client, Api, helpers, inputPeer, peers, chat);
  };

  // Kept for a minute: read again only after.
  const fresh = (target) => {
    const hit = cache.get(target);
    if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) {
      return null;
    }
    log({
      event: 'telegram_chat_info',
      kind: hit.data.kind,
      cached: true,
      duration_ms: 0,
    });
    return hit.data;
  };

  // A chat the account holds has its stored peer; else GramJS may
  // know it from what it has seen.
  const inputOf = async (target, client, helpers) =>
    (await peers.input(target)) ??
    (await Promise.resolve()
      .then(() => client.getInputEntity?.(helpers.returnBigInt(target)))
      .catch(() => null)) ??
    null;

  const read = async ({ chat } = {}) => {
    const target = String(chat ?? '');
    if (!CHAT.test(target)) {
      return null;
    }

    const hit = fresh(target);
    if (hit) {
      return hit;
    }
    const client = await clientOf();
    if (!client) {
      return null;
    }
    const { Api, helpers } = await importer();
    const inputPeer = await inputOf(target, client, helpers);
    const started = Date.now();
    try {
      const data = await queue.run(`chat-info:${target}`, 'view', () =>
        fetch(target, client, Api, helpers, inputPeer)
      );
      cache.set(target, { data: { chat: target, ...data }, at: Date.now() });
      log({
        event: 'telegram_chat_info',
        kind: data.kind,
        cached: false,
        duration_ms: Date.now() - started,
      });
      return cache.get(target).data;
    } catch (error) {
      log({
        level: 'warn',
        event: 'telegram_chat_info_failed',
        code: error.errorMessage ?? error.code ?? null,
        duration_ms: Date.now() - started,
      });
      return null;
    }
  };

  return { read };
};
