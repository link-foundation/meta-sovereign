/**
 * Instant View, as Telegram Desktop and the official clients offer it
 * (R-Y205; learned, never copied). Read-only:
 * - `instantView({ url, hash? })` — messages.getWebPage → `{ ok,
 *   available: true, siteName, title, page }` where `page` is the safe
 *   tree of ./telegram-instant-view-shape.js, or `{ ok, available: false
 *   }` when Telegram has no cached page for the link (the page offers
 *   "Open in browser"). A `t.me/iv?url=…` link names the page it wraps.
 *   Telegram's errors (WEBPAGE_NOT_FOUND, …) become codes;
 * - `instantViewFile({ kind, id })` — a picture the last pages used
 *   (`kind` 'photo' or 'document'), downloaded through the Telegram
 *   client with the media helpers (never from the page's own site) →
 *   `{ buffer, mimeType }` or null. Pages and pictures are kept in memory.
 *   With `full: true` a document comes whole (up to 64 MB) with its name,
 *   for a page's video, audio and files (R-Y224; learned, never copied);
 *   the last two are kept so a player's range requests share one download.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';
import {
  pickSize,
  locationOf,
  bigSize,
  documentPicture,
} from './telegram-media.js';
import { createWholeFiles } from './telegram-instant-view-whole.js';
import { shapePage, safeHref } from './telegram-instant-view-shape.js';

const CODES = {
  WEBPAGE_NOT_FOUND: 'not-found',
  WEBPAGE_CURL_FAILED: 'unreachable',
  WEBPAGE_URL_INVALID: 'bad-url',
  URL_INVALID: 'bad-url',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const KEEP_MS = 5 * 60_000;
const MAX_PAGES = 30;
const MAX_FILES = 300;
const MAX_BYTES = 8 * 1024 * 1024;
const URL_MAX = 2048;
const ID = /^\d{1,20}$/;
export const KINDS = Object.freeze(['photo', 'document']);
const IV_HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;

const plain = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

const safeHttp = (text) => {
  const href = safeHref(text);
  return href && /^https?:/i.test(href) ? href : null;
};

/** The link to ask Telegram about: a t.me/iv?url=… link gives its url. */
export const targetOf = (link) => {
  const text = String(link ?? '').trim();
  if (text.length === 0 || text.length > URL_MAX) {
    return null;
  }
  try {
    const url = new URL(text);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      IV_HOSTS.test(url.hostname) &&
      url.pathname === '/iv'
    ) {
      const inner = url.searchParams.get('url') ?? '';
      return inner.length <= URL_MAX ? safeHttp(inner) : null;
    }
  } catch {
    return null;
  }
  return safeHttp(text);
};

const evict = (map, max) => {
  if (map.size > max) {
    map.delete(map.keys().next().value);
  }
};

export const createInstantView = (env, context) => {
  const pages = new Map(); // url -> { at, answer }
  const files = new Map(); // `kind:id` -> Photo | Document
  const bytes = new Map(); // `kind:id` -> { buffer, mimeType }
  const wholeFile = createWholeFiles(env, context, files);
  const now = () => (env.now ? env.now() : Date.now());

  const remember = (page, shaped) => {
    const want = {
      photo: new Set(shaped.photos),
      document: new Set(shaped.documents),
    };
    const add = (kind, list) => {
      for (const one of list ?? []) {
        const id = plain(one.id);
        if (want[kind].has(id) && ID.test(id)) {
          files.delete(`${kind}:${id}`);
          files.set(`${kind}:${id}`, one);
          evict(files, MAX_FILES);
        }
      }
    };
    add('photo', page.photos);
    add('document', page.documents);
  };

  const ask = async (c, url, hash) => {
    const got = await runIn(env, 'instant-view', () =>
      c.client.invoke(new c.Api.messages.GetWebPage({ url, hash }))
    );
    const web = got?.webpage;
    const cached = web?.className === 'WebPage' ? web.cachedPage : null;
    if (!cached || cached.className !== 'Page') {
      return { ok: true, available: false };
    }
    const shaped = shapePage(cached);
    remember(cached, shaped);
    const tree = { url: shaped.url, rtl: shaped.rtl, blocks: shaped.blocks };
    return {
      ok: true,
      available: true,
      siteName: plain(web.siteName),
      title: plain(web.title),
      page: { ...tree, url: tree.url || url },
    };
  };

  const instantView = async ({ url, hash = 0 } = {}) => {
    const target = targetOf(url);
    if (!target || !Number.isInteger(hash) || hash < 0 || hash > 2 ** 31 - 1) {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    const hit = pages.get(target);
    if (hit && now() - hit.at < KEEP_MS) {
      return hit.answer;
    }
    const answer = await connected(env, context.userClient, failure, (c) =>
      ask(c, target, hash)
    );
    if (answer.ok) {
      pages.delete(target);
      pages.set(target, { at: now(), answer });
      evict(pages, MAX_PAGES);
    }
    return answer;
  };

  const download = async (c, kind, file) => {
    const picture =
      kind === 'photo'
        ? {
            kind,
            file,
            thumb: pickSize(file.sizes ?? [], 'x'),
            mimeType: 'image/jpeg',
          }
        : documentPicture(file, 'x');
    if (!picture?.thumb && kind === 'photo') {
      return null;
    }
    const buffer = await runIn(
      env,
      `instant-view-file:${kind}:${plain(file.id)}`,
      () =>
        c.client.downloadFile(locationOf(c.Api, c.helpers, picture), {
          dcId: Number(file.dcId),
          fileSize: bigSize(c.helpers, MAX_BYTES),
        })
    );
    return buffer?.length
      ? { buffer: Buffer.from(buffer), mimeType: picture.mimeType }
      : null;
  };

  const instantViewFile = async ({ kind, id, full = false } = {}) => {
    const key = `${kind}:${id}`;
    if (full && kind === 'document' && files.has(key) && ID.test(id)) {
      return wholeFile(key);
    }
    if (
      !KINDS.includes(kind) ||
      !ID.test(String(id ?? '')) ||
      !files.has(key)
    ) {
      return null;
    }
    if (bytes.has(key)) {
      return bytes.get(key);
    }
    const got = await connected(
      env,
      context.userClient,
      () => null,
      (c) => download(c, kind, files.get(key))
    );
    if (got?.buffer) {
      bytes.set(key, got);
      evict(bytes, MAX_FILES);
      return got;
    }
    return null;
  };

  return { instantView, instantViewFile };
};
