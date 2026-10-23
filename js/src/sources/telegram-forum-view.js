/**
 * A forum group seen as its whole message list or as its topics, as
 * Telegram Desktop's ⋯ menu has it (R-Y171; learned, never copied):
 * - `forumView({ chat, asMessages })` — channels.toggleViewForumAsMessages
 *   with `enabled` = asMessages → `{ ok, asMessages }`. Called only on the
 *   user's click; the flag Telegram keeps comes back with the chat info
 *   (channelFull view_forum_as_messages).
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHANNEL_FORUM_MISSING: 'not-forum',
  CHANNEL_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);

export const createForumView = (env, { userClient }) => ({
  forumView: async ({ chat, asMessages } = {}) =>
    !/^-100\d{1,15}$/.test(String(chat ?? '')) ||
    typeof asMessages !== 'boolean'
      ? { ok: false, error: 'bad request', code: 'bad-request' }
      : connected(env, userClient, failure, async (c) => {
          await runIn(env, `forum-view:${chat}`, () =>
            env.connection.withPeer(c.client, String(chat), (peer) =>
              c.client.invoke(
                new c.Api.channels.ToggleViewForumAsMessages({
                  channel: peer,
                  enabled: asMessages,
                })
              )
            )
          );
          return { ok: true, asMessages };
        }),
});
