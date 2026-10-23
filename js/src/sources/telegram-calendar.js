/**
 * Which days of a chat hold messages, and how many, for the jump-to-date
 * calendar (R-Y207; learned, never copied): messages.getSearchResultsCalendar
 * answers the days (newest first) before `before`, so a month further back
 * is another request with an earlier `before` — offset paging.
 *
 * `calendar({ chat, filter?, before? })` → `{ ok, days: [{ date, count,
 * minId, maxId }], first, total, inexact }`: `date` is unix seconds, `first`
 * the time (unix seconds) of the chat's first matching message, `before` a
 * unix time (0: now). `filter` is one of FILTERS (default `empty`: every
 * message; `photoVideo` for the shared media tab).
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const failure = failureOf({ FLOOD_WAIT: 'flood' });

export const FILTERS = Object.freeze([
  'empty',
  'photos',
  'video',
  'photoVideo',
  'document',
  'url',
  'music',
  'voice',
]);

// The request's filter object of a name.
const filterOf = (Api, name) => {
  switch (name) {
    case 'photos':
      return new Api.InputMessagesFilterPhotos();
    case 'video':
      return new Api.InputMessagesFilterVideo();
    case 'photoVideo':
      return new Api.InputMessagesFilterPhotoVideo();
    case 'document':
      return new Api.InputMessagesFilterDocument();
    case 'url':
      return new Api.InputMessagesFilterUrl();
    case 'music':
      return new Api.InputMessagesFilterMusic();
    case 'voice':
      return new Api.InputMessagesFilterVoice();
    default:
      return new Api.InputMessagesFilterEmpty();
  }
};

/** The days of an answer, shaped for the page. */
export const daysOf = (answer) =>
  (answer?.periods ?? []).map((p) => ({
    date: Number(p.date),
    count: Number(p.count),
    minId: Number(p.minMsgId),
    maxId: Number(p.maxMsgId),
  }));

export const createCalendar = (env, { userClient }) => ({
  calendar: async ({ chat, filter = 'empty', before = 0 } = {}) => {
    if (!FILTERS.includes(filter) || !(Number(before) >= 0) || !chat) {
      return { ok: false, error: 'bad-request', code: 'bad-request' };
    }
    return connected(env, userClient, failure, async (c) => {
      const key = `calendar:${chat}:${filter}:${before}`;
      const answer = await runIn(env, key, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.GetSearchResultsCalendar({
              peer,
              filter: filterOf(c.Api, filter),
              offsetId: 0,
              offsetDate: Number(before),
            })
          )
        )
      );
      return {
        ok: true,
        days: daysOf(answer),
        first: answer?.minDate ? Number(answer.minDate) : null,
        total: Number(answer?.count) || 0,
        inexact: Boolean(answer?.inexact),
      };
    });
  },
});
