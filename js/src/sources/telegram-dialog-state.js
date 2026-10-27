import { readLink } from './telegram-account-live.js';

const refreshForum = async (env, chat, read) => {
  if (!read?.forum) {
    return;
  }
  await env.actions?.forumTopics?.({ chat: String(chat), fresh: true });
};

/** Refresh one peer's counters without sending any read acknowledgement. */
export const createDialogState =
  (env, userChat) =>
  async ({ chat } = {}) => {
    if (!/^-?\d+$/.test(String(chat ?? ''))) {
      return { ok: false, code: 'bad-request' };
    }
    const target = await userChat(chat);
    if (!target) {
      return { ok: false, supported: false };
    }
    const { client, Api } = target;
    const id = `read:telegram:${chat}`;
    const before = await env.store.get(id);
    const result = await env.queue.run(`dialog-state:${chat}`, 'view', () =>
      env.connection.withPeer(client, String(chat), (peer) =>
        client.invoke(
          new Api.messages.GetPeerDialogs({
            peers: [new Api.InputDialogPeer({ peer })],
          })
        )
      )
    );
    const dialog = result?.dialogs?.[0];
    if (!dialog || !Number.isFinite(dialog.unreadCount)) {
      return { ok: false, code: 'dialog-unavailable' };
    }
    await refreshForum(env, chat, before);
    const latest = await env.store.get(id);
    // An update that arrived while Telegram answered is newer than this request.
    if (JSON.stringify(latest) !== JSON.stringify(before)) {
      return { ok: true, read: latest, changed: true };
    }
    const read = {
      ...before,
      ...readLink(String(chat), {
        inboxMaxId: dialog.readInboxMaxId,
        outboxMaxId: dialog.readOutboxMaxId,
        unreadCount: dialog.unreadCount,
        unreadTopId: dialog.topMessage,
        unreadMark: Boolean(dialog.unreadMark),
        unreadMentions: dialog.unreadMentionsCount,
        unreadReactions: dialog.unreadReactionsCount,
        muteUntil: Number(dialog.notifySettings?.muteUntil ?? 0),
        folder: Number(dialog.folderId ?? 0),
      }),
      checkedAt: new Date(env.now()).toISOString(),
    };
    await env.store.put(read);
    return { ok: true, read };
  };
