/**
 * Sharing a place and a contact from the composer, as Telegram's apps do
 * (R-Y142; learned, never copied):
 * - `sendLocation({ chat, lat, lon, accuracy?, live?, replyTo?, clientId?,
 *   silent?, scheduleDate? })` — a place (messages.sendMedia with
 *   InputMediaGeoPoint, InputGeoPoint lat/long/accuracyRadius) or, with
 *   `live` (900, 3600 or 28800 seconds), a live location
 *   (InputMediaGeoLive with that period) → `{ ok, chat }`;
 * - `stopLiveLocation({ chat, id })` — "Stop sharing" for our own live
 *   location message (messages.editMessage with InputMediaGeoLive
 *   `stopped`, its point taken from the stored message) → `{ ok }`;
 * - `sendContact({ chat, contact | firstName, lastName, phone, ... })` —
 *   a contact card (InputMediaContact, vcard ''). A picked `contact` is
 *   one of the account's contacts (contacts.getContacts) and its phone is
 *   read here, never taken from the page; a typed card carries its own
 *   validated phone → `{ ok, chat }`.
 * Telegram's answer goes through the live handler. Errors become codes.
 */

import { runIn, connect, connected, failureOf } from './telegram-stickers.js';
import { randomIdOf, replyHeader, sendError } from './telegram-send.js';

export const LIVE_PERIODS = [900, 3600, 28800];
export const MAX_ACCURACY = 1500;
const NAME_MAX = 64;
const PHONE = /^\+?[0-9][0-9 ()-]{3,22}[0-9]$/;
const CHAT = /^-?\d{1,20}$/;

const CODES = {
  MESSAGE_ID_INVALID: 'not-found',
  MESSAGE_AUTHOR_REQUIRED: 'not-yours',
  GEO_POINT_INVALID: 'bad-place',
  CONTACT_ID_INVALID: 'no-user',
  PEER_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);

const textOf = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

/** A latitude and a longitude within the globe, else null. */
export const validPoint = (lat, lon) =>
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lon) <= 180
    ? { lat, lon }
    : null;

/** The phone as digits with a leading plus, or null when not a phone. */
export const cleanPhone = (value) => {
  const raw = String(value ?? '').trim();
  if (!PHONE.test(raw)) {
    return null;
  }
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 5 && digits.length <= 15 ? `+${digits}` : null;
};

const name = (value, required) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= NAME_MAX && (!required || text !== '') ? text : null;
};

const geoPoint = (Api, { lat, lon, accuracy }) =>
  new Api.InputGeoPoint({
    lat,
    long: lon,
    ...(accuracy ? { accuracyRadius: accuracy } : {}),
  });

const placeMedia = (Api, r) =>
  r.live
    ? new Api.InputMediaGeoLive({
        geoPoint: geoPoint(Api, r),
        period: r.live,
      })
    : new Api.InputMediaGeoPoint({ geoPoint: geoPoint(Api, r) });

// The request as it will be sent, or null when the place is not valid.
const placeRequest = (r) => {
  const point = validPoint(r.lat, r.lon);
  const accuracy = r.accuracy === undefined ? 0 : Number(r.accuracy);
  const liveOk = r.live === undefined || LIVE_PERIODS.includes(r.live);
  const accuracyOk =
    Number.isInteger(accuracy) && accuracy >= 0 && accuracy <= MAX_ACCURACY;
  return point && liveOk && accuracyOk && CHAT.test(r.chat)
    ? { ...r, ...point, accuracy }
    : null;
};

