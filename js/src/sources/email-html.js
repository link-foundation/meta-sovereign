/**
 * A mail's HTML as safe data (R-Z5; learned, never copied).
 *
 * HTML from the outside is never rendered. It is read into a small tree
 * of plain data (text, a few formatting tags, tables, lists, links, and
 * inline pictures that name a part of the same mail by `cid`) and the
 * page draws that tree with React elements only (../web/chat-email-body.js).
 * Everything else is dropped on the way in: scripts, styles, forms,
 * frames, event handlers, inline CSS, remote pictures (they would tell
 * the sender that the mail was read) and links that are not http, https,
 * mailto or tel. The plain-text form of a mail is made from the same tree.
 */

import { visitHtml } from '../markup/parse.js';

const SKIP_CONTENT = new Set([
  'script',
  'style',
  'head',
  'title',
  'template',
  'iframe',
  'object',
  'embed',
  'noscript',
  'svg',
  'math',
  'select',
  'textarea',
  'button',
]);
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'wbr']);
const KEEP = new Set([
  'p',
  'div',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'b',
  'i',
  'u',
  's',
  'code',
  'sub',
  'sup',
  'small',
  'br',
  'hr',
  'a',
  'img',
]);
const RENAME = {
  strong: 'b',
  em: 'i',
  strike: 's',
  del: 's',
  ins: 'u',
  tt: 'code',
  center: 'div',
  section: 'div',
  article: 'div',
  header: 'div',
  footer: 'div',
  main: 'div',
  aside: 'div',
  nav: 'div',
  figure: 'div',
  address: 'div',
  dl: 'div',
  dd: 'div',
  dt: 'div',
  form: 'div',
  fieldset: 'div',
  details: 'div',
  summary: 'div',
  caption: 'div',
};
const TABLE_PARTS = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'ul',
  'ol',
]);
const BLOCKS = new Set([
  'p',
  'div',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'tr',
  'hr',
]);
const MAX_NODES = 6000;
const MAX_DEPTH = 40;

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  deg: '°',
  times: '×',
  larr: '←',
  rarr: '→',
};

const fromCodePoint = (code) => {
  try {
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : '';
  } catch {
    return '';
  }
};

export const decodeEntities = (text) =>
  String(text ?? '').replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi,
    (all, e) => {
      if (e[0] === '#') {
        const hex = e[1] === 'x' || e[1] === 'X';
        return fromCodePoint(
          Number.parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10)
        );
      }
      return ENTITIES[e.toLowerCase()] ?? all;
    }
  );

const SAFE_HREF = /^(?:https?:|mailto:|tel:)/i;

/** An address the page may open, or null. */
export const safeHref = (href) => {
  const text = [...String(href ?? '')]
    .filter((c) => c.charCodeAt(0) > 32 && c.charCodeAt(0) !== 127)
    .join('')
    .slice(0, 2000);
  return SAFE_HREF.test(text) ? text : null;
};

const span = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 1 ? Math.min(n, 20) : undefined;
};

const elementNode = (tag, attrs) => {
  if (tag === 'a') {
    return { t: 'a', href: safeHref(attrs.href), c: [] };
  }
  if (tag === 'td' || tag === 'th') {
    return {
      t: tag,
      ...(span(attrs.colspan) ? { colSpan: span(attrs.colspan) } : {}),
      ...(span(attrs.rowspan) ? { rowSpan: span(attrs.rowspan) } : {}),
      c: [],
    };
  }
  return { t: tag, c: [] };
};

const imageNode = (attrs) => {
  const src = String(attrs.src ?? '').trim();
  const cid = /^cid:/i.test(src)
    ? decodeURIComponent_(src.slice(4)).replace(/^<|>$/g, '')
    : null;
  if (cid) {
    return { t: 'img', cid, alt: String(attrs.alt ?? '').slice(0, 200) };
  }
  // A remote picture is not loaded: only what it says instead.
  return attrs.alt ? { t: 'text', s: `[${attrs.alt.slice(0, 200)}]` } : null;
};

