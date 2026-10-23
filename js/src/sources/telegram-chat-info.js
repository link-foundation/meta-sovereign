/**
 * Chat metadata for the sidebar and header (R-Y36): member count, online
 * count, about text, username and whether the peer has a profile photo.
 *   GET /api/telegram/chat-info?chat=<id>
 *   → { chat, kind, title, members, online, username, about, photo,
 *       pinned (the newest pinned message's id), broadcast?, bot?,
 *       lastSeen?, commonChats? (a person: groups in common) }
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
import { wallpaperPage } from './telegram-wallpapers.js';
import { themeOf } from './telegram-chat-themes.js';
import { collectibleOf, usernamesOf } from './telegram-usernames.js';
import { canReactIn, reactionsOf } from './telegram-chat-reactions.js';
import { settingsInfo } from './telegram-chat-settings.js';
import { birthdayOf, colorOf } from './telegram-profile-extras.js';
import { monoforumInfo } from './telegram-channel-dm-shape.js';
import { ALL_ADMIN_RIGHTS } from './telegram-admin-rights.js';

const CHAT = /^-?\d{1,20}$/;
const CACHE_TTL_MS = 60_000;

const isChannel = (chat) => chat.startsWith('-100');
const isGroup = (chat) => !isChannel(chat) && chat.startsWith('-');

// Parse UserStatus into { online, lastSeen? }.
export const statusOf = (status) => {
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

// Whether the user may change the chat's name, description and photo: its
// creator, an admin with the right to change info, or, in a group, a member
// whom neither the group's rights nor their own restrict (R-Y129).
export const canEditIn = (entity = {}) =>
  Boolean(entity.creator || entity.adminRights?.changeInfo) ||
  (!entity.broadcast &&
    !entity.left &&
    !entity.deactivated &&
    Boolean(entity.defaultBannedRights) &&
    !entity.defaultBannedRights.changeInfo &&
    !entity.bannedRights?.changeInfo);

// Whether the user may ban people and so set the group's permissions: its
// creator, or an admin with the right to ban users (R-Y133).
export const canBanIn = (entity = {}) =>
  Boolean(entity.creator || entity.adminRights?.banUsers);

// What the user may do about other people's messages and about who owns
// the chat (R-Y200): delete them (creator, or an admin who may delete
// messages), own the chat (the creator: transfer it, and convert a
// supergroup to a broadcast group).
export const moderationOf = (entity = {}) => ({
  canDeleteMessages: Boolean(
    entity.creator || entity.adminRights?.deleteMessages
  ),
  owner: Boolean(entity.creator),
  canConvertGiga: Boolean(
    entity.creator && entity.megagroup && !entity.gigagroup
  ),
  gigagroup: Boolean(entity.gigagroup),
});

// Whether the user may set the chat's auto-delete timer (R-Y143): its
// creator, or an admin with the right to delete messages.
export const canSetTtlIn = (entity = {}) =>
  Boolean(entity.creator || entity.adminRights?.deleteMessages);

// The auto-delete period a full chat carries, in seconds, or 0 (off).
const ttlOf = (full) => Number(full?.ttlPeriod) || 0;

// Which reactions a group or channel allows, and whether the user may
// change that (R-Y160).
const reactionsInfo = (entity, full) => ({
  reactions: reactionsOf(full),
  canSetReactions: canReactIn(entity),
});

// The chat's own wallpaper, when it has one (R-Y155).
const wallpaperOf = (full) => {
  const wallpaper = wallpaperPage(full?.wallpaper);
  return wallpaper ? { wallpaper } : {};
};

// A channel's several usernames, for the user who owns it (R-Y170).
const usernamesInfo = (entity) => {
  const usernames = usernamesOf(entity.usernames);
  return entity.creator && usernames.length > 0
    ? { usernames, canEditUsernames: true }
    : {};
};

// What the user may do with administrators and the history new members see
// (R-Y204): their own rights (the creator has all), who may add admins, and
// whether the history is hidden from new members.
const adminInfo = (entity, full, kind) => ({
  creator: Boolean(entity.creator),
  myRights: Object.fromEntries(
    ALL_ADMIN_RIGHTS.map((key) => [key, Boolean(entity.adminRights?.[key])])
  ),
  canAddAdmins: Boolean(entity.creator || entity.adminRights?.addAdmins),
  canToggleHistory:
    kind === 'channel' &&
    Boolean(entity.creator || entity.adminRights?.changeInfo),
  historyHidden: Boolean(full?.hiddenPrehistory),
});

// The primary invite link the full chat carries, for those who may see it.
const inviteOf = (entity, full) =>
  canInviteIn(entity) && typeof full.exportedInvite?.link === 'string'
    ? { canInvite: true, inviteLink: full.exportedInvite.link }
    : { canInvite: canInviteIn(entity) };

/**
 * What the user may do with a forum's topics (R-Y153), as Desktop
 * decides: manage them (creator, or an admin who may manage topics),
 * create one (that, or anyone neither the group's nor their own
 * restrictions forbid), delete them (creator, or an admin who may delete
 * messages).
 */
