/**
 * The Telegram routes that answer bytes, not JSON (GET /api/telegram/…):
 * a message's picture, a sticker's, a custom emoji's, a place's map, a
 * file by range, a peer's photo; and the GETs the page reads as JSON — a
 * chat's info, its unread marks. See ./routes-telegram.js for the list.
 *
 * Its routes:
 *   GET  /api/telegram/story?peer=&id= -> a story's picture or video (by
 *                       range), downloaded once
 *   GET  /api/telegram/media?chat=&id=&size=&part=
 *                                      -> a message's picture (s/m/x/y/w),
 *                                         downloaded once, then from disk
 *   GET  /api/telegram/custom-emoji?id=&full=1
 *                                      -> a custom emoji's picture, or
 *                                         (full) its animation or video
 *                                         (R-Y120)
 *   GET  /api/telegram/map?lat=&lon=&w=&h=&zoom=&scale=&hash=
 *                                      -> a place's map picture, kept a
 *                                         day; strict 400s (R-Y131)
 *   GET  /api/telegram/file?chat=&id=  -> a message's video, voice, audio,
 *                                         GIF or sticker (up to 64 MB), by
 *                                         byte range for players to seek
 *   GET  /api/telegram/avatar?peer=&size=s|b&chat=&msg=
 *                                      -> a person's or chat's photo; 404
 *                                         when they have none
 *   GET  /api/telegram/chat-info?chat= -> { kind, title, members, online,
 *                                         username, about, photo, lastSeen? }
 */

import { classifyOrigin } from './cors.js';
import { json } from './util.js';
import { answerMap } from '../sources/telegram-map.js';

// Pictures are the user's own: only the app's pages may load them, so
// another site open in the browser can neither see them nor make
// Telegram download them. The server's own page: browsers say where an
// <img> load comes from. The app on its other origins (the hosted app,
// the mobile WebViews): it loads them as CORS requests
// (../web/media-src.js), whose Origin no other site can fake.
export const fromApp = (req, allowed = []) => {
  const site = req.headers['sec-fetch-site'];
  return (
    !site ||
    site === 'same-origin' ||
    site === 'none' ||
    classifyOrigin(req, allowed) === 'allowed'
  );
};

// A refused load, in the log once per route, site and origin (a page
// asks for hundreds of pictures): which page asked and how, never what.
const refusals = new Set();
const refuse = (req, res, ctx, route, error) => {
  const origin = req.headers.origin ?? null;
  const key = `${route}|${req.headers['sec-fetch-site']}|${origin}`;
  if (!refusals.has(key) && refusals.size < 100) {
    refusals.add(key);
    ctx?.log?.({
      level: 'warn',
      event: 'telegram_media_refused',
      route,
      site: req.headers['sec-fetch-site'] ?? null,
      mode: req.headers['sec-fetch-mode'] ?? null,
      origin,
      verdict: classifyOrigin(req, ctx?.allowOrigins ?? []),
    });
  }
  return json(res, 403, { error }) ?? true;
};

// GET /api/telegram/media?chat=&id=&size= -> the picture's bytes.
const handleMedia = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'media', 'pictures load only in the app');
  }
  if (typeof account.media !== 'function') {
    return json(res, 501, { error: 'media not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.media({
    chat: query.get('chat'),
    id: Number(query.get('id')),
    size: query.get('size') || 'm',
    // The item of a paid-media message (R-Y176).
    part: Number(query.get('part') || 0),
  });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    // A message's picture never changes; kept by this browser only.
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/sticker?id=|set=&full=1 -> a sticker's or GIF's
// picture, a set's, or (full) a video sticker's or GIF's video (R-Y105).
const handleSticker = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'sticker', 'stickers load only in the app');
  }
  if (typeof account.stickerPicture !== 'function') {
    return json(res, 501, { error: 'stickers not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.stickerPicture({
    id: query.get('id'),
    set: query.get('set'),
    full: query.get('full') === '1',
  });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'application/octet-stream',
    'content-length': result.buffer.length,
    // A sticker never changes; a set's picture may, so an hour.
    'cache-control': query.get('set')
      ? 'private, max-age=3600'
      : 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/custom-emoji?id=&full=1 -> a custom emoji's picture,
// or (full) its animation or video; the id only digits (R-Y120).
const handleCustomEmoji = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'custom-emoji', 'emoji load only in the app');
  }
  if (typeof account.customEmojiPicture !== 'function') {
    return json(res, 501, { error: 'custom emoji not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  if (!/^\d{1,20}$/.test(query.get('id') ?? '')) {
    return json(res, 400, { error: 'bad id' }) ?? true;
  }
  const result = await account.customEmojiPicture({
    id: query.get('id'),
    full: query.get('full') === '1',
  });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'application/octet-stream',
    'content-length': result.buffer.length,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/map?lat=&lon=&w=&h=&zoom=&scale=&hash= (R-Y131).
const handleMap = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'map', 'maps load only in the app');
  }
  return answerMap(account, req, res);
};

// `bytes=a-b` of a file of `size` bytes: [start, end], or null.
export const byteRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? [start, end] : null;
};

