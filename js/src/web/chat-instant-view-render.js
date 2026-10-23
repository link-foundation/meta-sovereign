// Draws an Instant View page tree (R-Y205; learned, never copied) with
// React elements only: the server's tree (telegram-instant-view-shape.js)
// holds plain data, never HTML. A link is drawn only for http, https, tg,
// mailto and tel; external links open in a new tab with rel=noopener. The
// one exception to "elements only" is a formula's MathML (rich-text-nodes.js
// explains why that is safe). The entity-like kinds (R-Y225) are drawn there.

import React, { useState } from 'react';
import { Formula, richKindNode } from './rich-text-nodes.js';

const el = React.createElement;

const SAFE_LINK = /^(?:https?|tg|mailto|tel):/i;

/** The href to draw, or null when it is not one of the safe kinds. */
export const linkOf = (href) => {
  const text = String(href ?? '');
  return SAFE_LINK.test(text) && !/[\s<>"]/.test(text) ? text : null;
};

const TAGS = {
  b: 'strong',
  i: 'em',
  u: 'u',
  s: 's',
  code: 'code',
  sub: 'sub',
  sup: 'sup',
  mark: 'mark',
};

// ---- Text -----------------------------------------------------------------

export const Inline = ({ nodes, ctx }) =>
  (nodes ?? []).map((node, index) => inlineOne(node, ctx, index));

function inlineOne(node, ctx, key) {
  if (node.t === 'text') {
    return el(React.Fragment, { key }, node.s);
  }
  const kids = el(Inline, { nodes: node.c, ctx });
  const rich = richKindNode(node, ctx, kids);
  if (rich !== undefined) {
    return el(React.Fragment, { key }, rich);
  }
  if (TAGS[node.t]) {
    return el(TAGS[node.t], { key }, kids);
  }
  if (node.t === 'anchor') {
    return el('span', { key, 'data-anchor': node.name }, kids);
  }
  if (node.t === 'spoiler') {
    return el(Spoiler, { key }, kids);
  }
  if (node.t === 'img') {
    const src = ctx.media('document', node.id);
    return src
      ? el('img', {
          key,
          src,
          alt: '',
          className: 'iv-inline-img',
          width: node.w || undefined,
          height: node.h || undefined,
        })
      : null;
  }
  if (node.t === 'a') {
    return linkNode(node, ctx, key, kids);
  }
  return null;
}

// Hidden words (R-Y220) until clicked.
const Spoiler = ({ children }) => {
  const [open, setOpen] = useState(false);
  return el(
    'span',
    {
      className: open ? 'iv-spoiler is-open' : 'iv-spoiler',
      onClick: () => setOpen(true),
    },
    children
  );
};

function linkNode(node, ctx, key, kids) {
  if (node.anchor) {
    return el(
      'a',
      {
        key,
        href: `#${node.anchor}`,
        className: 'iv-link',
        onClick: (event) => {
          event.preventDefault();
          ctx.scrollTo(node.anchor);
        },
      },
      kids
    );
  }
  const href = linkOf(node.href);
  return href
    ? el(
        'a',
        {
          key,
          href,
          className: 'iv-link',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        kids
      )
    : el(React.Fragment, { key }, kids);
}

const hasText = (nodes) => Array.isArray(nodes) && nodes.length > 0;

const Caption = ({ caption, ctx }) =>
  hasText(caption?.c) || hasText(caption?.credit)
    ? el('figcaption', { className: 'iv-caption' }, [
        hasText(caption.c)
          ? el('span', { key: 'c' }, el(Inline, { nodes: caption.c, ctx }))
          : null,
        hasText(caption.credit)
          ? el(
              'cite',
              { key: 'cr', className: 'iv-credit' },
              el(Inline, { nodes: caption.credit, ctx })
            )
          : null,
      ])
    : null;

// ---- Blocks ---------------------------------------------------------------

const textBlock = (tag, className) => (b, ctx) =>
  el(tag, { className }, el(Inline, { nodes: b.c, ctx }));

const dateText = (seconds, ctx) =>
  seconds
    ? new Date(seconds * 1000).toLocaleDateString(ctx.locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

const Picture = ({ id, kind, ctx, className = 'iv-img' }) => {
  const src = ctx.media(kind, id);
  return src
    ? el('img', {
        src,
        alt: ctx.t('chat.iv.picture'),
        className,
        loading: 'lazy',
      })
    : null;
};

const photoBlock = (b, ctx) => {
  const img = el(Picture, { id: b.id, kind: 'photo', ctx });
  const href = linkOf(b.href);
  return el('figure', { className: 'iv-figure' }, [
    href && /^https?:/i.test(href)
      ? el(
          'a',
          { key: 'i', href, target: '_blank', rel: 'noopener noreferrer' },
          img
        )
      : el(React.Fragment, { key: 'i' }, img),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);
};

// A download link for a document (R-Y224; learned, never copied): the
// context builds the address (`ctx.file(id, download)`), a click always
// saves, whatever the automatic-download settings say. Nothing when the
// context has no file route.
const DownloadLink = ({ b, ctx }) => {
  const href = ctx.file?.(b.id, true) ?? null;
  return href
    ? el(
        'a',
        {
          className: 'iv-file-download',
          href,
          download: b.name || '',
          'data-download': b.id,
        },
        ctx.t('chat.iv.download')
      )
    : null;
};

// A video or an audio plays in the page: the player asks nothing until
// played (preload none, no autoplay) and Telegram's bytes come by range
// through the context's file route; its thumbnail is the poster.
const playerBlock = (label) => (b, ctx) => {
  const src = ctx.file?.(b.id, false) ?? null;
  const poster = label === 'video' ? ctx.media('document', b.id) : null;
  const player = src
    ? el(label, {
        key: 'p',
        className: `iv-player iv-${label}-player`,
        controls: true,
        preload: 'none',
        src,
        ...(poster ? { poster } : {}),
        'data-player': label,
      })
    : null;
  return el('figure', { className: `iv-figure iv-${label}` }, [
    player ?? el(Picture, { key: 'i', id: b.id, kind: 'document', ctx }),
    el(
      'span',
      { key: 'l', className: 'iv-file-label' },
      b.name || ctx.t(`chat.iv.${label}`)
    ),
    el(DownloadLink, { key: 'd', b, ctx }),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);
};

const cardLink = (href, label, extra) => {
  const safe = linkOf(href);
  return safe
    ? el(
        'a',
        {
          className: 'iv-card',
          href: safe,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        [el('span', { key: 'l', className: 'iv-card-title' }, label), extra]
      )
    : el('span', { className: 'iv-card' }, label);
};

const embedBlock = (b, ctx) =>
  el('figure', { className: 'iv-figure iv-embed' }, [
    el(
      React.Fragment,
      { key: 'k' },
      cardLink(b.href, b.href ?? ctx.t('chat.iv.openEmbed'), null)
    ),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);

const listBlock = (b, ctx) =>
  el(
    b.ordered ? 'ol' : 'ul',
    {
      className: 'iv-list',
      start: b.start,
      reversed: b.reversed || undefined,
    },
    b.items.map((item, index) =>
      el(
        'li',
        {
          key: index,
          value: orderedValue(item.num),
          className: item.check === undefined ? undefined : 'iv-task',
        },
        [
          item.check === undefined
            ? null
            : el('input', {
                key: 'box',
                type: 'checkbox',
                checked: item.check,
                disabled: true,
                readOnly: true,
                className: 'iv-task-box',
              }),
          item.blocks
            ? el(Blocks, { key: 'b', blocks: item.blocks, ctx })
            : el(Inline, { key: 'i', nodes: item.c, ctx }),
        ]
      )
    )
  );

const orderedValue = (num) =>
  /^\d{1,6}$/.test(num ?? '') ? Number(num) : undefined;

const quoteBlock = (tag, className) => (b, ctx) =>
  el(
    tag,
    { className: b.collapsed ? `${className} iv-collapsed` : className },
    [
      el('p', { key: 'c' }, el(Inline, { nodes: b.c, ctx })),
      hasText(b.credit)
        ? el('cite', { key: 'cr' }, el(Inline, { nodes: b.credit, ctx }))
        : null,
    ]
  );

const gridBlock = (className) => (b, ctx) =>
  el('figure', { className: `iv-figure ${className}` }, [
    el(
      'div',
      { key: 'g', className: 'iv-grid' },
      el(Blocks, { blocks: b.items, ctx })
    ),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);

const tableBlock = (b, ctx) =>
  el('div', { className: 'iv-table-wrap' }, [
    hasText(b.title)
      ? el(
          'p',
          { key: 't', className: 'iv-table-title' },
          el(Inline, { nodes: b.title, ctx })
        )
      : null,
    el(
      'table',
      {
        key: 'tb',
        className: `iv-table${b.bordered ? ' iv-bordered' : ''}${b.striped ? ' iv-striped' : ''}`,
      },
      el(
        'tbody',
        null,
        b.rows.map((row, r) =>
          el(
            'tr',
            { key: r },
            row.map((cell, c) => cellNode(cell, ctx, c))
          )
        )
      )
    ),
  ]);

const cellNode = (cell, ctx, key) =>
  el(
    cell.header ? 'th' : 'td',
    {
      key,
      colSpan: cell.colspan,
      rowSpan: cell.rowspan,
      style: {
        textAlign: cell.center ? 'center' : cell.right ? 'right' : undefined,
        verticalAlign: cell.vbottom
          ? 'bottom'
          : cell.vmiddle
            ? 'middle'
            : undefined,
      },
    },
    el(Inline, { nodes: cell.c, ctx })
  );

const detailsBlock = (b, ctx) =>
  el('details', { className: 'iv-details', open: b.open || undefined }, [
    el('summary', { key: 's' }, el(Inline, { nodes: b.title, ctx })),
    el('div', { key: 'b' }, el(Blocks, { blocks: b.blocks, ctx })),
  ]);

const relatedBlock = (b, ctx) =>
  el('section', { className: 'iv-related' }, [
    hasText(b.title)
      ? el('h3', { key: 't' }, el(Inline, { nodes: b.title, ctx }))
      : null,
    ...b.articles.map((one, index) =>
      el(React.Fragment, { key: index }, relatedCard(one, ctx))
    ),
  ]);

const relatedCard = (one, ctx) => {
  const href = linkOf(one.href);
  if (!href) {
    return null;
  }
  return el(
    'a',
    {
      className: 'iv-card iv-article',
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    [
      one.photo
        ? el(Picture, {
            key: 'p',
            id: one.photo,
            kind: 'photo',
            ctx,
            className: 'iv-article-img',
          })
        : null,
      el('span', { key: 't', className: 'iv-card-text' }, [
        el('strong', { key: 'h' }, one.title || one.href),
        one.description ? el('span', { key: 'd' }, one.description) : null,
        one.author ? el('small', { key: 'a' }, one.author) : null,
      ]),
    ]
  );
};

const mapHref = (b) =>
  `https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lon}#map=${Math.min(Math.max(b.zoom || 14, 1), 19)}/${b.lat}/${b.lon}`;

const mapBlock = (b, ctx) =>
  el('figure', { className: 'iv-figure iv-map' }, [
    el(
      React.Fragment,
      { key: 'k' },
      cardLink(mapHref(b), ctx.t('chat.iv.openMap'), null)
    ),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);

const channelBlock = (b, ctx) =>
  cardLink(
    b.username ? `https://t.me/${b.username}` : null,
    b.title || ctx.t('chat.iv.openChannel'),
    null
  );

const embedPostBlock = (b, ctx) =>
  el('figure', { className: 'iv-figure iv-embedpost' }, [
    el('header', { key: 'h' }, [
      el('strong', { key: 'a' }, b.author),
      b.date ? el('small', { key: 'd' }, ` ${dateText(b.date, ctx)}`) : null,
    ]),
    el('div', { key: 'b' }, el(Blocks, { blocks: b.blocks, ctx })),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);

// ---- Rich messages (R-Y220) -------------------------------------------

// What a model is "thinking", folded away until opened.
const thinkingBlock = (b, ctx) =>
  el('details', { className: 'iv-thinking', 'data-block': 'thinking' }, [
    el('summary', { key: 's' }, ctx.t('chat.rich.thinking')),
    el('div', { key: 'b' }, el(Inline, { nodes: b.c, ctx })),
  ]);

// A formula in a block of its own: typeset, else its LaTeX as written.
const mathBlock = (b) =>
  el(
    'div',
    { className: 'iv-math', 'data-block': 'math' },
    el(Formula, { source: b.source, display: true })
  );

const quoteBlocksBlock = (b, ctx) =>
  el('blockquote', { className: 'iv-quote' }, [
    el('div', { key: 'b' }, el(Blocks, { blocks: b.blocks, ctx })),
    hasText(b.credit)
      ? el('cite', { key: 'cr' }, el(Inline, { nodes: b.credit, ctx }))
      : null,
  ]);

const buttonsBlock = (b, ctx) =>
  el(
    'div',
    {
      className: `iv-buttons is-${b.align}`,
      'data-block': 'buttons',
    },
    b.buttons.map((button, index) =>
      el(
        React.Fragment,
        { key: index },
        ctx.button ? ctx.button(button, index) : null
      )
    )
  );

const sizeText = (bytes) => {
  if (!bytes) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let at = 0;
  while (value >= 1024 && at < units.length - 1) {
    value /= 1024;
    at += 1;
  }
  return `${at === 0 ? value : value.toFixed(1)} ${units[at]}`;
};

// A file: its name and size (and a picture, when it is one).
const fileRowBlock = (b, ctx) =>
  el('figure', { className: 'iv-figure iv-file', 'data-block': 'file' }, [
    /^image\//.test(b.mime ?? '')
      ? el(Picture, { key: 'i', id: b.id, kind: 'document', ctx })
      : null,
    el('span', { key: 'n', className: 'iv-file-name' }, b.name || b.mime),
    b.size
      ? el('small', { key: 's', className: 'iv-file-size' }, sizeText(b.size))
      : null,
    el(DownloadLink, { key: 'd', b, ctx }),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);

const headingBlock = (level) => textBlock(`h${level}`, `iv-h iv-h${level}`);

const BLOCKS = {
  h1: headingBlock(1),
  h2: headingBlock(2),
  h3: headingBlock(3),
  h4: headingBlock(4),
  h5: headingBlock(5),
  h6: headingBlock(6),
  thinking: thinkingBlock,
  math: mathBlock,
  quoteblocks: quoteBlocksBlock,
  buttons: buttonsBlock,
  file: fileRowBlock,
  title: textBlock('h1', 'iv-title'),
  subtitle: textBlock('p', 'iv-subtitle'),
  header: textBlock('h2', 'iv-header'),
  subheader: textBlock('h3', 'iv-subheader'),
  p: textBlock('p', 'iv-p'),
  footer: textBlock('p', 'iv-footer'),
  kicker: textBlock('p', 'iv-kicker'),
  pre: (b, ctx) =>
    el(
      'pre',
      { className: 'iv-pre', 'data-language': b.language || undefined },
      el('code', null, el(Inline, { nodes: b.c, ctx }))
    ),
  authordate: (b, ctx) =>
    el('p', { className: 'iv-authordate' }, [
      el(Inline, { key: 'a', nodes: b.c, ctx }),
      b.date ? el('span', { key: 'd' }, ` · ${dateText(b.date, ctx)}`) : null,
    ]),
  divider: () => el('hr', { className: 'iv-divider' }),
  anchor: (b) => el('span', { className: 'iv-anchor', 'data-anchor': b.name }),
  list: listBlock,
  quote: quoteBlock('blockquote', 'iv-quote'),
  pullquote: quoteBlock('blockquote', 'iv-pullquote'),
  photo: photoBlock,
  video: playerBlock('video'),
  audio: playerBlock('audio'),
  cover: (b, ctx) => el(Blocks, { blocks: [b.block], ctx }),
  embed: embedBlock,
  embedpost: embedPostBlock,
  collage: gridBlock('iv-collage'),
  slideshow: gridBlock('iv-slideshow'),
  channel: channelBlock,
  table: tableBlock,
  details: detailsBlock,
  related: relatedBlock,
  map: mapBlock,
};

export const Blocks = ({ blocks, ctx }) =>
  (blocks ?? []).map((block, index) => {
    const draw = BLOCKS[block.k];
    return draw ? el(React.Fragment, { key: index }, draw(block, ctx)) : null;
  });
