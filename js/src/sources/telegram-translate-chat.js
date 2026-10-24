/**
 * The translate bar's and the summary's server side (R-Y213; learned,
 * never copied). Translating a chat's messages is `translateMessages`
 * (./telegram-translate.js); here are:
 * - `translateAccount()` — `{ ok, premium }`: whether the account has
 *   Premium, which the bar needs to offer translating whole chats.
 * - `summarizeMessage({ chat, id, to? })` — messages.summarizeText of a
 *   long message → `{ ok, text, entities }` (entities as a stored
 *   message's). Telegram's refusals become codes the page shows in words.
 */

import { connected, runIn } from './telegram-stickers.js';
import { CHAT, LANG, failure, plainEntity } from './telegram-translate.js';

const validSummary = ({ chat, id, to } = {}) =>
  CHAT.test(String(chat ?? '')) &&
  Number.isInteger(id) &&
  id > 0 &&
  (to === undefined || LANG.test(String(to)));

export const createTranslateChat = (env, context) => {
  const translateAccount = () =>
    connected(env, context.userClient, failure, async (c) => ({
      ok: true,
      premium: Boolean((await c.client.getMe?.())?.premium),
    }));

  const summarizeMessage = async (body = {}) => {
    if (!validSummary(body)) {
      return { ok: false, error: 'invalid request', code: 'bad-request' };
    }
    const { chat, id, to } = body;
    return connected(env, context.userClient, failure, async (c) => {
      const answer = await runIn(
        env,
        `summarize:${chat}:${id}:${to ?? ''}`,
        () =>
          env.connection.withPeer(c.client, chat, (peer) =>
            c.client.invoke(
              new c.Api.messages.SummarizeText({
                peer,
                id,
                ...(to ? { toLang: to } : {}),
              })
            )
          )
      );
      return {
        ok: true,
        text: String(answer?.text ?? ''),
        entities: (answer?.entities ?? []).map(plainEntity),
      };
    });
  };

  return { translateAccount, summarizeMessage };
};
