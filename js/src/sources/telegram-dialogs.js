/**
 * What the chat list's menu does to a chat, as Telegram's apps do it
 * (R-Y97; Telegram Desktop's dialogs menu, learned, never copied):
 *
 * - `pin` / `unpin` — messages.toggleDialogPin; Telegram refuses more
 *   pinned chats than the account may have (`PINNED_DIALOGS_TOO_MUCH`).
 * - `mute` (for `for` seconds, or for good) / `unmute` —
 *   account.updateNotifySettings on the chat.
 * - `archive` / `unarchive` — folders.editPeerFolders, folder 1 or 0.
 * - `unread` — messages.markDialogUnread: the chat's unread mark;
 *   `unmark` takes it off (the chat opened, as Desktop does).
 * - `read` — every message read (to the newest Telegram listed), the
 *   unread mark taken off.
 *
 * Each change is then written as the update Telegram sends the other
 * devices about it, through the same live handler, so the list moves at
 * once and the next update about it changes nothing.
 */

const SOURCE = 'telegram';

export const DIALOG_ACTIONS = Object.freeze([
  'pin',
  'unpin',
  'mute',
  'unmute',
  'archive',
  'unarchive',
  'read',
  'unread',
  'unmark',
]);

// Telegram's "for good": the largest 32-bit time.
export const MUTE_FOREVER = 2_147_483_647;

/** The Peer (as updates name it) of a marked chat id. */
export const peerOfChat = (chat) => {
  const id = String(chat);
  if (id.startsWith('-100')) {
    return { className: 'PeerChannel', channelId: id.slice(4) };
  }
  if (id.startsWith('-')) {
    return { className: 'PeerChat', chatId: id.slice(1) };
  }
  return { className: 'PeerUser', userId: id };
};

/** Until when a mute `for` seconds from `nowMs` lasts (Unix seconds). */
export const muteUntilOf = (seconds, nowMs) => {
  const span = Number(seconds);
  return Number.isFinite(span) && span > 0 && span < 366 * 24 * 3600
    ? Math.floor(nowMs / 1000) + Math.floor(span)
    : MUTE_FOREVER;
};

// The update Telegram's other devices get about the change.
const updateOf = (action, chat, extra) => {
  const peer = peerOfChat(chat);
  switch (action) {
    case 'pin':
    case 'unpin':
      return {
        className: 'UpdateDialogPinned',
        peer: { className: 'DialogPeer', peer },
        pinned: action === 'pin',
        folderId: extra.folder,
      };
    case 'mute':
    case 'unmute':
      return {
        className: 'UpdateNotifySettings',
        peer: { className: 'NotifyPeer', peer },
        notifySettings: { muteUntil: extra.muteUntil },
      };
    case 'archive':
    case 'unarchive':
      return {
        className: 'UpdateFolderPeers',
        folderPeers: [{ peer, folderId: action === 'archive' ? 1 : 0 }],
      };
    default:
      return {
        className: 'UpdateDialogUnreadMark',
        peer: { className: 'DialogPeer', peer },
        unread: action === 'unread',
      };
  }
};

/**
 * `env` is the account's; `userClient()` the connected user client or
 * null; `apply(client, result)` takes Telegram's answer through the
 * live handler.
 */
export const createDialogActions = (env, { userClient, apply }) => {
  const now = env.now ?? (() => Date.now());
  const readOf = (chat) => env.store.get(`read:${SOURCE}:${chat}`);

  const readAll = async (client, Api, chat, peer) => {
    const read = (await readOf(chat)) ?? {};
    const top = Number(read.unreadTopId ?? 0);
    if (top > Number(read.inboxMaxId ?? 0)) {
      const result = await client.invoke(
        chat.startsWith('-100')
          ? new Api.channels.ReadHistory({ channel: peer, maxId: top })
          : new Api.messages.ReadHistory({ peer, maxId: top })
      );
      env.catchUp?.observeResult(result);
      await env.live.readInbox?.({ chat, maxId: top });
    }
    if (read.unreadMark) {
      await client.invoke(
        new Api.messages.MarkDialogUnread({ peer, unread: false })
      );
    }
  };

  const ask = async (client, Api, { action, chat, peer, muteUntil }) => {
    if (action === 'pin' || action === 'unpin') {
      await client.invoke(
        new Api.messages.ToggleDialogPin({ peer, pinned: action === 'pin' })
      );
    } else if (action === 'mute' || action === 'unmute') {
      await client.invoke(
        new Api.account.UpdateNotifySettings({
          peer,
          settings: new Api.InputPeerNotifySettings({ muteUntil }),
        })
      );
    } else if (action === 'archive' || action === 'unarchive') {
      const input =
        typeof peer === 'object' ? peer : await client.getInputEntity(peer);
      return client.invoke(
        new Api.folders.EditPeerFolders({
          folderPeers: [
            new Api.InputFolderPeer({
              peer: input,
              folderId: action === 'archive' ? 1 : 0,
            }),
          ],
        })
      );
    } else if (action === 'unread' || action === 'unmark') {
      await client.invoke(
        new Api.messages.MarkDialogUnread({ peer, unread: action === 'unread' })
      );
    } else {
      await readAll(client, Api, chat, peer);
    }
    return null;
  };

  /** `{ chat, action, for? }` → `{ ok }`, or `{ ok: false, supported }`. */
  const dialogAction = async ({ chat, action, for: seconds } = {}) => {
    const client =
      chat && DIALOG_ACTIONS.includes(action) ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const muteUntil =
      action === 'mute'
        ? muteUntilOf(seconds, now())
        : action === 'unmute'
          ? 0
          : undefined;
    const answer = await env.connection.withPeer(client, target, (peer) =>
      ask(client, Api, { action, chat: target, peer, muteUntil })
    );
    if (answer) {
      await apply(client, answer);
    }
    const folder = Number((await readOf(target))?.folder ?? 0) === 1 ? 1 : 0;
    await env.live.handle(
      client,
      updateOf(action, target, { folder, muteUntil })
    );
    return { ok: true, chat: target, action };
  };

  return { dialogAction };
};
