/**
 * A channel post's comments, and a group message's thread of replies,
 * as Telegram's apps open them (R-Y126; learned, never copied):
 *
 * - `comments({ chat, post, before, limit })` — `{ ok, group, root,
 *   unread, messages, complete }`: the discussion (messages.
 *   getDiscussionMessage: the group the comments are in and the post's
 *   copy there, `root`), then its replies by page, oldest first
 *   (messages.getReplies), the page before message `before` when given.
 *   The comments are given to the page, not stored: the discussion group
 *   is no chat of the user's list unless they joined it.
 * - `sendComment({ chat, post, text, replyTo, clientId })` — a comment
 *   sent to the discussion group, answering the post's copy (or the
 *   comment `replyTo`, with the copy as its thread's top).
 */

import { sendError, sendText } from './telegram-send.js';

const KEEP_MS = 10 * 60_000;
const ID = /^-?\d{1,20}$/;

const text = (value) => String(value?.value ?? value ?? '');

const usable = (m) => m && m.id !== undefined && m.className !== 'MessageEmpty';

// The discussion group in Telegram's answer: the chat the post's copy
// is in; its title and kind as the chat list names them.
const groupOf = (answer, root) => {
  const id = text(root.peerId?.channelId ?? root.peerId?.chatId);
  const entity = (answer.chats ?? []).find((c) => text(c.id) === id) ?? null;
  const chat = root.peerId?.channelId ? `-100${id}` : `-${id}`;
  return {
    chat,
    entity,
    title: String(entity?.title ?? ''),
  };
};

/**
 * `env` is the account's; `userClient()` the user client or null;
 * `tools` its `toLinks`.
 */
export const createComments = (
  env,
  { userClient, tools },
  { now = () => Date.now() } = {}
) => {
  const kept = new Map(); // `${chat}:${post}` -> { at, thread }

  // The post's discussion: its group and the post's copy there.
  const discussion = async (client, chat, post) => {
    const key = `${chat}:${post}`;
    const entry = kept.get(key);
    if (entry && now() - entry.at < KEEP_MS) {
      return entry.thread;
    }
    const { Api } = await env.importer();
    const answer = await env.queue.run(`discussion:${key}`, 'view', () =>
      env.connection.withPeer(client, chat, (peer) =>
        client.invoke(
          new Api.messages.GetDiscussionMessage({ peer, msgId: post })
        )
      )
    );
    // The thread's first message is the oldest one given.
    const root = [...(answer?.messages ?? [])]
      .filter(usable)
      .sort((a, b) => Number(a.id) - Number(b.id))[0];
    if (!root) {
      return null;
    }
    const group = groupOf(answer, root);
    // The group's peer kept, so its files and sends find it.
    if (group.entity) {
      await Promise.resolve(
        env.peers?.remember?.(group.chat, group.entity, {
          title: group.title,
          isChannel: Boolean(root.peerId?.channelId),
          isGroup: true,
        })
      ).catch(() => {});
    }
    const thread = {
      group: { chat: group.chat, title: group.title },
      root: Number(root.id),
      unread: Number(answer.unreadCount) || 0,
    };
    kept.set(key, { at: now(), thread });
    return thread;
  };

  const comments = async ({ chat, post, before = null, limit = 50 } = {}) => {
    const id = Number(post);
    const client =
      ID.test(String(chat ?? '')) && Number.isInteger(id) && id > 0
        ? await userClient()
        : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const target = String(chat);
    const thread = await discussion(client, target, id);
    if (!thread) {
      return { ok: false, error: 'no comments', code: 'no-comments' };
    }
    const offset = Number(before);
    const page = await env.queue.run(
      `comments:${thread.group.chat}:${thread.root}:${offset || 0}`,
      'view',
      () =>
        env.connection.withPeer(client, thread.group.chat, (peer) =>
          client.getMessages(peer, {
            replyTo: thread.root,
            limit,
            ...(Number.isInteger(offset) && offset > 0
              ? { offsetId: offset }
              : {}),
          })
        )
    );
    const messages = [...(page ?? [])]
      .filter(usable)
      .sort((a, b) => Number(a.id) - Number(b.id));
    const links = tools.toLinks(
      { id: thread.group.chat, title: thread.group.title, isGroup: true },
      messages
    );
    return {
      ok: true,
      ...thread,
      messages: links,
      complete: messages.length < limit,
    };
  };

  const sendComment = async ({
    chat,
    post,
    text: body,
    replyTo = null,
    clientId,
  } = {}) => {
    const client = await userClient();
    if (!client) {
      return { ok: false, supported: false };
    }
    const thread = await discussion(client, String(chat), Number(post));
    if (!thread) {
      return { ok: false, error: 'no comments', code: 'no-comments' };
    }
    const { Api, helpers } = await env.importer();
    try {
      await env.connection.withPeer(client, thread.group.chat, (peer) =>
        sendText({
          client,
          Api,
          helpers,
          peer,
          text: body,
          clientId,
          // A comment answers the post's copy; an answer to a comment
          // names the copy as its thread's top.
          replyTo: replyTo ?? thread.root,
          topic: replyTo ? thread.root : null,
        })
      );
    } catch (error) {
      throw sendError(error);
    }
    return { ok: true, chat: thread.group.chat };
  };

  return { comments, sendComment };
};
