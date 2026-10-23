/**
 * The Contacts window's live statuses and the read time of one's own
 * message in a private chat, as Telegram Desktop shows them (R-Y189;
 * learned, never copied):
 * - `contactStatuses()` — every contact's last seen at once
 *   (contacts.getStatuses) → `{ ok, statuses: [{ id, online, lastSeen? }] }`,
 *   `lastSeen` an ISO time or recently / week / month (as chat info has it);
 * - `messageReadTime({ chat, id })` — when the person read the user's own
 *   message (messages.getOutboxReadDate) → `{ ok, read: true, date }`, `date`
 *   in ms. Telegram's refusals that still mean "read" answer
 *   `{ ok, read: true, date: null, code }`: `your-privacy` (the user hides
 *   their own read times), `peer-privacy` (the person hides theirs),
 *   `too-old` (older than 7 days); MESSAGE_NOT_READ_YET answers
 *   `{ ok, read: false }`. Other errors become codes.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';
import { statusOf } from './telegram-chat-info.js';

const CODES = {
  PEER_ID_INVALID: 'no-access',
  MESSAGE_ID_INVALID: 'not-found',
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  FLOOD_WAIT: 'flood',
};

// The refusals that mean the message was read, with the page's code.
const READ_ANYWAY = {
  YOUR_PRIVACY_RESTRICTED: 'your-privacy',
  USER_PRIVACY_RESTRICTED: 'peer-privacy',
  MESSAGE_TOO_OLD: 'too-old',
};

const failure = failureOf(CODES);
const PRIVATE = /^\d{1,20}$/;
const textOf = (value) => String(value?.value ?? value);
const errorName = (e) => String(e?.errorMessage ?? e?.message ?? '');

/** Telegram's error as the read-time answer. */
export const readFailure = (error) => {
  const name = errorName(error);
  if (name.includes('MESSAGE_NOT_READ_YET')) {
    return { ok: true, read: false };
  }
  const key = Object.keys(READ_ANYWAY).find((k) => name.includes(k));
  return key
    ? { ok: true, read: true, date: null, code: READ_ANYWAY[key] }
    : failure(error);
};

const createStatuses = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const answer = await runIn(env, 'contacts:statuses', () =>
      c.client.invoke(new c.Api.contacts.GetStatuses())
    );
    return {
      ok: true,
      statuses: [...(Array.isArray(answer) ? answer : [])].map((one) => ({
        id: textOf(one.userId),
        ...statusOf(one.status),
      })),
    };
  });

const createReadTime =
  (env, userClient) =>
  async (body = {}) => {
    if (!PRIVATE.test(String(body.chat ?? '')) || !(Number(body.id) > 0)) {
      return { ok: false, error: 'bad-request', code: 'bad-request' };
    }
    return connected(env, userClient, readFailure, async (c) => {
      const answer = await runIn(env, `read-time:${body.chat}:${body.id}`, () =>
        env.connection.withPeer(c.client, body.chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.GetOutboxReadDate({
              peer,
              msgId: Number(body.id),
            })
          )
        )
      );
      return { ok: true, read: true, date: Number(answer?.date) * 1000 };
    });
  };

export const createContactsActions = (env, context) => ({
  contactStatuses: createStatuses(env, context.userClient),
  messageReadTime: createReadTime(env, context.userClient),
});
