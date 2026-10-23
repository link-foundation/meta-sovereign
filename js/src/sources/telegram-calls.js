/**
 * The recent calls list, as Telegram Desktop's main menu → Calls shows it
 * (R-Y163; learned, never copied). The app places no calls; this is the
 * history only:
 * - `callsList({ missed?, offsetId? })` — the account's phone-call service
 *   messages across every chat (messages.search with no peer, no query
 *   and InputMessagesFilterPhoneCalls, `missed` for the Missed tab), newest
 *   first, a page at a time → `{ ok, calls, next }`; each call is `{ chat
 *   (the other person's user id), name, id, date (ms), out, video, missed
 *   (incoming and ended missed or busy), duration (seconds) }`; `next` is
 *   the id to ask again with, or null at the end. Group calls are not in
 *   this list.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const CODES = {
  FLOOD_WAIT: 'flood',
  AUTH_KEY_UNREGISTERED: 'no-access',
};

const failure = failureOf(CODES);

export const CALLS_PAGE = 50;
const OFFSET = /^\d{1,12}$/;

/** Whether a request body is one the list answers. */
export const validCallsRequest = (body = {}) =>
  (body.missed === undefined || typeof body.missed === 'boolean') &&
  (body.offsetId === undefined ||
    (typeof body.offsetId === 'number' || typeof body.offsetId === 'string'
      ? OFFSET.test(String(body.offsetId))
      : false));

const idOf = (peer) => String(peer?.userId ?? '');

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

const missedOf = (message) => {
  const reason = message.action?.reason?.className ?? '';
  return (
    !message.out &&
    (reason === 'PhoneCallDiscardReasonMissed' ||
      reason === 'PhoneCallDiscardReasonBusy')
  );
};

/** One call for the page, from a message and the users of the answer. */
export const callOf = (message, users) => {
  const chat = idOf(message.peerId);
  const user = users.get(chat);
  return {
    chat,
    name: nameOf(user),
    id: Number(message.id),
    date: Number(message.date) * 1000,
    out: Boolean(message.out),
    video: Boolean(message.action?.video),
    missed: missedOf(message),
    duration: Number(message.action?.duration ?? 0),
  };
};

export const createCalls = (env, { userClient }) => {
  const callsList = async (body = {}) => {
    if (!validCallsRequest(body)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    const offsetId = Number(body.offsetId ?? 0);
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(
        env,
        `calls:${body.missed ? 1 : 0}:${offsetId}`,
        () =>
          c.client.invoke(
            new c.Api.messages.Search({
              peer: new c.Api.InputPeerEmpty(),
              q: '',
              filter: new c.Api.InputMessagesFilterPhoneCalls({
                ...(body.missed ? { missed: true } : {}),
              }),
              minDate: 0,
              maxDate: 0,
              offsetId,
              addOffset: 0,
              limit: CALLS_PAGE,
              maxId: 0,
              minId: 0,
              hash: c.zero,
            })
          )
      );
      const users = new Map(
        (answer?.users ?? []).map((user) => [String(user.id), user])
      );
      const messages = (answer?.messages ?? []).filter(
        (m) => m?.action?.className === 'MessageActionPhoneCall'
      );
      const calls = messages.map((m) => callOf(m, users));
      const raw = answer?.messages ?? [];
      return {
        ok: true,
        calls,
        next:
          raw.length >= CALLS_PAGE && raw.length > 0
            ? Number(raw.at(-1).id)
            : null,
      };
    });
  };
  return { callsList };
};
