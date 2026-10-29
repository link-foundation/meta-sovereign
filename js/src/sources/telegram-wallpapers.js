/**
 * Chat backgrounds, as Telegram Desktop's "Chat background" has them
 * (R-Y155; learned, never copied):
 * - `wallpapers({ fresh })` — the wallpapers Telegram offers
 *   (account.getWallPapers, hash 0) as `{ ok, wallpapers: [page] }`, kept
 *   ten minutes; each is an image, a pattern over colours, or colours only;
 * - `wallpaperFile({ id, slug, size })` — a wallpaper's thumbnail or full
 *   image, downloaded once through Telegram into the app folder. A pattern
 *   is a gzipped SVG: unzipped and sanitized here, served as image/svg+xml;
 * - `setChatWallpaper({ chat, id })` — a wallpaper of the list set for one
 *   chat (messages.setChatWallPaper, for the user only), the one write.
 * The choice of the app's own background is the page's, kept on its side.
 * The documents the page may name are those listed (by id) or, for a
 * chat's own wallpaper, the one Telegram answers for its slug.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { sanitizeSvg } from '../markup/svg.js';
import { bigSize, locationOf, pickSize, readCache } from './telegram-media.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  WALLPAPER_INVALID: 'invalid',
  WALLPAPER_NOT_FOUND: 'invalid',
  PEER_ID_INVALID: 'no-access',
  CHAT_ADMIN_REQUIRED: 'no-access',
  CHAT_WRITE_FORBIDDEN: 'no-access',
  USER_PRIVACY_RESTRICTED: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const ID = /^-?\d{1,20}$/;
export const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
const LIST_MS = 10 * 60_000;
const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_SVG = 2 * 1024 * 1024;
const IMAGE_TYPE = /^image\/(jpeg|png|webp)$/;

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

/** A colour int (0xRRGGBB, maybe signed) as `#rrggbb`. */
export const hexOf = (value) =>
  `#${(Number(value) & 0xffffff).toString(16).padStart(6, '0')}`;

const COLOUR_KEYS = [
  'backgroundColor',
  'secondBackgroundColor',
  'thirdBackgroundColor',
  'fourthBackgroundColor',
];

/** The colours of a wallpaper's settings, in order, as `#rrggbb`. */
export const coloursOf = (settings) =>
  COLOUR_KEYS.map((key) => settings?.[key])
    .filter((v) => v !== undefined && v !== null)
    .map(hexOf);

const kindOf = (wp, withFile) => {
  if (!withFile) {
    return 'colors';
  }
  return wp.pattern ? 'pattern' : 'image';
};

const settingsPage = (settings) => ({
  colors: coloursOf(settings),
  rotation: Number(settings?.rotation ?? 0) || 0,
  intensity: Number(settings?.intensity ?? 0) || 0,
  blur: Boolean(settings?.blur),
  motion: Boolean(settings?.motion),
});

/**
 * A WallPaper or WallPaperNoFile as the page keeps it:
 * `{ id, slug, kind: image|pattern|colors, dark, colors, rotation,
 * intensity, blur, motion, file }`, or null.
 */
export const wallpaperPage = (wp) => {
  if (!wp || !['WallPaper', 'WallPaperNoFile'].includes(wp.className)) {
    return null;
  }
  const withFile = wp.className === 'WallPaper' && Boolean(wp.document?.id);
  return {
    id: text(wp.id),
    slug: withFile && SLUG.test(String(wp.slug ?? '')) ? wp.slug : '',
    kind: kindOf(wp, withFile),
    dark: Boolean(wp.dark),
    ...settingsPage(wp.settings),
    file: withFile,
  };
};

// Kept as a public export for callers and regression tests.
export { sanitizeSvg } from '../markup/svg.js';

/** A pattern document's bytes (gzip or plain SVG) as safe SVG bytes. */
export const patternSvg = (buffer) => {
  try {
    const gzipped = buffer[0] === 0x1f && buffer[1] === 0x8b;
    const raw = gzipped
      ? zlib.gunzipSync(buffer, { maxOutputLength: MAX_SVG })
      : buffer;
    const svg = sanitizeSvg(raw.toString('utf8'));
    return svg ? Buffer.from(svg, 'utf8') : null;
  } catch {
    return null;
  }
};

// The settings Telegram is told with a chat's wallpaper.
const settingsOf = (c, page) => {
  const fields = {};
  page.colors.forEach((colour, i) => {
    fields[COLOUR_KEYS[i]] = parseInt(colour.slice(1), 16);
  });
  if (page.colors.length > 1) {
    fields.rotation = page.rotation;
  }
  if (page.intensity) {
    fields.intensity = page.intensity;
  }
  return new c.Api.WallPaperSettings(fields);
};

const download = async (c, doc, thumb) => {
  const size = Number(doc.size ?? 0);
  if (!thumb && size > MAX_IMAGE) {
    return null;
  }
  const buffer = await c.client.downloadFile(
    locationOf(c.Api, c.helpers, { kind: 'document', file: doc, thumb }),
    { dcId: Number(doc.dcId), fileSize: bigSize(c.helpers, thumb ? 0 : size) }
  );
  return buffer?.length ? Buffer.from(buffer) : null;
};