// The bytes of a file, whole or the range the player asked for.
const sendBytes = (req, res, { buffer, mimeType }) => {
  const size = buffer.length;
  const head = {
    'content-type': mimeType || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
  if (req.headers.range) {
    const range = byteRange(req.headers.range, size);
    if (!range) {
      res.writeHead(416, { ...head, 'content-range': `bytes */${size}` });
      res.end();
      return true;
    }
    const [start, end] = range;
    res.writeHead(206, {
      ...head,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    });
    res.end(buffer.subarray(start, end + 1));
    return true;
  }
  res.writeHead(200, { ...head, 'content-length': size });
  res.end(buffer);
  return true;
};

// GET /api/telegram/file?chat=&id= -> the message's file, by range.
const handleFile = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'file', 'files load only in the app');
  }
  if (typeof account.file !== 'function') {
    return json(res, 501, { error: 'files not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.file({
    chat: query.get('chat'),
    id: Number(query.get('id')),
  });
  if (result?.error === 'too-large') {
    return json(res, 413, { error: 'too-large', size: result.size }) ?? true;
  }
  if (!result?.buffer) {
    return json(res, 404, { error: 'no file' }) ?? true;
  }
  return sendBytes(req, res, result);
};

// GET /api/telegram/story?peer=&id= -> a story's picture or video, by
// range (R-Y140). The peer and the id are digits only.
const handleStory = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'story', 'stories load only in the app');
  }
  if (typeof account.storyMedia !== 'function') {
    return json(res, 501, { error: 'stories not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const peer = query.get('peer') ?? '';
  const id = query.get('id') ?? '';
  if (!/^-?\d{1,20}$/.test(peer) || !/^[1-9]\d{0,9}$/.test(id)) {
    return json(res, 400, { error: 'bad story' }) ?? true;
  }
  const result = await account.storyMedia({ chat: peer, id: Number(id) });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no story' }) ?? true;
  }
  return sendBytes(req, res, result);
};

// A photo not on disk yet is waited for this long, then asked again: a
// photo on disk answers in a few ms, and a longer wait held one of the
// browser's six connections for each photo still downloading (R-Y85).
const AVATAR_WAIT_MS = 250;
const LATER = Symbol('later');

// `promise`'s value, or LATER when it takes longer than `ms` (it goes
// on by itself).
const answerSoon = (promise, ms) => {
  let timer = null;
  const later = new Promise((resolve) => {
    timer = globalThis.setTimeout(() => resolve(LATER), ms);
  });
  return Promise.race([promise.catch(() => null), later]).finally(() =>
    globalThis.clearTimeout(timer)
  );
};

// GET /api/telegram/avatar?peer=&size= -> the peer's photo.
const handleAvatar = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'avatar', 'pictures load only in the app');
  }
  if (typeof account.avatar !== 'function') {
    return json(res, 501, { error: 'avatars not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const reading = Promise.resolve().then(() =>
    account.avatar({
      peer: query.get('peer'),
      size: query.get('size') === 'b' ? 'b' : 's',
      chat: query.get('chat'),
      msg: query.get('msg'),
    })
  );
  const result = await answerSoon(reading, AVATAR_WAIT_MS);
  if (result === LATER) {
    // Still downloading: the browser's few connections are not held
    // for it (they would hold up the chat); the page asks again soon.
    res.setHeader('retry-after', '3');
    res.setHeader('cache-control', 'no-store');
    return json(res, 503, { error: 'loading' }) ?? true;
  }
  if (!result?.buffer) {
    // No photo: the page shows initials, and asks again tomorrow.
    res.setHeader('cache-control', 'private, max-age=3600');
    return json(res, 404, { error: 'no photo' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    // A new photo shows within a day (the server re-reads it daily).
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/chat-info?chat= -> members, online, last seen.
const handleChatInfo = async (account, req, res) => {
  if (typeof account.chatInfo !== 'function') {
    return json(res, 501, { error: 'chat info not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const info = await account.chatInfo({ chat: query.get('chat') });
  return info
    ? (json(res, 200, info) ?? true)
    : (json(res, 404, { error: 'no chat info' }) ?? true);
};

// GET /api/telegram/unread-marks?chat=&kind=mentions|reactions -> ids.
const handleUnreadMarks = async (account, req, res) => {
  if (typeof account.unreadMarks !== 'function') {
    return json(res, 501, { error: 'unread marks not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  return (
    json(
      res,
      200,
      await account.unreadMarks({
        chat: query.get('chat'),
        kind: query.get('kind'),
      })
    ) ?? true
  );
};

// GET /api/telegram/link-preview-photo?id= -> the picture of a page in the
// message box's link preview, downloaded through Telegram (R-Y145).
const handleLinkPreviewPhoto = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'link-preview-photo', 'load only in the app');
  }
  if (typeof account.linkPreviewPhoto !== 'function') {
    return json(res, 501, { error: 'link previews not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  if (!/^\d{1,20}$/.test(query.get('id') ?? '')) {
    return json(res, 400, { error: 'bad id' }) ?? true;
  }
  const result = await account.linkPreviewPhoto({ id: query.get('id') });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

export const GETS = {
  'link-preview-photo': handleLinkPreviewPhoto,
  media: handleMedia,
  sticker: handleSticker,
  map: handleMap,
  'custom-emoji': handleCustomEmoji,
  file: handleFile,
  story: handleStory,
  avatar: handleAvatar,
  'chat-info': handleChatInfo,
  'unread-marks': handleUnreadMarks,
};