export const topicRightsIn = (entity = {}) => {
  const manage = Boolean(entity.creator || entity.adminRights?.manageTopics);
  return {
    manage,
    create:
      manage ||
      (!entity.left &&
        !entity.bannedRights?.manageTopics &&
        !entity.defaultBannedRights?.manageTopics),
    delete: Boolean(entity.creator || entity.adminRights?.deleteMessages),
  };
};

// People waiting to be let in, for those who may invite (R-Y152): how
// many, and the latest few as { id, name }.
const requestsOf = (entity, full, users = []) => {
  const pending = Number(full?.requestsPending ?? 0);
  if (!canInviteIn(entity) || pending <= 0) {
    return {};
  }
  const byId = new Map(users.map((u) => [String(u.id?.value ?? u.id), u]));
  const recentRequesters = (full.recentRequesters ?? []).map((raw) => {
    const id = String(raw?.value ?? raw);
    return { id, name: nameOf(byId.get(id) ?? {}) || id };
  });
  return { requestsPending: pending, recentRequesters };
};

// The channel's direct messages (R-Y191): its linked monoforum, whose peer
// is kept so the chat can be opened and written to.
const monoforumOf = async (entity, chats, peers) => {
  const monoforum = monoforumInfo(entity, chats);
  if (!monoforum) {
    return {};
  }
  const chat = chats.find(
    (c) => String(c?.id?.value ?? c?.id) === monoforum.id.slice(4)
  );
  await Promise.resolve(
    chat
      ? peers?.remember?.(monoforum.id, chat, {
          title: monoforum.title,
          isChannel: true,
        })
      : null
  ).catch(() => {});
  return { monoforum };
};

const fetchChannel = async (client, Api, inputPeer, peers) => {
  const result = await client.invoke(
    new Api.channels.GetFullChannel({ channel: inputPeer })
  );
  const full = result.fullChat;
  // The channel itself: with a monoforum the answer lists two chats.
  const entity =
    (result.chats ?? []).find(
      (c) => c && full?.id !== undefined && String(c.id) === String(full.id)
    ) ??
    (result.chats ?? []).find(Boolean) ??
    {};
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
    forum: Boolean(entity.forum),
    // "View as messages" is on for this forum (R-Y171).
    forumAsMessages: Boolean(full.viewForumAsMessages),
    topics: topicRightsIn(entity),
    canToggleForum: Boolean(entity.creator) && !entity.broadcast,
    // Statistics for admins of channels and big supergroups (R-Y167).
    canViewStats: Boolean(full.canViewStats),
    // The Stars revenue section of the statistics (R-Y195).
    canViewStarsRevenue: Boolean(full.canViewStarsRevenue),
    canEdit: canEditIn(entity),
    canBan: canBanIn(entity),
    ...moderationOf(entity),
    ttlPeriod: ttlOf(full),
    canSetTtl: canSetTtlIn(entity),
    ...reactionsInfo(entity, full),
    // Sign messages, Discussion, Join to send… (R-Y165).
    settings: settingsInfo(entity, full, result.chats ?? []),
    ...wallpaperOf(full),
    ...usernamesInfo(entity),
    ...collectibleOf(entity),
    ...inviteOf(entity, full),
    ...adminInfo(entity, full, 'channel'),
    ...requestsOf(entity, full, result.users),
    ...(await monoforumOf(entity, result.chats ?? [], peers)),
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
    canEdit: canEditIn(entity),
    canBan: canBanIn(entity),
    ...moderationOf(entity),
    ttlPeriod: ttlOf(full),
    canSetTtl: canSetTtlIn(entity),
    ...reactionsInfo(entity, full),
    settings: settingsInfo(entity, full, result.chats ?? []),
    ...inviteOf(entity, full),
    ...adminInfo(entity, full, 'group'),
    ...requestsOf(entity, full, result.users),
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

// A person's birthday, profile colour and whether they show a personal
// channel (R-Y178); the channel's card is read when the profile opens.
const extrasOf = (user, full) => ({
  ...(birthdayOf(full.birthday) ? { birthday: birthdayOf(full.birthday) } : {}),
  ...(colorOf(user.profileColor)
    ? { profileColor: colorOf(user.profileColor) }
    : {}),
  ...(full.personalChannelId ? { personalChannel: true } : {}),
});

// A bot the user owns: its Stars revenue (R-Y195).
const botRevenueOf = (user, full) =>
  user.bot && full.canViewRevenue ? { canViewStarsRevenue: true } : {};

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
    // The auto-delete timer; anyone may set it in a chat with a person
    // (not in Saved Messages, the chat with oneself) (R-Y143).
    ttlPeriod: ttlOf(full),
    canSetTtl: !user.self,
    // Groups both belong to (R-Y158); the list is a separate call.
    commonChats: user.self ? 0 : Number(full.commonChatsCount) || 0,
    ...wallpaperOf(full),
    ...extrasOf(user, full),
    // Collectible usernames and number, opened in Fragment's card (R-Y194).
    ...collectibleOf(user),
    // The theme of this chat, by its emoticon (R-Y170).
    ...(themeOf(full) ? { theme: themeOf(full) } : {}),
    ...(user.self ? { self: true } : {}),
    ...(user.bot ? { bot: true } : {}),
    ...botRevenueOf(user, full),
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
      return fetchChannel(client, Api, inputPeer, peers);
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
