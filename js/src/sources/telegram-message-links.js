/**
 * Links to messages, as Telegram Desktop has them (R-Y154; learned, never
 * copied):
 *
 * - `messageLink({ chat, id, thread })` — "Copy link" of a message in a
 *   supergroup or channel (channels.exportMessageLink); `thread` asks for
 *   the link of a message inside a topic or a comment thread →
 *   `{ ok, link }`;
 * - `resolveLink({ username })` — the chat a t.me/username/123 link names
 *   (contacts.resolveUsername) → `{ ok, chat, name, username, kind }` with
 *   `chat` the marked id (-100…); a username of a person or a bot is code
 *   `not-chat`, an unknown one `no-chat`.
 * Telegram's errors become codes the page reads.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';

export const CHANNEL_CHAT = /^-100\d{1,15}$/;
export const LINK_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
export const MAX_MESSAGE_ID = 2_147_483_647;

const CODES = {
  USERNAME_NOT_OCCUPIED: 'no-chat',
  USERNAME_INVALID: 'no-chat',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  MESSAGE_ID_INVALID: 'no-message',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };

/** Whether `id` is a message id Telegram numbers (a positive 32-bit). */
export const validMessageId = (id) =>
  Number.isInteger(id) && id > 0 && id <= MAX_MESSAGE_ID;

const text = (value) => String(value?.value ?? value ?? '');

const hasName = (chat, lower) =>
  String(chat.username ?? '').toLowerCase() === lower ||
  (chat.usernames ?? []).some(
    (u) => String(u.username ?? '').toLowerCase() === lower
  );

// The chat a resolved username stands for, from the chats of the answer.
const chatOf = (answer, username) => {
  const lower = username.toLowerCase();
  const found = (answer?.chats ?? []).find(
    (c) => c?.className === 'Channel' && hasName(c, lower)
  );
  return found
    ? {
        ok: true,
        chat: `-100${text(found.id)}`,
        name: found.title ?? '',
        username,
        kind: found.broadcast ? 'channel' : 'group',
      }
    : { ok: false, error: 'not a chat', code: 'not-chat' };
};

export const createMessageLinks = (env, { userClient }) => ({
  messageLink: async ({ chat, id, thread = false } = {}) => {
    if (
      !CHANNEL_CHAT.test(String(chat ?? '')) ||
      !validMessageId(id) ||
      typeof thread !== 'boolean'
    ) {
      return BAD;
    }
    return connected(env, userClient, failure, (c) =>
      runIn(env, `message-link:${chat}`, () =>
        env.connection.withPeer(c.client, String(chat), async (peer) => {
          const answer = await c.client.invoke(
            new c.Api.channels.ExportMessageLink({
              channel: peer,
              id,
              ...(thread ? { thread: true } : {}),
            })
          );
          return answer?.link
            ? { ok: true, link: String(answer.link) }
            : { ok: false, error: 'no link', code: 'failed' };
        })
      )
    );
  },
  resolveLink: async ({ username } = {}) => {
    const name = String(username ?? '');
    if (!LINK_USERNAME.test(name)) {
      return BAD;
    }
    return connected(env, userClient, failure, (c) =>
      runIn(env, `resolve-link:${name.toLowerCase()}`, async () =>
        chatOf(
          await c.client.invoke(
            new c.Api.contacts.ResolveUsername({ username: name })
          ),
          name
        )
      )
    );
  },
});
