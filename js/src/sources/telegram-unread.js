/**
 * Unread mentions (@) and reactions (♥) of a chat, as Telegram's apps
 * lead to them (R-Y55): the counts come with the chat list
 * (`unreadMentionsCount`, `unreadReactionsCount`, kept on the chat's
 * `read:` link); the buttons above "down" ask which messages they are
 * and go to the oldest, one per click.
 *
 *   marks({ chat, kind })        → { ids } oldest first, the messages
 *                                  written to the store so the chat can
 *                                  show them (messages.getUnreadMentions /
 *                                  getUnreadReactions);
 *   readMarks({ chat, kind, ids, last })
 *                                → the shown ones are read (their
 *                                  contents: messages.readMessageContents),
 *                                  and on the last one the chat's whole
 *                                  list (readMentions / readReactions).
 *
 * Asked through the account's queue at `view` priority: the user is
 * waiting. Only counts are logged.
 */

import { readLinkId } from './telegram-account-live.js';

export const MARK_KINDS = Object.freeze(['mentions', 'reactions']);
const MARK_PAGE = 100;
const FIELD = { mentions: 'unreadMentions', reactions: 'unreadReactions' };

const isChannel = (chat) => String(chat).startsWith('-100');

const cleanIds = (ids) =>
  [...new Set((ids ?? []).map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MARK_PAGE);
const liveMessages = (result) =>
  (result?.messages ?? []).filter(
    (message) =>
      message &&
      message.id !== undefined &&
      message.className !== 'MessageEmpty'
  );

/**
 * `env`: the account's (store, connection, queue, importer, catchUp,
 * log); `userClient()` the connected user client or null; `write(chat,
 * messages)` stores GramJS messages as links.
 */
export const createUnreadMarks = (env, { userClient, write }) => {
  const { store } = env;

  // The chat's count, lowered by what was read (the next chat list
  // brings Telegram's own count again).
  const lower = async (chat, kind, by, last) => {
    const link = await store.get(readLinkId(chat));
    if (!link) {
      return;
    }
    const field = FIELD[kind];
    const left = last ? 0 : Math.max(0, Number(link[field] ?? 0) - by);
    if (left !== Number(link[field] ?? 0)) {
      await store.put({ ...link, [field]: left });
    }
  };

  const marks = async ({ chat, kind } = {}) => {
    if (!chat || !FIELD[kind]) {
      return { ok: false, supported: false, ids: [] };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const Request =
      kind === 'mentions'
        ? Api.messages.GetUnreadMentions
        : Api.messages.GetUnreadReactions;
    const started = Date.now();
    const result = await env.queue.run(
      `marks:${kind}:${target}`,
      'view',
      async () => {
        const client = await userClient();
        if (!client) {
          return null;
        }
        return env.connection.withPeer(client, target, (peer) =>
          client.invoke(
            new Request({
              peer,
              offsetId: 0,
              addOffset: 0,
              limit: MARK_PAGE,
              maxId: 0,
              minId: 0,
            })
          )
        );
      }
    );
    if (!result) {
      return { ok: false, supported: false, ids: [] };
    }
    const messages = liveMessages(result);
    await write(target, messages);
    const ids = messages.map((m) => Number(m.id)).sort((a, b) => a - b);
    if (!ids.length && Number(result?.count ?? 0) === 0) {
      await lower(target, kind, 0, true);
    }
    env.log?.({
      event: 'telegram_unread_marks',
      kind,
      ids: ids.length,
      count: Number(result?.count ?? ids.length),
      duration_ms: Date.now() - started,
    });
    return { ok: true, ids, count: Number(result?.count ?? ids.length) };
  };

  const readContents = async (client, Api, target, ids) => {
    if (isChannel(target)) {
      await env.connection.withPeer(client, target, (channel) =>
        client.invoke(
          new Api.channels.ReadMessageContents({ channel, id: ids })
        )
      );
      return;
    }
    const affected = await client.invoke(
      new Api.messages.ReadMessageContents({ id: ids })
    );
    env.catchUp?.observeResult({
      className: 'UpdateReadMessagesContents',
      messages: ids,
      pts: affected?.pts,
      ptsCount: affected?.ptsCount,
    });
  };

  const readAll = (client, Api, target, kind) =>
    env.connection.withPeer(client, target, (peer) =>
      client.invoke(
        kind === 'mentions'
          ? new Api.messages.ReadMentions({ peer })
          : new Api.messages.ReadReactions({ peer })
      )
    );

  const readMarks = async ({ chat, kind, ids, last = false } = {}) => {
    const wanted = cleanIds(ids);
    if (!chat || !FIELD[kind] || (!wanted.length && !last)) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const read = await env.queue.run(
      `marks-read:${kind}:${target}`,
      'view',
      async () => {
        const client = await userClient();
        if (!client) {
          return false;
        }
        if (wanted.length > 0) {
          await readContents(client, Api, target, wanted);
        }
        if (last) {
          await readAll(client, Api, target, kind);
        }
        return true;
      }
    );
    if (!read) {
      return { ok: false, supported: false };
    }
    for (const id of wanted) {
      const message = await store.get(`msg:telegram:${target}:${id}`);
      if (kind === 'mentions' && message?.raw?.mediaUnread) {
        await store.put({
          ...message,
          raw: { ...message.raw, mediaUnread: false },
        });
      }
    }
    await lower(target, kind, wanted.length, last);
    return { ok: true, read: wanted.length, last: Boolean(last) };
  };

  return { marks, readMarks };
};
