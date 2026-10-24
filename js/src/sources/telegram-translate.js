/**
 * Translating messages, as Telegram Desktop's "Translate" does (R-Y132;
 * learned, never copied):
 * - `translateMessages({ chat, ids, to })` — the messages' texts in the
 *   language `to` (messages.translateText with the peer and the ids) →
 *   `{ ok, items: [{ id, text, entities }] }`, the entities by className
 *   as a stored message's. Answers are kept in memory by chat, id and
 *   language, so asking again costs nothing.
 * Telegram's refusals (translations off in the chat, the quota used up,
 * a language it has not, Premium needed) become codes the page shows as
 * text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

export const CODES = {
  TRANSLATIONS_DISABLED: 'disabled',
  TRANSLATE_REQ_QUOTA_EXCEEDED: 'quota',
  FLOOD_WAIT: 'quota',
  MSG_ID_INVALID: 'not-found',
  TO_LANG_INVALID: 'bad-language',
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
};

export const failure = failureOf(CODES);

export const CHAT = /^-?\d{1,20}$/;
export const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const MAX_IDS = 20;
const MAX_KEPT = 500;

// An entity as the page draws it: plain fields, ids as strings.
export const plainEntity = (one) => ({
  className: one.className,
  offset: Number(one.offset),
  length: Number(one.length),
  ...(one.url ? { url: String(one.url) } : {}),
  ...(one.language ? { language: String(one.language) } : {}),
  ...(one.documentId === undefined
    ? {}
    : { documentId: String(one.documentId) }),
});

const valid = ({ chat, ids, to } = {}) =>
  CHAT.test(String(chat ?? '')) &&
  LANG.test(String(to ?? '')) &&
  Array.isArray(ids) &&
  ids.length > 0 &&
  ids.length <= MAX_IDS &&
  ids.every((id) => Number.isInteger(id) && id > 0);

export const createTranslate = (env, context) => {
  const kept = new Map(); // chat:id:to -> { id, text, entities }
  const keep = (key, item) => {
    kept.delete(key);
    kept.set(key, item);
    if (kept.size > MAX_KEPT) {
      kept.delete(kept.keys().next().value);
    }
  };

  const ask = (c, { chat, ids, to }) =>
    runIn(env, `translate:${chat}:${ids.join(',')}:${to}`, () =>
      env.connection.withPeer(c.client, chat, (peer) =>
        c.client.invoke(
          new c.Api.messages.TranslateText({ peer, id: ids, toLang: to })
        )
      )
    );

  const translateMessages = async (body = {}) => {
    if (!valid(body)) {
      return { ok: false, supported: false };
    }
    const { chat, ids, to } = body;
    const keyOf = (id) => `${chat}:${id}:${to}`;
    const have = () => ids.map((id) => kept.get(keyOf(id))).filter(Boolean);
    const missing = ids.filter((id) => !kept.has(keyOf(id)));
    if (missing.length === 0) {
      return { ok: true, items: have() };
    }
    return connected(env, context.userClient, failure, async (c) => {
      const answer = await ask(c, { chat, ids: missing, to });
      const results = answer?.result ?? [];
      missing.forEach((id, i) => {
        if (results[i]) {
          keep(keyOf(id), {
            id,
            text: String(results[i].text ?? ''),
            entities: (results[i].entities ?? []).map(plainEntity),
          });
        }
      });
      return { ok: true, items: have() };
    });
  };

  return { translateMessages };
};
