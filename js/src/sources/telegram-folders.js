/**
 * Chat folders, as Telegram's apps show them (R-Y103; Telegram Desktop's
 * folders above the chat list, learned, never copied).
 *
 * `folderList({ fresh })` — messages.getDialogFilters, as plain data the
 * page applies to its chat list (./../web/chat-folders.js):
 *
 *   { id, title, emoticon,
 *     contacts, nonContacts, groups, broadcasts, bots,   // who is in
 *     excludeMuted, excludeRead, excludeArchived,       // who is not
 *     include: [chat], exclude: [chat], pinned: [chat],  // by name
 *     chatlist?, hasMyInvites? }                        // a shared one
 *
 * and `{ id: 0, all: true }` where "All chats" stands among them (a
 * Premium user may move it). Chats are our chat ids (Telegram's marked
 * ids: a user's id, -chat, -100channel). Kept for a minute: folders
 * change rarely, and only in Telegram's settings.
 */

const KEEP_MS = 60_000;

// An InputPeer as our chat id; null for one we cannot name.
export const peerChat = (peer, selfId = null) => {
  const text = (value) =>
    value === undefined || value === null ? null : String(value);
  switch (peer?.className) {
    case 'InputPeerUser':
    case 'InputPeerUserFromMessage':
      return text(peer.userId);
    case 'InputPeerChat':
      return peer.chatId === undefined ? null : `-${peer.chatId}`;
    case 'InputPeerChannel':
    case 'InputPeerChannelFromMessage':
      return peer.channelId === undefined ? null : `-100${peer.channelId}`;
    case 'InputPeerSelf':
      return text(selfId);
    default:
      return null;
  }
};

const titleOf = (title) =>
  typeof title === 'string' ? title : String(title?.text ?? '');

const chatsOf = (peers, selfId) =>
  (Array.isArray(peers) ? peers : [])
    .map((peer) => peerChat(peer, selfId))
    .filter(Boolean);

/** One of Telegram's DialogFilter* as the page's folder, or null. */
export const folderOf = (filter, selfId = null) => {
  if (filter?.className === 'DialogFilterDefault') {
    return { id: 0, all: true };
  }
  if (
    filter?.className !== 'DialogFilter' &&
    filter?.className !== 'DialogFilterChatlist'
  ) {
    return null;
  }
  const base = {
    id: Number(filter.id),
    title: titleOf(filter.title),
    emoticon: filter.emoticon ?? null,
    // The tag's colour, 0 to 6, when the folder has one (R-Y180).
    color: Number.isInteger(filter.color) ? filter.color : null,
    include: chatsOf(filter.includePeers, selfId),
    pinned: chatsOf(filter.pinnedPeers, selfId),
  };
  if (filter.className === 'DialogFilterChatlist') {
    // A shared folder: its chats by name only.
    return {
      ...base,
      chatlist: true,
      hasMyInvites: Boolean(filter.hasMyInvites),
      exclude: [],
    };
  }
  return {
    ...base,
    contacts: Boolean(filter.contacts),
    nonContacts: Boolean(filter.nonContacts),
    groups: Boolean(filter.groups),
    broadcasts: Boolean(filter.broadcasts),
    bots: Boolean(filter.bots),
    excludeMuted: Boolean(filter.excludeMuted),
    excludeRead: Boolean(filter.excludeRead),
    excludeArchived: Boolean(filter.excludeArchived),
    exclude: chatsOf(filter.excludePeers, selfId),
  };
};

const needsSelf = (filters) =>
  filters.some((f) =>
    [f?.includePeers, f?.excludePeers, f?.pinnedPeers].some((peers) =>
      (peers ?? []).some((p) => p?.className === 'InputPeerSelf')
    )
  );

/** `userClient()` is the connected user client, or null. */
export const createFolders = (
  env,
  { userClient },
  { now = () => Date.now() } = {}
) => {
  let kept = null; // { at, folders, tags }

  const folderList = async ({ fresh = false } = {}) => {
    if (!fresh && kept && now() - kept.at < KEEP_MS) {
      return { ok: true, folders: kept.folders, tags: kept.tags };
    }
    const client = await userClient();
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const answer = await client.invoke(new Api.messages.GetDialogFilters());
    // Newer layers answer messages.dialogFilters, older ones a vector.
    const filters = Array.isArray(answer) ? answer : (answer?.filters ?? []);
    const self = needsSelf(filters) ? await client.getMe() : null;
    const folders = filters
      .map((filter) => folderOf(filter, self?.id ?? null))
      .filter(Boolean);
    // Whether folder tags show on the chat list (R-Y180).
    const tags = Boolean(answer?.tagsEnabled);
    kept = { at: now(), folders, tags };
    return { ok: true, folders, tags };
  };

  return { folderList };
};