// messages.sendMedia of what `makeMedia(c)` builds, the answer through the
// live handler.
const sendMedia = async (env, { userClient, apply }, r, makeMedia) => {
  const c = await connect(env, userClient);
  if (!c) {
    return { ok: false, supported: false };
  }
  try {
    const media = await makeMedia(c);
    const result = await runIn(env, `share:${r.chat}`, () =>
      env.connection.withPeer(c.client, r.chat, (peer) =>
        c.client.invoke(
          new c.Api.messages.SendMedia({
            peer,
            media,
            message: '',
            randomId: randomIdOf(r.clientId, 0, c.helpers),
            clearDraft: false,
            ...(r.silent ? { silent: true } : {}),
            ...(r.scheduleDate ? { scheduleDate: r.scheduleDate } : {}),
            ...replyHeader(c.Api, r.replyTo, null),
          })
        )
      )
    );
    if (result && typeof result === 'object') {
      await apply(c.client, result);
    }
  } catch (error) {
    if (error?.shared) {
      return { ok: false, error: error.message, code: error.shared };
    }
    throw sendError(error);
  }
  if (r.scheduleDate) {
    env.actions?.scheduledChanged?.(r.chat);
    return { ok: true, chat: r.chat, scheduled: true };
  }
  return { ok: true, chat: r.chat };
};

const bad = (error = 'bad request') => ({ ok: false, error, code: 'failed' });

// A picked contact: the account's own contact list is read now, so the
// phone comes from Telegram and never from the page.
const pickedCard = async (env, c, id) => {
  const answer = await runIn(env, 'share:contacts', () =>
    c.client.invoke(new c.Api.contacts.GetContacts({ hash: c.zero }))
  );
  const user = (answer?.users ?? []).find((u) => textOf(u.id) === id);
  const phone = user?.phone ? `+${String(user.phone).replace(/^\+/, '')}` : '';
  if (!phone) {
    throw Object.assign(new Error('no phone'), { shared: 'no-phone' });
  }
  return {
    phone,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
  };
};

const contactMedia = (Api, card) =>
  new Api.InputMediaContact({
    phoneNumber: card.phone,
    firstName: card.firstName,
    lastName: card.lastName,
    vcard: '',
  });

const typedCard = (r) => {
  const phone = cleanPhone(r.phone);
  const firstName = name(r.firstName, true);
  const lastName = name(r.lastName ?? '', false);
  return phone && firstName !== null && lastName !== null
    ? { phone, firstName, lastName }
    : null;
};

const createContactSender = (env, context) => async (request) => {
  const r = { ...request, chat: String(request?.chat ?? '') };
  if (!CHAT.test(r.chat)) {
    return bad();
  }
  if (r.contact !== undefined) {
    return /^\d{1,20}$/.test(String(r.contact))
      ? sendMedia(env, context, r, async (c) =>
          contactMedia(c.Api, await pickedCard(env, c, String(r.contact)))
        )
      : bad();
  }
  const card = typedCard(r);
  return card
    ? sendMedia(env, context, r, async (c) => contactMedia(c.Api, card))
    : bad('name and phone required');
};

const createStopper =
  (env, { userClient, apply }) =>
  async ({ chat, id } = {}) => {
    const msgId = Number(id);
    if (!CHAT.test(String(chat ?? '')) || !(msgId > 0)) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      const link = await env.store.get(`msg:telegram:${chat}:${msgId}`);
      const media = link?.raw?.media;
      const point = validPoint(
        Number(media?.geo?.lat),
        Number(media?.geo?.long)
      );
      if (media?.className !== 'MessageMediaGeoLive' || !point) {
        return { ok: false, error: 'not a live location', code: 'not-found' };
      }
      const result = await runIn(env, `share-stop:${chat}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.EditMessage({
              peer,
              id: msgId,
              media: new c.Api.InputMediaGeoLive({
                stopped: true,
                geoPoint: geoPoint(c.Api, point),
              }),
            })
          )
        )
      );
      if (result && typeof result === 'object') {
        await apply(c.client, result);
      }
      return { ok: true };
    });
  };

export const createShareMedia = (env, context) => ({
  sendLocation: async (request) => {
    const r = placeRequest({ ...request, chat: String(request?.chat ?? '') });
    return r
      ? sendMedia(env, context, r, async (c) => placeMedia(c.Api, r))
      : bad('a valid place required');
  },
  stopLiveLocation: createStopper(env, context),
  sendContact: createContactSender(env, context),
});
