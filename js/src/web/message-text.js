// A message's text with its formatting, as Telegram's apps draw it:
// bold, italic, underline, strikethrough, code, preformatted blocks,
// quotes, spoilers, links, mentions, hashtags, e-mail and phone numbers.
// Telegram sends them as entities (offset and length in UTF-16 code
// units, which is how JavaScript counts a string); other networks send
// none, so their links are found in the text. `textTree` is pure; only
// `MessageText` draws.

import React, { useState } from 'react';

const el = React.createElement;

const KINDS = {
  MessageEntityBold: 'bold',
  MessageEntityItalic: 'italic',
  MessageEntityUnderline: 'underline',
  MessageEntityStrike: 'strike',
  MessageEntityCode: 'code',
  MessageEntityPre: 'pre',
  MessageEntityBlockquote: 'quote',
  MessageEntitySpoiler: 'spoiler',
  MessageEntityTextUrl: 'link',
  MessageEntityUrl: 'url',
  MessageEntityEmail: 'email',
  MessageEntityPhone: 'phone',
  MessageEntityMention: 'mention',
  MessageEntityMentionName: 'mention-name',
  MessageEntityHashtag: 'tag',
  MessageEntityCashtag: 'tag',
  MessageEntityBotCommand: 'tag',
  MessageEntityCustomEmoji: 'emoji',
};

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/g;

// Links found in text no network marked up.
const foundLinks = (text) =>
  [...text.matchAll(URL_IN_TEXT)].map((m) => ({
    kind: 'url',
    offset: m.index,
    length: m[0].length,
  }));

const entitiesOf = (text, entities) => {
  const known = (entities ?? [])
    .map((e) => ({
      kind: KINDS[e?.className] ?? e?.kind,
      offset: Number(e?.offset),
      length: Number(e?.length),
      url: e?.url ?? null,
      language: e?.language ?? null,
      collapsed: Boolean(e?.collapsed),
    }))
    .filter(
      (e) =>
        e.kind &&
        Number.isInteger(e.offset) &&
        e.length > 0 &&
        e.offset >= 0 &&
        e.offset < text.length
    );
  return known.length > 0 ? known : foundLinks(text);
};

// Nodes of [start, end): text, and entities with their own children.
// An entity that crosses its parent's end is cut there.
const build = (text, start, end, entities) => {
  const nodes = [];
  let at = start;
  let i = 0;
  while (i < entities.length) {
    const e = entities[i];
    const stop = Math.min(e.offset + e.length, end);
    if (e.offset > at) {
      nodes.push(text.slice(at, e.offset));
    }
    const inner = [];
    i += 1;
    while (i < entities.length && entities[i].offset < stop) {
      inner.push(entities[i]);
      i += 1;
    }
    nodes.push({
      ...e,
      text: text.slice(e.offset, stop),
      children: build(text, e.offset, stop, inner),
    });
    at = Math.max(at, stop);
  }
  if (at < end) {
    nodes.push(text.slice(at, end));
  }
  return nodes;
};

/** The text as a tree: strings, and `{ kind, text, children, … }`. */
export const textTree = (text, entities) => {
  const value = String(text ?? '');
  const sorted = entitiesOf(value, entities).sort(
    (a, b) => a.offset - b.offset || b.length - a.length
  );
  return build(value, 0, value.length, sorted);
};

const SAFE = /^(https?:|mailto:|tel:)/i;

/** Where a link goes, or null when it is not a web, mail or phone link. */
export const hrefOf = (node) => {
  const target = {
    link: node.url,
    url: /^[a-z][a-z0-9+.-]*:/i.test(node.text)
      ? node.text
      : `https://${node.text}`,
    email: `mailto:${node.text}`,
    phone: `tel:${node.text.replace(/[^\d+]/g, '')}`,
    mention: `https://t.me/${node.text.replace(/^@/, '')}`,
  }[node.kind];
  return target && SAFE.test(target) ? target : null;
};

const Spoiler = ({ children }) => {
  const [open, setOpen] = useState(false);
  return el(
    'span',
    {
      className: open ? 'msg-spoiler open' : 'msg-spoiler',
      role: open ? undefined : 'button',
      tabIndex: open ? undefined : 0,
      onClick: (event) => {
        if (!open) {
          event.stopPropagation();
          setOpen(true);
        }
      },
      onKeyDown: (event) => event.key === 'Enter' && setOpen(true),
    },
    children
  );
};

const TAGS = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
  tag: 'span',
  emoji: 'span',
  'mention-name': 'span',
};

const drawNode = (node, key) => {
  if (typeof node === 'string') {
    return node;
  }
  const children = node.children.map(drawNode);
  if (node.kind === 'pre') {
    return el(
      'pre',
      { key, className: 'msg-pre' },
      el('code', { 'data-language': node.language || undefined }, children)
    );
  }
  if (node.kind === 'quote') {
    return el('blockquote', { key, className: 'msg-quote' }, children);
  }
  if (node.kind === 'spoiler') {
    return el(Spoiler, { key }, children);
  }
  const href = hrefOf(node);
  if (href) {
    return el(
      'a',
      {
        key,
        href,
        className: 'msg-link',
        target: '_blank',
        rel: 'noopener noreferrer',
        onClick: (event) => event.stopPropagation(),
      },
      children
    );
  }
  return el(
    TAGS[node.kind] ?? 'span',
    { key, className: `msg-${node.kind}` },
    children
  );
};

/** The message text, formatted. */
export const MessageText = ({ text, entities }) =>
  textTree(text, entities).map(drawNode);
