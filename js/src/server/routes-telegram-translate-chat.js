// The translate bar and the summary (R-Y213): routes of the POSTS table in
// routes-telegram.js, validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/translate-account {} -> { ok, premium } whether the
//                       account has Premium (the bar is offered only then)
//   POST /api/telegram/summarize {chat, id, to?} -> { ok, text, entities }
//                       a long message summarized (messages.summarizeText);
//                       refusals come as { ok: false, code }

import { route } from './routes-telegram-admin-extras.js';

const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export const TRANSLATE_CHAT_POSTS = {
  'translate-account': route(
    'translateAccount',
    'nothing required',
    () => true,
    () => ({})
  ),
  summarize: route(
    'summarizeMessage',
    'chat and id required',
    (b) =>
      /^-?\d{1,20}$/.test(String(b.chat ?? '')) &&
      Number.isInteger(b.id) &&
      b.id > 0 &&
      (b.to === undefined || (typeof b.to === 'string' && LANG.test(b.to)))
  ),
};
