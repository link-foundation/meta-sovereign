/**
 * Fact checks under messages, as Telegram Desktop shows them (R-Y166;
 * learned, never copied): a message whose fact check Telegram marks
 * `need_check` carries only its hash; the text is asked for.
 * - `factChecks({ chat, ids })` — messages.getFactCheck for the messages
 *   (up to 100) → `{ ok, items: [{ id, country, text, entities }] }`, the
 *   entities by className as a stored message's; a message with none is
 *   left out. Answers are kept in memory by chat and id.
 * Errors become codes.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const failure = failureOf({
  FLOOD_WAIT: 'flood',
  MSG_ID_INVALID: 'not-found',
});
const CHAT = /^-?\d{1,20}$/;
const MAX_IDS = 100;
const MAX_KEPT = 1000;

const plainEntity = (one) => ({
  className: one.className,
  offset: Number(one.offset),
  length: Number(one.length),
  ...(one.url ? { url: String(one.url) } : {}),
  ...(one.language ? { language: String(one.language) } : {}),
});

/** One fact check as the page draws it, or null when it says nothing. */
export const factOf = (id, raw) =>
  raw?.text?.text
    ? {
        id,
        country: String(raw.country ?? ''),
        text: String(raw.text.text),
        entities: (raw.text.entities ?? []).map(plainEntity),
      }
    : null;

/** Whether a request body is one the fetch answers. */
export const validFactRequest = ({ chat, ids } = {}) =>
  CHAT.test(String(chat ?? '')) &&
  Array.isArray(ids) &&
  ids.length > 0 &&
  ids.length <= MAX_IDS &&
  ids.every((id) => Number.isInteger(id) && id > 0);

export const createFactChecks = (env, { userClient }) => {
  const kept = new Map(); // chat:id -> item | null
  const keep = (key, item) => {
    kept.delete(key);
    kept.set(key, item);
    if (kept.size > MAX_KEPT) {
      kept.delete(kept.keys().next().value);
    }
  };

  const factChecks = async (body = {}) => {
    if (!validFactRequest(body)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    const { chat, ids } = body;
    const keyOf = (id) => `${chat}:${id}`;
    const have = () =>
      ids.map((id) => kept.get(keyOf(id))).filter((item) => item);
    const missing = ids.filter((id) => !kept.has(keyOf(id)));
    if (missing.length === 0) {
      return { ok: true, items: have() };
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `fact:${chat}:${missing.join(',')}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.GetFactCheck({ peer, msgId: missing })
          )
        )
      );
      const list = Array.isArray(answer) ? answer : (answer?.result ?? []);
      missing.forEach((id, i) => keep(keyOf(id), factOf(id, list[i])));
      return { ok: true, items: have() };
    });
  };

  return { factChecks };
};
