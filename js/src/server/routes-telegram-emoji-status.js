// Emoji statuses (R-Y162): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/emoji-statuses {} -> { ok, premium, current,
//                       defaults: [{ id, until? }], recent: [...] } the
//                       statuses to pick from and the account's own
//   POST /api/telegram/emoji-status-set {documentId|null, until?} -> { ok }
//                       documentId a decimal string (null removes the
//                       status), until Unix seconds, in the future and
//                       within a year

import {
  DOCUMENT_ID,
  MAX_UNTIL_SECONDS,
} from '../sources/telegram-emoji-status.js';

/** Whether `until` is absent, or a whole future time within a year. */
export const validUntil = (until, nowMs = Date.now()) =>
  until === undefined ||
  (Number.isInteger(until) &&
    until > nowMs / 1000 &&
    until <= nowMs / 1000 + MAX_UNTIL_SECONDS);

/** Whether a set body is `documentId` (a decimal string, or null) and `until`. */
export const validSet = (body) => {
  const { documentId, until } = body;
  if (documentId === null) {
    return until === undefined;
  }
  return (
    typeof documentId === 'string' &&
    DOCUMENT_ID.test(documentId) &&
    validUntil(until)
  );
};

export const EMOJI_STATUS_POSTS = {
  'emoji-statuses': async (account) =>
    typeof account.emojiStatuses === 'function'
      ? [200, await account.emojiStatuses()]
      : [400, { error: 'emoji status not available', code: 'bad-request' }],
  'emoji-status-set': async (account, body) =>
    validSet(body) && typeof account.emojiStatusSet === 'function'
      ? [
          200,
          await account.emojiStatusSet({
            documentId: body.documentId,
            ...(body.until === undefined ? {} : { until: body.until }),
          }),
        ]
      : [400, { error: 'documentId required', code: 'bad-request' }],
};
