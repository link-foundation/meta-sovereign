/**
 * Telegram Business, the parts of a profile (R-Y180; learned from Telegram
 * Desktop's Settings → Telegram Business, never copied). Reads are free;
 * every write happens on an explicit Save in the page.
 *
 * - `businessHours()` → `{ ok, hours: { timezone, weekly: [{ start, end }],
 *   openNow } | null, timezones: [{ id, name, offset }] }` — the user's
 *   opening hours (users.getFullUser) and Telegram's time zones
 *   (help.getTimezonesList); minutes count from Monday 00:00 in the zone;
 * - `businessHoursSet({ timezone, weekly })` — account.updateBusinessWorkHours
 *   (no weekly hours: cleared);
 * - `businessLocation()` / `businessLocationSet({ address, lat?, lon? })` —
 *   account.updateBusinessLocation (nothing given: cleared);
 * - `businessIntro()` / `businessIntroSet({ title, description, sticker? })`
 *   — account.updateBusinessIntro; `sticker` an id from
 *   `businessIntroStickers()` (messages.getStickers) or the intro's own,
 *   null removes it;
 * - `businessProfile({ chat })` → `{ ok, hours, location, intro }` of a
 *   person, as their profile and an empty chat with them show it;
 * - `foldersTagsSet({ enabled })` — messages.toggleDialogFilterTags (Premium).
 * Telegram's refusals become codes (Telegram Business needs Premium).
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';

export const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  BUSINESS_WORK_HOURS_PERIOD_INVALID: 'hours-invalid',
  BUSINESS_WORK_HOURS_EMPTY: 'hours-invalid',
  TIMEZONE_INVALID: 'hours-invalid',
  BUSINESS_ADDRESS_TOO_LONG: 'address-long',
  BUSINESS_INTRO_TITLE_LENGTH: 'intro-long',
  BUSINESS_INTRO_DESCRIPTION_LENGTH: 'intro-long',
  USER_ID_INVALID: 'no-user',
  PEER_ID_INVALID: 'no-user',
  FLOOD_WAIT: 'flood',
};

export const failure = failureOf(CODES);

export const WEEK = 7 * 24 * 60;
const MAX_END = 8 * 24 * 60;
const USER = /^\d{1,20}$/;
const ZONE = /^[A-Za-z0-9_/+-]{1,64}$/;
const INTRO_STICKER_EMOJI = '\u{1F44B}';

export const bad = (code = 'failed') => ({
  ok: false,
  error: 'bad request',
  code,
});
export const text = (value) => String(value ?? '');
const length = (value) => Array.from(text(value)).length;

/** Whether `weekly` is Telegram's list: sorted, apart, inside a week and a day. */
export const validWeekly = (weekly) =>
  Array.isArray(weekly) &&
  weekly.length <= 28 &&
  weekly.every(
    (w, i) =>
      Number.isInteger(w?.start) &&
      Number.isInteger(w?.end) &&
      w.start >= 0 &&
      w.start < WEEK &&
      w.end > w.start &&
      w.end <= MAX_END &&
      (i === 0 || weekly[i - 1].end <= w.start)
  ) &&
  // A last interval running into Monday must not meet Monday's own.
  (weekly.length === 0 || weekly.at(-1).end - WEEK <= weekly[0].start);

export const validZone = (zone) => typeof zone === 'string' && ZONE.test(zone);

export const hoursOf = (work) =>
  work
    ? {
        timezone: text(work.timezoneId),
        weekly: (work.weeklyOpen ?? []).map((w) => ({
          start: Number(w.startMinute),
          end: Number(w.endMinute),
        })),
        openNow: Boolean(work.openNow),
      }
    : null;

const geoOf = (geo) =>
  geo && geo.className !== 'GeoPointEmpty' && geo.lat !== undefined
    ? { lat: Number(geo.lat), lon: Number(geo.long) }
    : null;

