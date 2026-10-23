/**
 * The link preview of the message box, as Telegram Desktop shows it
 * (R-Y145; learned, never copied):
 *
 * - `linkPreview({ text, url })` — messages.getWebPagePreview with the
 *   text and its entities → `{ ok, state: 'ready', preview }` (`preview`:
 *   `{ url, displayUrl, siteName, title, description, photo, large }`,
 *   `photo` the id of a picture the route below serves, else null),
 *   `{ ok, state: 'pending' }` while Telegram is still fetching the page
 *   (the page asks again), or `{ ok, state: 'empty' }` (no preview).
 *   Ready and empty answers are kept for five minutes per link;
 * - `linkPreviewPhoto({ id })` — the picture of a page Telegram sent in
 *   a preview, downloaded through the Telegram client (never from the
 *   page's own site); only ids this module handed out are served.
 *
 * `previewFields(body)` validates what a send carries about it:
 * `noWebpage`, `invertMedia`, and `previewUrl` with `previewSize`
 * ('large' | 'small') → the draft's fields, or null when invalid.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';
import { pickSize } from './telegram-media.js';
import { apiEntities, parseFormatted } from './telegram-format.js';

const failure = failureOf({ FLOOD_WAIT: 'flood', MESSAGE_EMPTY: 'empty' });

const KEEP_MS = 5 * 60_000;
const MAX_KEPT = 200;
const MAX_PHOTOS = 100;
const MAX_TEXT = 8192;
const URL_MAX = 2048;
const ID = /^\d{1,20}$/;
export const PREVIEW_URL = /^(https?:\/\/)?[^\s<>"']{3,2048}$/i;
export const PREVIEW_SIZES = Object.freeze(['large', 'small']);

const plain = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

const bytesOf = (value) => {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return typeof value?.bytes === 'string'
    ? Buffer.from(value.bytes, 'base64')
    : Buffer.alloc(0);
};

const validUrlAndSize = ({ previewUrl, previewSize }) =>
  typeof previewUrl === 'string' &&
  previewUrl.length <= URL_MAX &&
  PREVIEW_URL.test(previewUrl) &&
  PREVIEW_SIZES.includes(previewSize);

/** The send's preview fields from a request body, or null if invalid. */
export const previewFields = (body = {}) => {
  const { noWebpage, invertMedia, previewUrl, previewSize } = body;
  if (
    [noWebpage, invertMedia].some(
      (v) => v !== undefined && v !== true && v !== false
    )
  ) {
    return null;
  }
  const hasUrl = previewUrl !== undefined;
  if (hasUrl !== (previewSize !== undefined)) {
    return null;
  }
  if (hasUrl && !validUrlAndSize(body)) {
    return null;
  }
  return {
    ...(noWebpage === true ? { noWebpage: true } : {}),
    ...(invertMedia === true ? { invertMedia: true } : {}),
    ...(hasUrl && noWebpage !== true ? { previewUrl, previewSize } : {}),
  };
};

// A WebPage as the page draws its bar; null when there is nothing to show.
const shape = (page, remember) => {
  if (page?.className !== 'WebPage') {
    return null;
  }
  const photo = page.photo?.className === 'Photo' ? page.photo : null;
  const photoId = photo ? plain(photo.id) : null;
  if (photo) {
    remember(photoId, photo);
  }
  return {
    url: plain(page.url),
    displayUrl: plain(page.displayUrl),
    siteName: plain(page.siteName),
    title: plain(page.title),
    description: plain(page.description),
    photo: photoId,
    large: Boolean(page.hasLargeMedia),
  };
};

export const createLinkPreview = (env, context) => {
  const kept = new Map(); // url -> { at, answer }
  const photos = new Map(); // id -> Photo
  const bytes = new Map(); // id -> { buffer, mimeType }
  const now = () => (env.now ? env.now() : Date.now());

  const remember = (id, photo) => {
    photos.delete(id);
    photos.set(id, photo);
    if (photos.size > MAX_PHOTOS) {
      const old = photos.keys().next().value;
      photos.delete(old);
      bytes.delete(old);
    }
  };

  const keep = (url, answer) => {
    kept.delete(url);
    kept.set(url, { at: now(), answer });
    if (kept.size > MAX_KEPT) {
      kept.delete(kept.keys().next().value);
    }
  };

  const ask = async (c, text) => {
    const formatted = parseFormatted(text);
    const entities = apiEntities(c.Api, formatted.entities);
    const got = await runIn(env, 'link-preview', () =>
      c.client.invoke(
        new c.Api.messages.GetWebPagePreview({
          message: formatted.text,
          ...(entities.length > 0 ? { entities } : {}),
        })
      )
    );
    const page = got?.media?.webpage ?? null;
    if (page?.className === 'WebPagePending') {
      return { ok: true, state: 'pending' };
    }
    const preview = shape(page, remember);
    return preview
      ? { ok: true, state: 'ready', preview }
      : { ok: true, state: 'empty' };
  };

  const linkPreview = async ({ text, url } = {}) => {
    const link = String(url ?? '');
    if (
      typeof text !== 'string' ||
      text.length === 0 ||
      text.length > MAX_TEXT ||
      !PREVIEW_URL.test(link) ||
      !text.toLowerCase().includes(link.toLowerCase())
    ) {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    const hit = kept.get(link);
    if (hit && now() - hit.at < KEEP_MS) {
      return hit.answer;
    }
    const answer = await connected(env, context.userClient, failure, (c) =>
      ask(c, text)
    );
    if (answer.ok && answer.state !== 'pending') {
      keep(link, answer);
    }
    return answer;
  };

  const download = async (c, photo) => {
    const type = pickSize(photo.sizes ?? [], 'm');
    if (!type) {
      return null;
    }
    const buffer = await runIn(
      env,
      `link-preview-photo:${plain(photo.id)}`,
      () =>
        c.client.downloadFile(
          new c.Api.InputPhotoFileLocation({
            id: c.helpers.returnBigInt(plain(photo.id)),
            accessHash: c.helpers.returnBigInt(plain(photo.accessHash)),
            fileReference: bytesOf(photo.fileReference),
            thumbSize: type,
          }),
          { dcId: Number(photo.dcId) }
        )
    );
    return buffer?.length
      ? { buffer: Buffer.from(buffer), mimeType: 'image/jpeg' }
      : null;
  };

  const linkPreviewPhoto = async ({ id } = {}) => {
    const key = String(id ?? '');
    if (!ID.test(key) || !photos.has(key)) {
      return null;
    }
    if (bytes.has(key)) {
      return bytes.get(key);
    }
    const got = await connected(
      env,
      context.userClient,
      () => null,
      (c) => download(c, photos.get(key))
    );
    if (got?.buffer) {
      bytes.set(key, got);
      return got;
    }
    return null;
  };

  return { linkPreview, linkPreviewPhoto };
};
