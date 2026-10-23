// The rich-text kinds a rich message or an Instant View page shares with
// the entities of a normal message (R-Y225; learned, never copied):
// hashtags, bank cards, dates, custom emoji, people by id, buttons and
// formulas. The shaping is in telegram-instant-view-shape.js; the
// renderer (chat-instant-view-render.js) calls `richKindNode`. The
// behaviour is the entities': a hashtag searches, a card copies, a date
// is worded for the viewer, a custom emoji is its picture, and nothing is
// ever pressed or sent by itself.

import React, { useEffect, useState } from 'react';
import { CustomEmoji } from './custom-emoji.js';
import { BankCard, DateEntity } from './message-text.js';
import { openTagSearch, parseTag } from './chat-tags.js';
import { cachedMath, mathMl } from './rich-math.js';

const el = React.createElement;

/**
 * A formula: KaTeX's MathML when it can be drawn, else the LaTeX as
 * written in `<code>`. The markup is set as HTML only because KaTeX made
 * it with `trust: false` (no links, no raw HTML, no styles from the
 * source) and with `output: 'mathml'`, in which every character of the
 * formula is escaped text inside `<math>` elements.
 */
export const Formula = ({ source, display = false }) => {
  const [html, setHtml] = useState(() => cachedMath(source, display));
  useEffect(() => {
    let live = true;
    setHtml(cachedMath(source, display));
    mathMl(source, display).then((next) => live && setHtml(next));
    return () => {
      live = false;
    };
  }, [source, display]);
  const Tag = display ? 'div' : 'span';
  return html
    ? el(Tag, {
        className: display ? 'iv-math-rendered' : 'iv-math-inline is-rendered',
        'data-math': 'mathml',
        title: source,
        dangerouslySetInnerHTML: { __html: html },
      })
    : el('code', { className: 'iv-math-inline', 'data-math': 'latex' }, source);
};

// A hashtag or cashtag searches (a bot command is shown, never sent).
const TagNode = ({ node, children }) => {
  if (!parseTag(node.s)) {
    return el('span', { className: 'msg-tag' }, children);
  }
  const search = (event) => {
    event.stopPropagation();
    openTagSearch(node.s);
  };
  return el(
    'span',
    {
      className: 'msg-tag msg-tag-search',
      role: 'button',
      tabIndex: 0,
      'data-tag': node.s,
      onClick: search,
      onKeyDown: (event) => event.key === 'Enter' && search(event),
    },
    children
  );
};

// A button inside the text: the context's button (the one a block row
// uses), else its words, inert.
const ButtonNode = ({ node, ctx }) =>
  el(
    'span',
    { className: 'iv-inline-button' },
    ctx.button
      ? ctx.button(node, 'b')
      : el('span', { className: 'bot-button is-inert' }, node.c?.[0]?.s ?? '')
  );

const DRAW = {
  tag: (node, kids) => el(TagNode, { node }, kids),
  bankcard: (node, kids) => el(BankCard, { node: { text: node.s } }, kids),
  date: (node, kids) =>
    el(DateEntity, { node: { ...node, text: node.s } }, kids),
  user: (node, kids) =>
    el('span', { className: 'msg-mention-name', 'data-user': node.id }, kids),
};

/** The element of an inline node of these kinds; undefined for others. */
export const richKindNode = (node, ctx, kids) => {
  if (node.t === 'math') {
    return el(Formula, { source: node.s });
  }
  if (node.t === 'emoji') {
    return ctx.api
      ? el(CustomEmoji, { id: node.id, text: node.s, api: ctx.api })
      : node.s;
  }
  if (node.t === 'button') {
    return el(ButtonNode, { node, ctx });
  }
  return DRAW[node.t]?.(node, kids);
};
