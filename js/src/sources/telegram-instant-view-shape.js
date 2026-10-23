/**
 * Instant View pages as a safe JSON tree (R-Y205; learned, never copied):
 * Telegram's `Page` (blocks of `PageBlock`, text as `RichText`) becomes
 * plain objects the page draws with React elements only. Ids are strings,
 * every link is http, https or tg (or an anchor of the same page), and
 * what is unknown or too deep is dropped.
 *
 * - `safeHref(url)` — the url if it may be linked, else null;
 * - `shapeText(rich, ctx)` — a RichText as inline nodes: `{ t: 'text', s }`,
 *   `{ t: 'b'|'i'|'u'|'s'|'code'|'sub'|'sup'|'mark', c }`, `{ t: 'a', href,
 *   c }`, `{ t: 'a', anchor, c }` (same page), `{ t: 'anchor', name, c }`,
 *   `{ t: 'img', id, w, h }`;
 * - `shapePage(page)` — `{ url, rtl, blocks, photos, documents }`, the
 *   last two the ids the page may ask the media route for.
 */

const MAX_DEPTH = 12;
const MAX_BLOCKS = 4000;
const SAFE = new Set(['http:', 'https:', 'tg:']);
const EMAIL = /^[^\s<>@]{1,64}@[^\s<>@]{1,255}$/;
const PHONE = /^\+?[\d\s().-]{3,30}$/;
const NAME = /^\S{1,128}$/;

const plain = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

