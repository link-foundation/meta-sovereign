// What a rich message (R-Y220; layer 232) needs to be told apart and
// quoted, without any drawing: pure, so the message parts can use it.

import { shapeText } from '../sources/telegram-instant-view-shape.js';

/** A message's rich part (what `raw.richMessage` stored), or null. */
export const richOf = (raw) =>
  raw?.richMessage && Array.isArray(raw.richMessage.blocks)
    ? raw.richMessage
    : null;

export const wordsOf = (nodes) =>
  (nodes ?? [])
    .map((node) =>
      typeof node.s === 'string' ? node.s : wordsOf(node.c ?? [])
    )
    .join('');

/**
 * The words of a reply's rich quote (`replyTo.quoteRich`, a list of
 * RichText), or '' when it has none.
 */
export const quoteRichText = (replyTo) =>
  (Array.isArray(replyTo?.quoteRich) ? replyTo.quoteRich : [])
    .map((rich) => wordsOf(shapeText(rich)))
    .join('')
    .trim();

/** The address key of a document's whole file (R-Y224): `file:<id>`. */
export const fileKey = (id, download) =>
  `${download ? 'download' : 'file'}:${id}`;

/** The pictures a shaped rich message asks for: `photo:<id>`, `document:<id>`. */
export const richFiles = (shaped) => [
  ...shaped.photos.map((id) => `photo:${id}`),
  ...shaped.documents.map((id) => `document:${id}`),
];
