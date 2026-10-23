/**
 * The channels the user left, as Telegram Desktop shows them when the
 * channel limit is hit (R-Y200; learned, never copied):
 * - `leftChannels({ offset? })` — one page (channels.getLeftChannels, by
 *   how many were already read) → `{ ok, channels: [{ chat (-100…), title,
 *   username, members, broadcast }], next }`; `next` is the offset of the
 *   following page, or null at the end. Read only: nothing is joined here;
 *   the page's preview does that on the explicit Join.
 * Telegram's errors become codes the page shows as text.
 */

import { similarOf } from './telegram-similar-channels.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const failure = failureOf({ FLOOD_WAIT: 'flood' });
const OFFSET = /^\d{1,6}$/;
// Without a total from Telegram, a page this full may have another behind.
const FULL_PAGE = 100;

/** The offset after a page, or null at the end. */
export const nextOffset = (answer, offset, count) => {
  const total = Number(answer?.count);
  // Only a slice carries a total.
  if (answer?.count !== undefined && Number.isFinite(total)) {
    return offset + count < total ? offset + count : null;
  }
  return count >= FULL_PAGE ? offset + count : null;
};

const createLeft =
  (env, userClient) =>
  async (body = {}) => {
    const offset = body.offset === undefined ? 0 : body.offset;
    if (!OFFSET.test(String(offset))) {
      return { ok: false, error: 'bad-request', code: 'bad-request' };
    }
    const from = Number(offset);
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `left-channels:${from}`, () =>
        c.client.invoke(new c.Api.channels.GetLeftChannels({ offset: from }))
      );
      const channels = (answer?.chats ?? []).map(similarOf).filter(Boolean);
      return {
        ok: true,
        channels,
        next: nextOffset(answer, from, channels.length),
      };
    });
  };

export const createLeftChannels = (env, context) => ({
  leftChannels: createLeft(env, context.userClient),
});
