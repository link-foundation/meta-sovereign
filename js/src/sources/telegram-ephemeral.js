/**
 * Ephemeral messages (layer 232; R-Y223; learned, never copied): a bot's
 * message shown to one user only (a group's welcome message, a bot's
 * private answer in a group). They are not part of the chat's history
 * and are never fetched: they arrive as updates only, so they are kept
 * in the store under their own id kind,
 *
 *   eph:telegram:<chat>:<id>   `ephemeral: true`, the message shaped as a
 *                              normal `msg:` link (text, `raw` with its
 *                              entities, media and inline keyboard),
 *                              `deleted` once Telegram deleted it
 *
 * so nothing that reads `msg:` links (repairs, history, counts, the chat
 * list) ever sees them. The page draws them in the chat by date.
 *
 * - `ephemeralMessages({ chat })` — the chat's ephemeral messages kept;
 * - `ephemeralCallback({ chat, id, data })` — a press on an inline
 *   callback button of one (ephemeral.getCallbackAnswer), answered like
 *   a normal bot button (./telegram-bots.js). Only on a click.
 *
 * Message text is never logged.
 */

import { answerOf } from './telegram-bots.js';
import { messageSenderId } from './telegram-updates.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const SOURCE = 'telegram';
const CHAT = /^-?\d{1,20}$/;
const BASE64 = /^[A-Za-z0-9+/]{1,88}={0,2}$/;

const CODES = {
  DATA_INVALID: 'data-invalid',
  MESSAGE_ID_INVALID: 'message-gone',
  PEER_ID_INVALID: 'chat-gone',
  BOT_RESPONSE_TIMEOUT: 'timeout',
};
const failure = failureOf(CODES);

export const ephemeralLinkId = (chat, id) => `eph:${SOURCE}:${chat}:${id}`;

/** The `msg:`-shaped link `toLinks` made, moved to the `eph:` kind. */
export const ephemeralLinkOf = (link, message) => ({
  ...link,
  id: ephemeralLinkId(link.chat, message.id),
  tokens: ['ephemeral', SOURCE, String(link.chat), String(message.id)],
  children: [],
  ephemeral: true,
  welcome: Boolean(message.welcomeTemplate),
  ...(message.topMsgId ? { topMsgId: Number(message.topMsgId) } : {}),
});

/**
 * The live handler's writers for the two effects (./telegram-account-live.js
 * hands in its `store`, its store write `merge(link)`, the sync's message
 * mapping `toLinks(dialog, messages)`, `dialogFor(client, chat, entities)`
 * and `entityOf(entities, id)`). A new or edited message is stored,
 * replacing what its id held; a delete marks the messages `deleted`.
 * Each answers whether the page needs a refresh.
 */
export const ephemeralLive = ({
  store,
  merge,
  toLinks,
  dialogFor,
  entityOf,
}) => ({
  ephemeral: async (client, { chat, message, entities }) => {
    const dialog = await dialogFor(client, chat, entities);
    const sender = entityOf(entities, messageSenderId(message));
    const [link] = toLinks(dialog, [
      { ...message, editDate: null, sender: message.sender ?? sender },
    ]);
    if (!link) {
      return false;
    }
    await merge({ ...ephemeralLinkOf(link, message), deleted: false });
    return true;
  },
  'ephemeral-delete': async (_client, { chat, ids }) => {
    let changed = false;
    for (const id of ids) {
      const link = await store.get(ephemeralLinkId(chat, id));
      if (link && !link.deleted) {
        await store.put({ ...link, deleted: true });
        changed = true;
      }
    }
    return changed;
  },
});

const validPress = ({ chat, id, data } = {}) =>
  CHAT.test(String(chat ?? '')) &&
  Number.isInteger(id) &&
  id > 0 &&
  typeof data === 'string' &&
  BASE64.test(data);

export const createEphemeral = (env, { userClient }) => {
  const ephemeralMessages = async ({ chat } = {}) => {
    if (!CHAT.test(String(chat ?? '')) || !env.store?.query) {
      return { ok: false, messages: [] };
    }
    const prefix = ephemeralLinkId(chat, '');
    const messages = await env.store.query(
      (l) => l?.id?.startsWith(prefix) && !l.deleted
    );
    return { ok: true, messages };
  };

  const ephemeralCallback = async (body = {}) => {
    if (!validPress(body)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    const answer = await connected(env, userClient, failure, async (c) =>
      answerOf(
        await runIn(env, `ephemeral:${body.chat}:${body.id}:${body.data}`, () =>
          env.connection.withPeer(c.client, String(body.chat), (peer) =>
            c.client.invoke(
              new c.Api.ephemeral.GetCallbackAnswer({
                peer,
                id: body.id,
                data: Buffer.from(body.data, 'base64'),
              })
            )
          )
        )
      )
    );
    // A bot that did not answer in time still got the press.
    return answer.code === 'timeout'
      ? { ok: true, message: null, alert: false, url: null }
      : answer;
  };

  return { ephemeralMessages, ephemeralCallback };
};