/** The url if it may be linked (http, https, tg), else null. */
export const safeHref = (url) => {
  const text = plain(url).trim();
  if (text.length === 0 || text.length > 4096) {
    return null;
  }
  try {
    const parsed = new URL(text);
    if (!SAFE.has(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
};

// Layer 232 (R-Y220): rich messages use the same blocks and add some;
// they are shaped here too (see `shapeRich`).
const INLINE = {
  TextSpoiler: 'spoiler',
  TextTonAddress: 'code',
  TextBold: 'b',
  TextItalic: 'i',
  TextUnderline: 'u',
  TextStrike: 's',
  TextFixed: 'code',
  TextSubscript: 'sub',
  TextSuperscript: 'sup',
  TextMarked: 'mark',
};

const decodeSafely = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const newContext = (url = '', page = null) => ({
  url,
  photos: new Set(),
  documents: new Set(),
  files: new Map((page?.documents ?? []).map((d) => [plain(d.id), d])),
  count: 0,
});

// A link inside the page: `#name` or the page's own url with `#name`.
const anchorOf = (url, ctx) => {
  const text = plain(url);
  const hash = text.indexOf('#');
  if (hash < 0) {
    return null;
  }
  const base = text.slice(0, hash);
  const name = decodeSafely(text.slice(hash + 1));
  const own = plain(ctx.url).split('#')[0];
  return (base === '' || (own && base === own)) && NAME.test(name)
    ? name
    : null;
};

const wrap = (node, children) =>
  children.length > 0 ? [{ ...node, c: children }] : [];

const linkOf = (rich, children, ctx) => {
  const name = rich.className;
  if (name === 'TextEmail') {
    const email = plain(rich.email).trim();
    return EMAIL.test(email)
      ? wrap({ t: 'a', href: `mailto:${email}` }, children)
      : children;
  }
  if (name === 'TextPhone') {
    const phone = plain(rich.phone).trim();
    return PHONE.test(phone)
      ? wrap({ t: 'a', href: `tel:${phone.replace(/[^\d+]/g, '')}` }, children)
      : children;
  }
  const anchor = anchorOf(rich.url, ctx);
  if (anchor) {
    return wrap({ t: 'a', anchor }, children);
  }
  const href = safeHref(rich.url);
  // An unsafe link keeps its words but is no link.
  return href ? wrap({ t: 'a', href }, children) : children;
};

const imageOf = (rich, ctx) => {
  const id = plain(rich.documentId);
  if (!/^\d{1,20}$/.test(id)) {
    return [];
  }
  ctx.documents.add(id);
  return [{ t: 'img', id, w: Number(rich.w) || 0, h: Number(rich.h) || 0 }];
};

// Text with no text inside (R-Y220): a formula, a custom emoji's picture
// word.
const LEAVES = {
  TextMath: (rich) =>
    plain(rich.source) ? [{ t: 'math', s: plain(rich.source) }] : [],
  TextCustomEmoji: (rich) =>
    plain(rich.alt) ? [{ t: 'text', s: plain(rich.alt) }] : [],
};

const richNodes = (rich, ctx, depth) => {
  if (!rich || depth > MAX_DEPTH) {
    return [];
  }
  const name = rich.className;
  if (name === 'TextPlain') {
    const s = plain(rich.text);
    return s ? [{ t: 'text', s }] : [];
  }
  if (name === 'TextConcat') {
    return (rich.texts ?? []).flatMap((one) => richNodes(one, ctx, depth + 1));
  }
  if (name === 'TextImage') {
    return imageOf(rich, ctx);
  }
  if (LEAVES[name]) {
    return LEAVES[name](rich);
  }
  const children = richNodes(rich.text, ctx, depth + 1);
  if (INLINE[name]) {
    return wrap({ t: INLINE[name] }, children);
  }
  if (name === 'TextAnchor') {
    const anchor = plain(rich.name);
    return NAME.test(anchor)
      ? [{ t: 'anchor', name: anchor, c: children }]
      : children;
  }
  return ['TextUrl', 'TextEmail', 'TextPhone'].includes(name)
    ? linkOf(rich, children, ctx)
    : children;
};

/** A RichText as inline nodes (see the header). */
export const shapeText = (rich, ctx = newContext()) => richNodes(rich, ctx, 0);

const idOf = (value) => {
  const id = plain(value);
  return /^\d{1,20}$/.test(id) ? id : null;
};

const caption = (cap, ctx) => ({
  c: shapeText(cap?.text, ctx),
  credit: shapeText(cap?.credit, ctx),
});

const TEXT_BLOCKS = {
  PageBlockHeading1: 'h1',
  PageBlockHeading2: 'h2',
  PageBlockHeading3: 'h3',
  PageBlockHeading4: 'h4',
  PageBlockHeading5: 'h5',
  PageBlockHeading6: 'h6',
  PageBlockThinking: 'thinking',
  PageBlockTitle: 'title',
  PageBlockSubtitle: 'subtitle',
  PageBlockHeader: 'header',
  PageBlockSubheader: 'subheader',
  PageBlockParagraph: 'p',
  PageBlockFooter: 'footer',
  PageBlockKicker: 'kicker',
};

const photoBlock = (block, ctx) => {
  const id = idOf(block.photoId);
  if (!id) {
    return null;
  }
  ctx.photos.add(id);
  const href = block.url ? safeHref(block.url) : null;
  return {
    k: 'photo',
    id,
    caption: caption(block.caption, ctx),
    ...(href ? { href } : {}),
  };
};

const mediaBlock = (kind, block, ctx, field) => {
  const id = idOf(block[field]);
  if (!id) {
    return null;
  }
  ctx.documents.add(id);
  return {
    k: kind,
    id,
    caption: caption(block.caption, ctx),
  };
};

const embedBlock = (block, ctx) => {
  const href = block.url ? safeHref(block.url) : null;
  const poster = idOf(block.posterPhotoId);
  if (poster) {
    ctx.photos.add(poster);
  }
  return {
    k: 'embed',
    ...(href ? { href } : {}),
    ...(poster ? { poster } : {}),
    caption: caption(block.caption, ctx),
  };
};

const listItems = (items, ctx, depth, ordered) =>
  (items ?? []).map((item) => {
    const num = ordered
      ? { num: plain(item.num).slice(0, 16) || String(item.value ?? '') }
      : {};
    // A task-list item (R-Y220): `check` is its box, ticked or not.
    const check = item.checkbox ? { check: Boolean(item.checked) } : {};
    return item.blocks
      ? { ...num, ...check, blocks: shapeBlocks(item.blocks, ctx, depth + 1) }
      : { ...num, ...check, c: shapeText(item.text, ctx) };
  });

const span = (value) =>
  Number(value) > 1 ? Math.min(Number(value), 50) : undefined;

const cellOf = (cell, ctx) => ({
  c: shapeText(cell.text, ctx),
  ...(cell.header ? { header: true } : {}),
  ...(cell.alignCenter ? { center: true } : {}),
  ...(cell.alignRight ? { right: true } : {}),
  ...(cell.valignMiddle ? { vmiddle: true } : {}),
  ...(cell.valignBottom ? { vbottom: true } : {}),
  ...(span(cell.colspan) ? { colspan: span(cell.colspan) } : {}),
  ...(span(cell.rowspan) ? { rowspan: span(cell.rowspan) } : {}),
});

const tableBlock = (block, ctx) => ({
  k: 'table',
  bordered: Boolean(block.bordered),
  striped: Boolean(block.striped),
  title: shapeText(block.title, ctx),
  rows: (block.rows ?? [])
    .slice(0, 500)
    .map((row) =>
      (row.cells ?? []).slice(0, 50).map((cell) => cellOf(cell, ctx))
    ),
});

const articleOf = (one, ctx) => {
  const href = safeHref(one.url);
  if (!href) {
    return null;
  }
  const photo = idOf(one.photoId);
  if (photo) {
    ctx.photos.add(photo);
  }
  return {
    href,
    title: plain(one.title),
    description: plain(one.description),
    author: plain(one.author),
    ...(photo ? { photo } : {}),
    ...(Number(one.publishedDate) ? { date: Number(one.publishedDate) } : {}),
  };
};

const channelBlock = (block) => {
  const chat = block.channel ?? {};
  const username = plain(chat.username);
  return {
    k: 'channel',
    title: plain(chat.title),
    ...(/^[A-Za-z0-9_]{1,64}$/.test(username) ? { username } : {}),
  };
};

const mapBlock = (block, ctx) => {
  const lat = Number(block.geo?.lat);
  const lon = Number(block.geo?.long);
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? {
        k: 'map',
        lat,
        lon,
        zoom: Number(block.zoom) || 0,
        caption: caption(block.caption, ctx),
      }
    : null;
};

// Blocks that hold other blocks.
const nested = {
  PageBlockCover: (b, ctx, d) => {
    const inner = shapeBlock(b.cover, ctx, d + 1);
    return inner ? { k: 'cover', block: inner } : null;
  },
  PageBlockEmbedPost: (b, ctx, d) => ({
    k: 'embedpost',
    ...(safeHref(b.url) ? { href: safeHref(b.url) } : {}),
    author: plain(b.author),
    date: Number(b.date) || 0,
    blocks: shapeBlocks(b.blocks, ctx, d + 1),
    caption: caption(b.caption, ctx),
  }),
  PageBlockCollage: (b, ctx, d) => ({
    k: 'collage',
    items: shapeBlocks(b.items, ctx, d + 1),
    caption: caption(b.caption, ctx),
  }),
  PageBlockSlideshow: (b, ctx, d) => ({
    k: 'slideshow',
    items: shapeBlocks(b.items, ctx, d + 1),
    caption: caption(b.caption, ctx),
  }),
  PageBlockDetails: (b, ctx, d) => ({
    k: 'details',
    open: Boolean(b.open),
    title: shapeText(b.title, ctx),
    blocks: shapeBlocks(b.blocks, ctx, d + 1),
  }),
  PageBlockList: (b, ctx, d) => ({
    k: 'list',
    ordered: false,
    items: listItems(b.items, ctx, d, false),
  }),
  PageBlockOrderedList: (b, ctx, d) => ({
    k: 'list',
    ordered: true,
    ...(Number.isInteger(Number(b.start)) && b.start !== undefined
      ? { start: Number(b.start) }
      : {}),
    ...(b.reversed ? { reversed: true } : {}),
    items: listItems(b.items, ctx, d, true),
  }),
  PageBlockBlockquoteBlocks: (b, ctx, d) => ({
    k: 'quoteblocks',
    blocks: shapeBlocks(b.blocks, ctx, d + 1),
    credit: shapeText(b.caption, ctx),
  }),
};

// A button of a rich message's row (R-Y220): its words, what pressing
// it does (the raw `type`, read by the page like an inline keyboard's)
// and its colour.
const BUTTON_TYPE_KEYS = [
  'className',
  'url',
  'data',
  'requiresPassword',
  'query',
  'samePeer',
  'userId',
  'copyText',
  'buttonId',
];
const pageButton = (one, ctx) => {
  const type = {};
  for (const key of BUTTON_TYPE_KEYS) {
    if (one.type?.[key] !== undefined && one.type[key] !== null) {
      type[key] = one.type[key];
    }
  }
  const style = one.style ?? {};
  return {
    c: shapeText(one.text, ctx),
    type,
    style: {
      bgPrimary: Boolean(style.bgPrimary),
      bgDanger: Boolean(style.bgDanger),
      bgSuccess: Boolean(style.bgSuccess),
    },
  };
};

const buttonRow = (b, ctx) => ({
  k: 'buttons',
  align: b.alignRight ? 'right' : b.alignCenter ? 'center' : 'left',
  buttons: (b.buttons ?? []).slice(0, 20).map((one) => pageButton(one, ctx)),
});

// A file of a rich message: its name and size from the message's documents.
const fileBlock = (b, ctx) => {
  const id = idOf(b.documentId);
  if (!id) {
    return null;
  }
  ctx.documents.add(id);
  const doc = ctx.files.get(id);
  const named = (doc?.attributes ?? []).find((a) => a?.fileName);
  return {
    k: 'file',
    id,
    name: plain(named?.fileName).slice(0, 255),
    mime: plain(doc?.mimeType).slice(0, 100),
    size: Number(plain(doc?.size)) || 0,
    caption: caption(b.caption, ctx),
  };
};

const flat = {
  PageBlockMath: (b) =>
    plain(b.source) ? { k: 'math', source: plain(b.source) } : null,
  PageBlockButtonRow: buttonRow,
  PageBlockDocument: fileBlock,
  PageBlockPreformatted: (b, ctx) => ({
    k: 'pre',
    c: shapeText(b.text, ctx),
    language: plain(b.language).slice(0, 32),
  }),
  PageBlockAuthorDate: (b, ctx) => ({
    k: 'authordate',
    c: shapeText(b.author, ctx),
    date: Number(b.publishedDate) || 0,
  }),
  PageBlockDivider: () => ({ k: 'divider' }),
  PageBlockAnchor: (b) =>
    NAME.test(plain(b.name)) ? { k: 'anchor', name: plain(b.name) } : null,
  PageBlockBlockquote: (b, ctx) => ({
    k: 'quote',
    ...(b.collapsed ? { collapsed: true } : {}),
    c: shapeText(b.text, ctx),
    credit: shapeText(b.caption, ctx),
  }),
  PageBlockPullquote: (b, ctx) => ({
    k: 'pullquote',
    c: shapeText(b.text, ctx),
    credit: shapeText(b.caption, ctx),
  }),
  PageBlockPhoto: photoBlock,
  PageBlockVideo: (b, ctx) => mediaBlock('video', b, ctx, 'videoId'),
  PageBlockAudio: (b, ctx) => mediaBlock('audio', b, ctx, 'audioId'),
  PageBlockEmbed: embedBlock,
  PageBlockChannel: channelBlock,
  PageBlockTable: tableBlock,
  PageBlockMap: mapBlock,
  PageBlockRelatedArticles: (b, ctx) => ({
    k: 'related',
    title: shapeText(b.title, ctx),
    articles: (b.articles ?? [])
      .slice(0, 50)
      .map((one) => articleOf(one, ctx))
      .filter(Boolean),
  }),
};

function shapeBlock(block, ctx, depth) {
  if (!block || depth > MAX_DEPTH || ctx.count >= MAX_BLOCKS) {
    return null;
  }
  ctx.count += 1;
  const name = block.className;
  if (TEXT_BLOCKS[name]) {
    return { k: TEXT_BLOCKS[name], c: shapeText(block.text, ctx) };
  }
  if (nested[name]) {
    return nested[name](block, ctx, depth);
  }
  return flat[name] ? flat[name](block, ctx) : null;
}

function shapeBlocks(blocks, ctx, depth) {
  return (blocks ?? [])
    .map((block) => shapeBlock(block, ctx, depth))
    .filter(Boolean);
}

/**
 * A Page as `{ url, rtl, blocks, photos, documents }`; `photos` and
 * `documents` list the ids (strings) the page uses.
 */
export const shapePage = (page) => {
  const ctx = newContext(plain(page?.url), page);
  const blocks = shapeBlocks(page?.blocks, ctx, 0);
  return {
    url: ctx.url,
    rtl: Boolean(page?.rtl),
    blocks,
    photos: [...ctx.photos],
    documents: [...ctx.documents],
  };
};

/**
 * A message's `rich_message` (R-Y220) as `{ rtl, part, blocks, photos,
 * documents }`: the blocks of an Instant View page, with the same safety
 * (see `shapePage`); `part` marks an answer still being written.
 */
export const shapeRich = (rich) => {
  const ctx = newContext('', rich);
  const blocks = shapeBlocks(rich?.blocks, ctx, 0);
  return {
    rtl: Boolean(rich?.rtl),
    part: Boolean(rich?.part),
    blocks,
    photos: [...ctx.photos],
    documents: [...ctx.documents],
  };
};

// The words of shaped blocks, one line per block (a list item, a button).
const wordsOf = (node, out) => {
  if (Array.isArray(node)) {
    node.forEach((one) => wordsOf(one, out));
  } else if (node && typeof node === 'object') {
    if (typeof node.s === 'string') {
      out.push(node.s);
    }
    for (const key of [
      'c',
      'items',
      'blocks',
      'buttons',
      'title',
      'credit',
      'caption',
    ]) {
      if (node[key] !== undefined) {
        wordsOf(node[key], out);
      }
    }
    if (typeof node.source === 'string') {
      out.push(node.source);
    }
    if (!node.t) {
      out.push('\n');
    }
  }
};

/** A rich message as plain text, for the chat list, search and notices. */
export const richPlainText = (rich, limit = 4000) => {
  const out = [];
  wordsOf(shapeRich(rich).blocks, out);
  return out
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, limit);
};