function decodeURIComponent_(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

const collapse = (text) => text.replace(/[ \t\r\n\f]+/g, ' ');

const makeBuilder = () => {
  const root = { t: 'root', c: [] };
  const stack = [root];
  let count = 0;
  let overflow = false;
  const top = () => stack.at(-1);
  const add = (node) => {
    count += 1;
    if (count > MAX_NODES) {
      overflow = true;
      return false;
    }
    top().c.push(node);
    return true;
  };
  const text = (raw) => {
    const inPre = stack.some((n) => n.t === 'pre');
    let s = decodeEntities(raw);
    s = inPre ? s.replace(/\r\n?/g, '\n') : collapse(s);
    if (!s || (TABLE_PARTS.has(top().t) && !s.trim())) {
      return;
    }
    add({ t: 'text', s });
  };
  const open = (tag, attrs) => {
    if (tag === 'img') {
      const node = imageNode(attrs);
      return node ? add(node) : undefined;
    }
    if (tag === 'br' || tag === 'hr') {
      return add({ t: tag });
    }
    if (VOID.has(tag)) {
      return undefined;
    }
    const node = elementNode(tag, attrs);
    if (stack.length >= MAX_DEPTH || !add(node)) {
      return undefined;
    }
    stack.push(node);
    return undefined;
  };
  const close = (tag) => {
    for (let i = stack.length - 1; i > 0; i -= 1) {
      if (stack[i].t === tag) {
        stack.length = i;
        return;
      }
    }
  };
  return { root, text, open, close, over: () => overflow };
};

// What a tag becomes: kept, renamed, or null (its children are kept alone).
const keptTag = (tag) => {
  const name = RENAME[tag] ?? tag;
  return KEEP.has(name) ? name : null;
};

const feed = (builder, html) => {
  let skipped = 0;
  visitHtml(html, {
    ontext(text) {
      if (!skipped) {
        builder.text(text);
      }
    },
    onopentag(tag, attrs) {
      if (skipped || SKIP_CONTENT.has(tag)) {
        skipped += 1;
        return;
      }
      const kept = keptTag(tag);
      if (kept) {
        builder.open(
          kept,
          Object.fromEntries(
            Object.entries(attrs).map(([key, value]) => [
              key,
              decodeEntities(value),
            ])
          )
        );
      }
    },
    onclosetag(tag) {
      if (skipped) {
        skipped -= 1;
        return;
      }
      const kept = keptTag(tag);
      if (kept) {
        builder.close(kept);
      }
    },
  });
};

// ---- Plain text from the tree ---------------------------------------------

const linesOf = (nodes, state) => {
  let out = '';
  for (const node of nodes) {
    out += textOf(node, state);
  }
  return out;
};

const anchorText = (node, state) => {
  const inner = linesOf(node.c, state);
  return node.href && !/^mailto:/i.test(node.href) && inner.trim() !== node.href
    ? `${inner} (${node.href})`
    : inner;
};

const quoteText = (node, state) =>
  `\n${linesOf(node.c, state)
    .trim()
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')}\n`;

const cellText = (node, state) => `${linesOf(node.c, state).trim()}\t`;

const TEXT_OF = {
  text: (node) => node.s,
  br: () => '\n',
  hr: () => '\n--\n',
  img: (node) => (node.alt ? `[${node.alt}]` : ''),
  a: anchorText,
  li: (node, state) => `\n${state.bullet} ${linesOf(node.c, state).trim()}`,
  td: cellText,
  th: cellText,
  blockquote: quoteText,
};

function textOf(node, state) {
  const handler = TEXT_OF[node.t];
  if (handler) {
    return handler(node, state);
  }
  return BLOCKS.has(node.t)
    ? `\n${linesOf(node.c, state)}\n`
    : linesOf(node.c ?? [], state);
}

const NBSP = String.fromCharCode(160);

const tidy = (text) =>
  text
    .replaceAll(NBSP, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\t+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Overflow still uses the same tokenizer and content exclusions; no second
// regex sanitizer with subtly different handling of malformed closing tags.
const plainText = (html) => {
  const chunks = [];
  const line = (tag) => {
    if (BLOCKS.has(tag) || tag === 'br') {
      chunks.push('\n');
    }
  };
  feed(
    {
      text: (raw) => chunks.push(decodeEntities(raw)),
      open: line,
      close: line,
    },
    html
  );
  return tidy(chunks.join('').replace(/[ \t]+/g, ' '));
};

/**
 * `{ tree, text }`: the safe tree of `html` (null when it is too big to
 * keep) and its plain-text form.
 */
export const htmlToSafe = (html) => {
  const builder = makeBuilder();
  feed(builder, String(html ?? ''));
  if (builder.over()) {
    return { tree: null, text: plainText(html) };
  }
  const text = tidy(linesOf(builder.root.c, { bullet: '•' }));
  return { tree: builder.root.c, text };
};

export const htmlToText = (html) => htmlToSafe(html).text;
