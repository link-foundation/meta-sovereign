/**
 * Live counters under channel posts, as Telegram Desktop keeps them
 * (R-Y182; learned, never copied): a post that is on screen is marked
 * viewed (the count goes up once), and the counters of the posts shown
 * are asked again from time to time.
 * - `messageViews({ chat, ids, increment })` — messages.getMessagesViews
 *   for up to 100 posts → `{ ok, items: [{ id, views, forwards, replies }] }`
 *   (a counter Telegram does not send is left out of the item). With
 *   `increment: true` the posts count as seen by the user; the page does
 *   that once per post and session.
 * Errors become codes.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const failure = failureOf({
  FLOOD_WAIT: 'flood',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  MSG_ID_INVALID: 'not-found',
});
const CHAT = /^-?\d{1,20}$/;
export const MAX_VIEW_IDS = 100;

/** Whether a request body is one the fetch answers. */
export const validViewsRequest = ({ chat, ids, increment } = {}) =>
  CHAT.test(String(chat ?? '')) &&
  Array.isArray(ids) &&
  ids.length > 0 &&
  ids.length <= MAX_VIEW_IDS &&
  ids.every((id) => Number.isInteger(id) && id > 0) &&
  new Set(ids).size === ids.length &&
  (increment === undefined || typeof increment === 'boolean');

const count = (value) =>
  Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

/** One post's counters as the page takes them (`id` is the post's). */
export const viewsOf = (id, raw) => {
  const item = { id };
  const views = count(raw?.views);
  const forwards = count(raw?.forwards);
  const replies = count(raw?.replies?.replies);
  if (views !== null) {
    item.views = views;
  }
  if (forwards !== null) {
    item.forwards = forwards;
  }
  if (replies !== null) {
    item.replies = replies;
  }
  return item;
};

export const createViews = (env, { userClient }) => {
  const messageViews = async (body = {}) => {
    if (!validViewsRequest(body)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    const { chat, ids, increment = false } = body;
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(
        env,
        `views:${chat}:${increment ? 'seen' : 'peek'}:${ids.join(',')}`,
        () =>
          env.connection.withPeer(c.client, chat, (peer) =>
            c.client.invoke(
              new c.Api.messages.GetMessagesViews({ peer, id: ids, increment })
            )
          )
      );
      // Telegram answers in the order the ids were given.
      const list = answer?.views ?? [];
      return {
        ok: true,
        items: ids.map((id, i) => viewsOf(id, list[i])),
      };
    });
  };
  return { messageViews };
};