export const locationOf = (place) =>
  place ? { address: text(place.address), point: geoOf(place.geoPoint) } : null;

export const ask = (env, c, key, request) =>
  runIn(env, key, () => c.client.invoke(request));

const fullOf = async (env, c, id, key) => {
  const answer = await ask(env, c, key, new c.Api.users.GetFullUser({ id }));
  return answer?.fullUser ?? {};
};

const selfFull = (env, c) =>
  fullOf(env, c, new c.Api.InputUserSelf(), 'business:me');

const validPoint = (r) =>
  (r.lat === undefined && r.lon === undefined) ||
  (typeof r.lat === 'number' &&
    typeof r.lon === 'number' &&
    Math.abs(r.lat) <= 90 &&
    Math.abs(r.lon) <= 180);

const zonesOf = async (env, c) => {
  try {
    const list = await ask(
      env,
      c,
      'business:zones',
      new c.Api.help.GetTimezonesList({ hash: 0 })
    );
    return (list?.timezones ?? []).map((z) => ({
      id: text(z.id),
      name: text(z.name),
      offset: Number(z.utcOffset) || 0,
    }));
  } catch {
    // the zones are a convenience: the editor falls back to the browser's
    return [];
  }
};

const hoursRequest = (c, timezone, weekly) =>
  new c.Api.account.UpdateBusinessWorkHours(
    weekly.length === 0
      ? {}
      : {
          businessWorkHours: new c.Api.BusinessWorkHours({
            timezoneId: timezone,
            weeklyOpen: weekly.map(
              (w) =>
                new c.Api.BusinessWeeklyOpen({
                  startMinute: w.start,
                  endMinute: w.end,
                })
            ),
          }),
        }
  );

const locationRequest = (c, address, point) =>
  new c.Api.account.UpdateBusinessLocation({
    ...(address === '' ? {} : { address }),
    ...(point
      ? {
          geoPoint: new c.Api.InputGeoPoint({
            lat: point.lat,
            long: point.lon,
          }),
        }
      : {}),
  });

const validIntro = ({ title, description, sticker }) =>
  typeof title === 'string' &&
  typeof description === 'string' &&
  length(title) <= 32 &&
  length(description) <= 70 &&
  (sticker === undefined || sticker === null || USER.test(text(sticker)));

/** Opening hours, location and folder tags. */
const createBusinessHours = (env, { userClient }) => {
  const businessHours = async () =>
    connected(env, userClient, failure, async (c) => {
      const full = await selfFull(env, c);
      return {
        ok: true,
        hours: hoursOf(full.businessWorkHours),
        timezones: await zonesOf(env, c),
      };
    });

  const businessHoursSet = async (request = {}) => {
    const { timezone, weekly } = request;
    if (!validZone(timezone) || !validWeekly(weekly)) {
      return bad('hours-invalid');
    }
    return connected(env, userClient, failure, async (c) => {
      await ask(
        env,
        c,
        'business:hours-set',
        hoursRequest(c, timezone, weekly)
      );
      return { ok: true };
    });
  };

  const businessLocation = async () =>
    connected(env, userClient, failure, async (c) => {
      const full = await selfFull(env, c);
      return { ok: true, location: locationOf(full.businessLocation) };
    });

  const businessLocationSet = async (request = {}) => {
    const address = text(request.address).trim();
    if (
      typeof request.address !== 'string' ||
      length(address) > 96 ||
      !validPoint(request)
    ) {
      return bad('address-long');
    }
    const point = request.lat === undefined ? null : request;
    if (address === '' && point) {
      return bad('address-empty');
    }
    return connected(env, userClient, failure, async (c) => {
      await ask(
        env,
        c,
        'business:location-set',
        locationRequest(c, address, point)
      );
      return { ok: true };
    });
  };

  const foldersTagsSet = async (request = {}) =>
    typeof request.enabled !== 'boolean'
      ? bad()
      : connected(env, userClient, failure, async (c) => {
          await ask(
            env,
            c,
            'business:tags',
            new c.Api.messages.ToggleDialogFilterTags({
              enabled: request.enabled,
            })
          );
          return { ok: true, enabled: request.enabled };
        });

  return {
    businessHours,
    businessHoursSet,
    businessLocation,
    businessLocationSet,
    foldersTagsSet,
  };
};

