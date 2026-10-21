/**
 * Albums, as Telegram shows them: photos and videos sent together (one
 * `groupedId`) are one bubble — a grid of them, the caption under it,
 * one time — not a row each. Telegram stores each item as a message of
 * its own; the chat draws them as one, and what is done to the album
 * (forward, delete, select) is done to every item.
 *
 * - `groupAlbums(messages)` — the rows to draw: an album's items become
 *   one row, the item with the caption leading (`albumItems` on it).
 * - `expandAlbums(rows)` — back to every message, for an action.
 * - `albumRows(ratios)` — the grid: rows of up to four, each as tall as
 *   its items' proportions let them fill the width.
 * - `AlbumGrid` — draws it.
 */

import React from 'react';
import { parseMessageParts } from './message-parts.js';
import { MediaPhoto } from './chat-photo.js';
import { MediaVideo } from './chat-media.js';

const el = React.createElement;

/** The album a message belongs to, or null. */
export const albumOf = (message) =>
  message?.raw?.groupedId && !message.service
    ? `${message.chat}:${message.raw.groupedId}`
    : null;

// The item a row shows as the album: the one with the caption (Telegram
// keeps it on one item), else the first.
const leadOf = (items) => {
  const captioned = items.find((m) => {
    const body = String(m.body ?? '').trim();
    return body !== '' && body !== '📎';
  });
  return { ...(captioned ?? items[0]), albumItems: items };
};

/** Messages as the rows the chat draws: each album one row. */
export const groupAlbums = (messages = []) => {
  const groups = [];
  for (const message of messages) {
    const album = albumOf(message);
    const last = groups.at(-1);
    if (album && last?.album === album) {
      last.items.push(message);
    } else {
      groups.push({ album, items: [message] });
    }
  }
  return groups.map(({ items }) =>
    items.length > 1 ? leadOf(items) : items[0]
  );
};

/** Every message of these rows: an album's items in place of it. */
export const expandAlbums = (rows = []) =>
  rows.flatMap((row) => row?.albumItems ?? [row]);

/** The ids a row stands for (the album's items, or its own). */
export const rowIds = (row) => (row?.albumItems ?? [row]).map((m) => m.id);

// How many go in each row, top to bottom: rows of two to four, the
// shorter ones first, as Telegram lays out bigger albums.
const rowSizes = (ratios) => {
  const n = ratios.length;
  if (n <= 1) {
    return [n];
  }
  if (n === 2) {
    // Two wide ones stand one above the other; else side by side.
    return ratios.every((r) => r > 1.4) ? [1, 1] : [2];
  }
  if (n === 3) {
    return ratios[0] > 1.2 ? [1, 2] : [3];
  }
  if (n === 4) {
    return ratios[0] > 1.2 ? [1, 3] : [2, 2];
  }
  const rows = Math.ceil(n / 3);
  const sizes = Array.from({ length: rows }, (_, i) =>
    Math.floor((n + i) / rows)
  );
  return sizes;
};

// A very wide or very tall item does not take the whole row.
const clampRatio = (ratio) =>
  Math.min(Math.max(Number(ratio) > 0 ? Number(ratio) : 1, 0.6), 2.2);

/**
 * The grid for items of these proportions (width / height): rows of
 * `{ items: [{ index, ratio }], aspect }`; each row is as wide as the
 * album, and `aspect` is its width / height, so its items fill it.
 */
export const albumRows = (ratios = []) => {
  const clamped = ratios.map(clampRatio);
  const rows = [];
  let next = 0;
  for (const size of rowSizes(clamped)) {
    const items = clamped
      .slice(next, next + size)
      .map((ratio, i) => ({ index: next + i, ratio }));
    next += size;
    const sum = items.reduce((total, item) => total + item.ratio, 0);
    rows.push({ items, aspect: Math.max(sum, size === 1 ? 1.2 : 1) });
  }
  return rows;
};

const netIdOf = (id) => {
  const tail = String(id ?? '')
    .split(':')
    .pop();
  return /^\d+$/.test(tail) ? Number(tail) : null;
};

const ALBUM_VIDEOS = new Set(['video', 'gif']);

// One item of the grid: its photo, or its video.
const AlbumTile = ({ item, media, ratio, api, chat }) =>
  el(
    'div',
    {
      className: 'bubble-album-tile',
      'data-album-item': item.id,
      style: { flex: `${ratio} 1 0` },
    },
    media?.kind === 'document' && ALBUM_VIDEOS.has(media.type)
      ? el(MediaVideo, {
          media,
          api,
          chat,
          msgId: netIdOf(item.id),
          fill: true,
        })
      : el(MediaPhoto, {
          media: media?.kind === 'photo' ? media : null,
          api,
          chat,
          msgId: netIdOf(item.id),
          fill: true,
        })
  );

/** An album's items as Telegram's grid. */
export const AlbumGrid = ({ items, api, chat }) => {
  const medias = items.map((item) => parseMessageParts(item).media);
  const rows = albumRows(medias.map((m) => m?.aspectRatio));
  return el(
    'div',
    { className: 'bubble-album' },
    rows.map((row, r) =>
      el(
        'div',
        {
          key: r,
          className: 'bubble-album-row',
          style: { aspectRatio: String(row.aspect) },
        },
        row.items.map(({ index, ratio }) =>
          el(AlbumTile, {
            key: items[index].id,
            item: items[index],
            media: medias[index],
            ratio,
            api,
            chat,
          })
        )
      )
    )
  );
};
