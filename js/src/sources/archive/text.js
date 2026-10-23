/**
 * Text repairs shared by the data-archive importers (R-Z10).
 */

const FFFD = '�';

/**
 * Facebook / Instagram JSON exports write UTF-8 bytes as if each byte
 * were a latin-1 character ("Ð\u0098" for "И"). Decode only when the
 * text is all single-byte characters AND the bytes are valid UTF-8 that
 * encodes back to the same bytes, so honest latin-1 text is never damaged.
 */
export const fixMojibake = (value) => {
  if (typeof value !== 'string' || !/[\u0080-\u00ff]/.test(value)) {
    return value;
  }
  if ([...value].some((c) => c.codePointAt(0) > 0xff)) {
    return value;
  }
  const bytes = Uint8Array.from(value, (c) => c.charCodeAt(0));
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
  const again = new TextEncoder().encode(decoded);
  const same =
    again.length === bytes.length && again.every((b, i) => b === bytes[i]);
  return same && !decoded.includes(FFFD) ? decoded : value;
};

/** `fixMojibake` over every string inside a parsed JSON value. */
export const fixDeep = (value) => {
  if (typeof value === 'string') {
    return fixMojibake(value);
  }
  if (Array.isArray(value)) {
    return value.map(fixDeep);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fixDeep(item)])
    );
  }
  return value;
};

/**
 * A short stable hex digest (cyrb53, 53 bits), for parts of ids that may
 * hold odd text. Pure JS so the module also loads in the page.
 */
export const shortHash = (text) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(16)
    .padStart(14, '0');
};

/** The last path segment ("a/b/c.jpg" -> "c.jpg"), "/" or "\\" separated. */
export const baseName = (p) =>
  String(p).split(/[\\/]/).filter(Boolean).at(-1) ?? '';

/** The extension with its dot, lower case ("c.JPG" -> ".jpg"), or "". */
export const extName = (p) => {
  const m = /\.[^./\\]+$/.exec(baseName(p));
  return m ? m[0].toLowerCase() : '';
};

/** ISO text for an epoch (ms) or a date string; null when unreadable. */
export const isoOf = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'string' && /^\d+$/.test(value);
  const date = new Date(numeric ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// "2026-01-01 10:00:00 UTC" is UTC; a time that names no zone is read in
// this machine's time zone (like WhatsApp and VK exports); other shapes
// fall back to Date.parse.
const STAMP =
  /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?\s*(UTC|GMT|Z)?$/i;

/** ISO text for a LinkedIn export date; null when unreadable. */
export const linkedinDate = (text) => {
  const m = STAMP.exec(String(text ?? '').trim());
  if (m) {
    const parts = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)];
    return (
      m[7] ? new Date(Date.UTC(...parts)) : new Date(...parts)
    ).toISOString();
  }
  return isoOf(String(text ?? '').trim());
};

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const point =
        code[1].toLowerCase() === 'x'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);
const TOKEN =
  /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const attributesOf = (source) => {
  const attrs = {};
  for (const a of source.matchAll(ATTRIBUTE)) {
    attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3]);
  }
  return attrs;
};

/**
 * A tiny HTML reader for the data exports (no dependency): a tree of
 * `{tag, attrs, children}` and text strings. Tolerant: stray end tags
 * are ignored, unclosed tags are closed at the end.
 */
export const parseHtml = (html) => {
  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  for (const m of html.matchAll(TOKEN)) {
    const top = stack.at(-1);
    if (m[4] !== undefined) {
      top.children.push(decodeEntities(m[4]));
    } else if (m[2] && m[1]) {
      const at = stack.map((n) => n.tag).lastIndexOf(m[2].toLowerCase());
      if (at > 0) {
        stack.length = at;
      }
    } else if (m[2]) {
      const node = {
        tag: m[2].toLowerCase(),
        attrs: attributesOf(m[3]),
        children: [],
      };
      top.children.push(node);
      if (!VOID.has(node.tag) && !m[3].trimEnd().endsWith('/')) {
        stack.push(node);
      }
    }
  }
  return root;
};

export const hasClass = (node, names) => {
  const classes = (node?.attrs?.class ?? '').split(/\s+/);
  return names.some((name) => classes.includes(name));
};

/** Every element under `node` (depth-first) accepted by `test`. */
export const findAll = (node, test, out = []) => {
  for (const child of node?.children ?? []) {
    if (typeof child !== 'string') {
      if (test(child)) {
        out.push(child);
      }
      findAll(child, test, out);
    }
  }
  return out;
};

/** The text of a node; `skip(node)` leaves a subtree out. */
export const textOf = (node, skip = null) => {
  if (typeof node === 'string') {
    return node;
  }
  if (skip?.(node)) {
    return '';
  }
  return node.tag === 'br'
    ? '\n'
    : node.children.map((child) => textOf(child, skip)).join('');
};