/** The intro, its stickers and a person's business profile. */
const createBusinessIntro = (env, { userClient, stickers }) => {
  // The documents of the stickers shown for the intro, by id.
  const held = new Map();

  const picture = (doc, from) => {
    if (doc?.className !== 'Document') {
      return null;
    }
    held.set(String(doc.id), doc);
    return (
      stickers?.remember?.([doc], from, 'sticker')?.[0] ?? {
        id: String(doc.id),
      }
    );
  };

  const introOf = (intro, from) =>
    intro
      ? {
          title: text(intro.title),
          description: text(intro.description),
          sticker: intro.sticker ? picture(intro.sticker, from) : null,
        }
      : null;

  const businessIntro = async () =>
    connected(env, userClient, failure, async (c) => {
      const full = await selfFull(env, c);
      return { ok: true, intro: introOf(full.businessIntro, 'business:me') };
    });

  const businessIntroStickers = async () =>
    connected(env, userClient, failure, async (c) => {
      const answer = await ask(
        env,
        c,
        'business:stickers',
        new c.Api.messages.GetStickers({
          emoticon: INTRO_STICKER_EMOJI,
          hash: c.zero,
        })
      );
      const items = (answer?.stickers ?? [])
        .slice(0, 60)
        .map((doc) => picture(doc, 'business:pick'))
        .filter(Boolean);
      return { ok: true, stickers: items };
    });

  const inputSticker = (c, id) => {
    const doc = held.get(text(id));
    return doc
      ? new c.Api.InputDocument({
          id: doc.id,
          accessHash: doc.accessHash,
          fileReference: doc.fileReference,
        })
      : null;
  };

  const businessIntroSet = async (request = {}) => {
    if (!validIntro(request)) {
      return bad('intro-long');
    }
    const { title, description, sticker } = request;
    const empty = title.trim() === '' && description.trim() === '' && !sticker;
    return connected(env, userClient, failure, async (c) => {
      const doc = sticker ? inputSticker(c, sticker) : null;
      if (sticker && !doc) {
        return bad('unknown-sticker');
      }
      await ask(
        env,
        c,
        'business:intro-set',
        new c.Api.account.UpdateBusinessIntro(
          empty
            ? {}
            : {
                intro: new c.Api.InputBusinessIntro({
                  title: title.trim(),
                  description: description.trim(),
                  ...(doc ? { sticker: doc } : {}),
                }),
              }
        )
      );
      return { ok: true };
    });
  };

  const businessProfile = async (request = {}) => {
    const chat = text(request.chat);
    if (!USER.test(chat)) {
      return bad('no-user');
    }
    return connected(env, userClient, failure, (c) =>
      env.connection.withPeer(c.client, chat, async (peer) => {
        const full = await fullOf(
          env,
          c,
          await inputUserOf(c, peer),
          `business:${chat}`
        );
        return {
          ok: true,
          hours: hoursOf(full.businessWorkHours),
          location: locationOf(full.businessLocation),
          intro: introOf(full.businessIntro, `business:${chat}`),
        };
      })
    );
  };

  // A sticker's file reference expired: the person's profile, again.
  stickers?.onAgain?.('business:', (which) => {
    if (which === 'me') {
      return businessIntro();
    }
    return which === 'pick'
      ? businessIntroStickers()
      : businessProfile({ chat: which });
  });

  return {
    businessIntro,
    businessIntroStickers,
    businessIntroSet,
    businessProfile,
  };
};

export const createBusiness = (env, context) => ({
  ...createBusinessHours(env, context),
  ...createBusinessIntro(env, context),
});
