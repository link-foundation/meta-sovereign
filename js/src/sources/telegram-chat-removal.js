/**
 * Clearing, deleting and leaving a chat, as Telegram's apps do it
 * (R-Y100; Telegram Desktop's "Clear history", "Delete chat" and
 * "Leave", learned, never copied):
 *
 * - `clear` — every message of the chat deleted, the chat kept:
 *   messages.deleteHistory with just_clear (a person or a basic group;
 *   `revoke` deletes them for the other side too), channels.deleteHistory
 *   for a supergroup (for the user only).
 * - `delete` — a personal chat's every message deleted and the chat
 *   gone from the list (`revoke`: for the other person too).
 * - `leave` — a basic group: the user leaves it (messages.deleteChatUser)
 *   and its history goes; a supergroup or channel:
 *   channels.leaveChannel.
 * - `destroy` — the owner deletes a group or channel for everyone
 *   (channels.deleteChannel, messages.deleteChat; R-Y216), no undo; the
 *   chat leaves the list like a left one.
 *
 * Telegram deletes history a part at a time (`offset` says there is
 * more); it is asked again until done. The chat's stored messages are
 * then marked deleted, so the messages leave the screens at once; the
 * chat goes with them after `delete` and `leave`, but a cleared chat
 * stays in the list, empty, as Telegram keeps it: its read link holds
 * when it was cleared and its name and type, as the list is built from
 * messages. The update counters move with Telegram's answers.
 */

import { markDeleted as tombstone } from '../storage/soft-delete.js';

const SOURCE = 'telegram';
export const REMOVAL_ACTIONS = Object.freeze([
  'clear',
  'delete',
  'leave',
  'destroy',
]);
const MAX_ROUNDS = 100;

const kindOf = (chat) => {
  const id = String(chat);
  if (id.startsWith('-100')) {
    return 'channel';
  }
  return id.startsWith('-') ? 'group' : 'personal';
};

/** Whether `action` is one Telegram has for chat `chat`. */
export const removalAllowed = (chat, action) => {
  const kind = kindOf(chat);
  if (action === 'delete') {
    return kind === 'personal';
  }
  if (action === 'leave' || action === 'destroy') {
    return kind !== 'personal';
  }
  return action === 'clear';
};

/**
 * `env` is the account's; `userClient()` the connected user client or
 * null; `apply(client, result)` takes Telegram's answer through the
 * live handler.
 */
export const createChatRemoval = (env, { userClient, apply }) => {
  // messages.deleteHistory until Telegram says nothing is left.
  const deleteHistory = async (client, Api, peer, { justClear, revoke }) => {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const affected = await client.invoke(
        new Api.messages.DeleteHistory({
          peer,
          maxId: 0,
          justClear,
          revoke,
        })
      );
      env.catchUp?.observeResult(affected);
      if (!(Number(affected?.offset) > 0)) {
        return;
      }
    }
  };

  // The newest message the chat is known to have.
  const newestId = async (chat) => {
    const read = (await env.store.get(`read:${SOURCE}:${chat}`)) ?? {};
    const prefix = `msg:${SOURCE}:${chat}:`;
    const stored = await env.store.query((link) => link.id.startsWith(prefix));
    return Math.max(
      Number(read.unreadTopId ?? 0) || 0,
      ...stored.map((link) => Number(link.id.slice(prefix.length)) || 0)
    );
  };

  const askChannel = async (client, Api, peer, { action, chat }) => {
    if (action === 'destroy') {
      return client.invoke(new Api.channels.DeleteChannel({ channel: peer }));
    }
    if (action === 'leave') {
      return client.invoke(new Api.channels.LeaveChannel({ channel: peer }));
    }
    return client.invoke(
      new Api.channels.DeleteHistory({
        channel: peer,
        maxId: await newestId(chat),
        forEveryone: false,
      })
    );
  };

  const ask = async (client, Api, peer, { action, chat, revoke }) => {
    const kind = kindOf(chat);
    if (kind === 'channel') {
      return askChannel(client, Api, peer, { action, chat });
    }
    if (kind === 'group' && action === 'destroy') {
      const { helpers } = await env.importer();
      return client.invoke(
        new Api.messages.DeleteChat({
          chatId: helpers.returnBigInt(String(chat).slice(1)),
        })
      );
    }
    if (kind === 'group' && action === 'leave') {
      const { helpers } = await env.importer();
      const left = await client.invoke(
        new Api.messages.DeleteChatUser({
          chatId: helpers.returnBigInt(String(chat).slice(1)),
          userId: new Api.InputUserSelf(),
          revokeHistory: false,
        })
      );
      await apply(client, left);
    }
    await deleteHistory(client, Api, peer, {
      justClear: action === 'clear',
      revoke: kind === 'personal' && Boolean(revoke),
    });
    return null;
  };

  // The chat's stored messages, marked deleted: off the screens at once.
  const forget = async (chat) => {
    const prefix = `msg:${SOURCE}:${chat}:`;
    const stored = await env.store.query(
      (link) => link.id.startsWith(prefix) && !link.deleted
    );
    for (const link of stored) {
      await env.store.put(
        tombstone(link, { by: 'user', reason: 'chat-removed' })
      );
    }
    return stored;
  };

  // A cleared chat is kept in the list by its read link; delete and
  // leave take that mark away, and the chat with it.
  const markCleared = async (chat, action, stored) => {
    const id = `read:${SOURCE}:${chat}`;
    const before = (await env.store.get(id)) ?? {
      id,
      tokens: ['read', SOURCE, chat],
      kind: 'read',
      source: SOURCE,
      chat,
    };
    const link = { ...before };
    for (const field of ['clearedAt', 'chatName', 'chatType']) {
      delete link[field];
    }
    if (action === 'clear') {
      const known = stored.find((m) => m.chatName || m.chatType) ?? before;
      Object.assign(link, {
        clearedAt: new Date().toISOString(),
        chatName: known.chatName,
        chatType: known.chatType,
      });
    }
    await env.store.put(link);
  };

  /** `{ chat, action, revoke? }` → `{ ok, deleted }`. */
  const removeChat = async ({ chat, action, revoke = false } = {}) => {
    const client =
      chat && REMOVAL_ACTIONS.includes(action) && removalAllowed(chat, action)
        ? await userClient()
        : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const answer = await env.connection.withPeer(client, target, (peer) =>
      ask(client, Api, peer, { action, chat: target, revoke })
    );
    if (answer && typeof answer === 'object') {
      await apply(client, answer);
    }
    const stored = await forget(target);
    await markCleared(target, action, stored);
    return { ok: true, chat: target, action, deleted: stored.length };
  };

  return { removeChat };
};
