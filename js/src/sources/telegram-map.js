/**
 * Map pictures for places (R-Y131), as Telegram Desktop draws them
 * (learned, never copied): a place in a chat shows a map image that
 * Telegram makes, asked with upload.getWebFile for an
 * InputWebFileGeoPointLocation.
 *
 * - `mapImage({ lat, lon, accessHash?, w, h, zoom, scale })` — the image
 *   `{ ok, mime, bytes }`, read in 128 KiB chunks until the bytes run
 *   out. Kept in memory (about 64 pictures), so a place seen again is
 *   not asked again.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CHUNK = 128 * 1024;
// A map picture is small; more than this is not one.
const MAX_BYTES = 4 * 1024 * 1024;
const KEPT = 64;

const CODES = {
  FLOOD_WAIT: 'flood',
  WEBFILE_NOT_AVAILABLE: 'map-unavailable',
  LOCATION_INVALID: 'map-unavailable',
  GEO_POINT_INVALID: 'map-unavailable',
};

const bytesOf = (value) =>
  value instanceof Uint8Array ? Buffer.from(value) : Buffer.alloc(0);

const MIMES = {
  'storage.FileJpeg': 'image/jpeg',
  'storage.FilePng': 'image/png',
};

// The picture's type: Telegram's own, else from its file type.
const mimeOf = (file) => {
  const mime = String(file?.mimeType ?? '');
  return mime.startsWith('image/')
    ? mime
    : (MIMES[file?.fileType?.className] ?? 'image/png');
};

export const createMapActions = (env, context) => {
  const { userClient } = context;
  const kept = new Map(); // key -> { ok, mime, bytes }
  const fail = failureOf(CODES);

  const read = async (c, location) => {
    const parts = [];
    let mime = 'image/png';
    let offset = 0;
    while (offset < MAX_BYTES) {
      const file = await c.client.invoke(
        new c.Api.upload.GetWebFile({ location, offset, limit: CHUNK })
      );
      const part = bytesOf(file?.bytes);
      if (offset === 0) {
        mime = mimeOf(file);
      }
      parts.push(part);
      offset += part.length;
      if (part.length < CHUNK || (file?.size && offset >= file.size)) {
        break;
      }
    }
    return { ok: offset > 0, mime, bytes: Buffer.concat(parts) };
  };

  const mapImage = async ({ lat, lon, accessHash, w, h, zoom, scale }) => {
    const key = [lat, lon, accessHash ?? '', w, h, zoom, scale].join('|');
    if (kept.has(key)) {
      return kept.get(key);
    }
    const answer = await connected(env, userClient, fail, (c) =>
      runIn(env, `map:${key}`, () =>
        read(
          c,
          new c.Api.InputWebFileGeoPointLocation({
            geoPoint: new c.Api.InputGeoPoint({ lat, long: lon }),
            accessHash: c.helpers.returnBigInt(accessHash ?? 0),
            w,
            h,
            zoom,
            scale,
          })
        )
      )
    );
    if (answer.ok) {
      kept.set(key, answer);
      if (kept.size > KEPT) {
        kept.delete(kept.keys().next().value);
      }
    }
    return answer;
  };

  return { mapImage };
};

// A number in [min, max] (whole when `whole`) from a query, else null.
const numberIn = (value, min, max, whole) => {
  const n = /^-?\d+(\.\d+)?$/.test(value ?? '') ? Number(value) : NaN;
  return n >= min && n <= max && (!whole || Number.isInteger(n)) ? n : null;
};

/** A map request's query checked: the arguments, or null. */
export const mapQuery = (query) => {
  const args = {
    lat: numberIn(query.get('lat'), -90, 90, false),
    lon: numberIn(query.get('lon'), -180, 180, false),
    w: numberIn(query.get('w'), 16, 1024, true),
    h: numberIn(query.get('h'), 16, 1024, true),
    zoom: numberIn(query.get('zoom'), 13, 20, true),
    scale: numberIn(query.get('scale'), 1, 3, true),
  };
  const hash = query.get('hash') ?? '';
  if (Object.values(args).includes(null) || !/^(-?\d{1,20})?$/.test(hash)) {
    return null;
  }
  return hash ? { ...args, accessHash: hash } : args;
};

const reply = (status, body, headers = {}) => ({
  status,
  body,
  headers: { 'x-content-type-options': 'nosniff', ...headers },
});

const answerOf = async (account, query) => {
  const args = mapQuery(query);
  if (!args) {
    return reply(400, 'bad map request');
  }
  if (typeof account.mapImage !== 'function') {
    return reply(501, 'maps not available');
  }
  const map = await account.mapImage(args);
  return map?.ok
    ? reply(200, map.bytes, {
        'content-type': map.mime || 'image/png',
        'content-length': map.bytes.length,
        // A place's map keeps; the browser may hold it for a day.
        'cache-control': 'private, max-age=86400',
      })
    : reply(404, 'no map');
};

/** The route's answer to `req`, written to `res`. */
export const answerMap = async (account, req, res) => {
  const query = new URL(req.url, 'http://local').searchParams;
  const { status, headers, body } = await answerOf(account, query);
  res.writeHead(status, headers);
  res.end(body);
  return true;
};
