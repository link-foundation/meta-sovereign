/**
 * A GIF in a chat saved to the user's GIFs or taken from them, as Telegram
 * Desktop's message menu does (R-Y171; learned, never copied):
 * - `messageGifSave({ chat, message, unsave })` — `{ ok, id, saved }`:
 *   reads the message (its document comes with a fresh file reference),
 *   checks it is an animation, and asks messages.saveGif with its
 *   InputDocument (`unsave` true removes it). A FILE_REFERENCE_EXPIRED
 *   answer reads the message again once, as the file reader does. The
 *   panel's saved list (messages.getSavedGifs) is asked again after.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  FILE_REFERENCE_EXPIRED: 'expired',
  DOCUMENT_INVALID: 'not-gif',
  MESSAGE_ID_INVALID: 'no-message',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);

const bad = (code) => ({ ok: false, error: code, code });

const textOf = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

const isGif = (doc) =>
  doc?.className === 'Document' &&
  (doc.attributes ?? []).some(
    (a) => a?.className === 'DocumentAttributeAnimated'
  );

const expired = (error) =>
  /FILE_REFERENCE_(EXPIRED|INVALID)/.test(
    String(error?.errorMessage ?? error?.message ?? '')
  );

// The message's animation, read from Telegram.
const gifOf = async (c, peer, id) => {
  const [message] = await c.client.getMessages(peer, { ids: [id] });
  const doc = message?.media?.document;
  return isGif(doc) ? doc : null;
};

const saveRequest = (c, doc, unsave) =>
  new c.Api.messages.SaveGif({
    id: new c.Api.InputDocument({
      id: c.helpers.returnBigInt(textOf(doc.id)),
      accessHash: c.helpers.returnBigInt(textOf(doc.accessHash)),
      fileReference: Buffer.from(doc.fileReference ?? []),
    }),
    unsave,
  });

// One try: read the message, save or unsave its GIF.
const attempt = async (c, peer, id, unsave) => {
  const doc = await gifOf(c, peer, id);
  if (!doc) {
    return bad('not-gif');
  }
  await c.client.invoke(saveRequest(c, doc, unsave));
  return { ok: true, id: textOf(doc.id), saved: !unsave };
};

// The same, read again once when the file reference had expired.
const withRetry = async (c, peer, id, unsave) => {
  try {
    return await attempt(c, peer, id, unsave);
  } catch (error) {
    if (!expired(error)) {
      throw error;
    }
    return attempt(c, peer, id, unsave);
  }
};

/** `stickers`: the sticker module's lists (`changed`). */
export const createGifSave = (env, { userClient, stickers }) => ({
  messageGifSave: async ({ chat, message, unsave = false } = {}) => {
    const id = Number(message);
    if (!/^-?\d{1,20}$/.test(String(chat ?? '')) || !(id > 0)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `gif-save:${chat}:${id}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          withRetry(c, peer, id, unsave === true)
        )
      );
      if (answer.ok) {
        stickers?.changed?.();
      }
      return answer;
    });
  },
});
