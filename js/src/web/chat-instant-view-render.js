// Draws an Instant View page tree (R-Y205; learned, never copied) with
// React elements only: the server's tree (telegram-instant-view-shape.js)
// holds plain data, never HTML. A link is drawn only for http, https, tg,
// mailto and tel; external links open in a new tab with rel=noopener.

import React from 'react';

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
  if (TAGS[node.t]) {
    return el(TAGS[node.t], { key }, kids);
  }
  if (node.t === 'anchor') {
    return el('span', { key, 'data-anchor': node.name }, kids);
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

// A video or audio is shown by its thumbnail and name; the page itself
// plays it in the browser ("Open in browser").
const fileBlock = (label) => (b, ctx) =>
  el('figure', { className: `iv-figure iv-${label}` }, [
    el(Picture, { key: 'i', id: b.id, kind: 'document', ctx }),
    el(
      'span',
      { key: 'l', className: 'iv-file-label' },
      ctx.t(`chat.iv.${label}`)
    ),
    el(Caption, { key: 'c', caption: b.caption, ctx }),
  ]);

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
    { className: 'iv-list' },
    b.items.map((item, index) =>
      el(
        'li',
        { key: index, value: orderedValue(item.num) },
        item.blocks
          ? el(Blocks, { blocks: item.blocks, ctx })
          : el(Inline, { nodes: item.c, ctx })
      )
    )
  );

const orderedValue = (num) =>
  /^\d{1,6}$/.test(num ?? '') ? Number(num) : undefined;

const quoteBlock = (tag, className) => (b, ctx) =>
  el(tag, { className }, [
    el('p', { key: 'c' }, el(Inline, { nodes: b.c, ctx })),
    hasText(b.credit)
      ? el('cite', { key: 'cr' }, el(Inline, { nodes: b.credit, ctx }))
      : null,
  ]);

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

const BLOCKS = {
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
  video: fileBlock('video'),
  audio: fileBlock('audio'),
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