// A wallpaper's thumbnail or full picture; a pattern as safe SVG.
const fetchPicture = async (c, wp, size) => {
  const doc = wp.document;
  if (wp.pattern) {
    const raw = await download(c, doc, '');
    const svg = raw ? patternSvg(raw) : null;
    return svg ? { buffer: svg, mimeType: 'image/svg+xml' } : null;
  }
  const thumb = size === 'thumb' ? pickSize(doc.thumbs ?? [], 'm') : '';
  if (size === 'thumb' && !thumb) {
    return null;
  }
  const buffer = await download(c, doc, thumb);
  const mimeType = thumb ? 'image/jpeg' : String(doc.mimeType ?? '');
  return buffer && IMAGE_TYPE.test(mimeType) ? { buffer, mimeType } : null;
};

export const createWallpapers = (env, { userClient, mediaDir }) => {
  const known = new Map(); // id -> WallPaper
  const flights = new Map();
  let kept = null; // { at, answer }

  const remember = (list) => {
    const pages = [];
    for (const wp of list ?? []) {
      const page = wallpaperPage(wp);
      if (page) {
        known.set(page.id, wp);
        pages.push(page);
      }
    }
    return pages;
  };

  const wallpapers = async ({ fresh = false } = {}) => {
    if (!fresh && kept && Date.now() - kept.at < LIST_MS) {
      return kept.answer;
    }
    return connected(env, userClient, failure, async (c) => {
      const got = await runIn(env, 'wallpapers:list', () =>
        c.client.invoke(new c.Api.account.GetWallPapers({ hash: c.zero }))
      );
      if (got?.className === 'account.WallPapersNotModified' && kept) {
        return kept.answer;
      }
      const answer = { ok: true, wallpapers: remember(got?.wallpapers) };
      kept = { at: Date.now(), answer };
      return answer;
    });
  };

  // A wallpaper not on the list (a chat's own): by its slug.
  const bySlug = async (id, slug) => {
    if (!SLUG.test(slug)) {
      return null;
    }
    return connected(
      env,
      userClient,
      () => null,
      async (c) => {
        const wp = await runIn(env, `wallpaper:${slug}`, () =>
          c.client.invoke(
            new c.Api.account.GetWallPaper({
              wallpaper: new c.Api.InputWallPaperSlug({ slug }),
            })
          )
        );
        if (text(wp?.id) !== id || wp?.className !== 'WallPaper') {
          return null;
        }
        known.set(id, wp);
        return wp;
      }
    );
  };

  const fetchFile = (wp, size) =>
    connected(
      env,
      userClient,
      () => null,
      (c) =>
        runIn(env, `wallpaper-file:${text(wp.id)}:${size}`, () =>
          fetchPicture(c, wp, size)
        )
    );

  const load = async (key, slug, size, file) => {
    const wp = known.get(key) ?? (await bySlug(key, slug));
    if (wp?.className !== 'WallPaper' || !wp.document?.id) {
      return null;
    }
    const got = await fetchFile(wp, size);
    if (!got?.buffer) {
      return null;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, got.buffer);
    await fs.writeFile(`${file}.type`, got.mimeType);
    return got;
  };

  const wallpaperFile = async ({ id, slug = '', size = 'full' } = {}) => {
    const key = String(id ?? '');
    if (!ID.test(key) || !mediaDir || !['thumb', 'full'].includes(size)) {
      return null;
    }
    const name = `${key.replace('-', 'n')}-${size}`;
    const file = path.join(mediaDir, 'wallpapers', name);
    const cached = await readCache(file);
    const type = cached ? String(await readCache(`${file}.type`)) : '';
    if (cached && /^image\//.test(type)) {
      return { buffer: cached, mimeType: type };
    }
    if (!flights.has(name)) {
      flights.set(
        name,
        load(key, String(slug), size, file)
          .catch(() => null)
          .finally(() => flights.delete(name))
      );
    }
    return flights.get(name);
  };

  const inputOf = (c, wp) =>
    wp.className === 'WallPaper'
      ? new c.Api.InputWallPaper({ id: wp.id, accessHash: wp.accessHash })
      : new c.Api.InputWallPaperNoFile({ id: wp.id });

  // The one write: a wallpaper of the list for this chat, for the user
  // only (forBoth off).
  const setChatWallpaper = async ({ chat, id } = {}) => {
    const wp = known.get(String(id ?? ''));
    if (!ID.test(String(chat ?? '')) || !wp) {
      return { ok: false, error: 'unknown wallpaper', code: 'unknown' };
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `wallpaper-set:${chat}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.SetChatWallPaper({
              peer,
              wallpaper: inputOf(c, wp),
              ...(wp.settings
                ? { settings: settingsOf(c, wallpaperPage(wp)) }
                : {}),
            })
          )
        )
      );
      return { ok: true };
    });
  };

  return { wallpapers, wallpaperFile, setChatWallpaper };
};
