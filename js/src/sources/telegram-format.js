/**
 * Text formatting as Telegram's apps send it (R-Y101; Telegram Desktop's
 * markdown and its formatting shortcuts, learned, never copied).
 *
 * What is typed is sent as Telegram's entities, the markers removed:
 *
 *   **bold**   __italic__   ~~strike~~   ||spoiler||   `code`
 *   <u>underline</u>   ```lang
 *   pre (a code block)```   [text](https://link)
 *
 * As in Desktop, a marker counts only at a word's edge ("2**3**4" and
 * "snake__case__name" stay as typed), the formatted text cannot start or
 * end with a space, a lone `*` or `_` stays, and nothing is parsed inside
 * code; underline, which Telegram's markdown has no marker for (Desktop
 * makes it with Ctrl+U), is <u>…</u>. Offsets and lengths are UTF-16 units — what Telegram counts and
 * what JS strings index.
 *
 * Pure: shared by the server (sending, editing) and the page (pending
 * messages, the composer's shortcuts, editing a formatted message).
 */

const PAIRS = [
  ['**', 'bold'],
  ['__', 'italic'],
  ['~~', 'strike'],
  ['||', 'spoiler'],
];

export const CLASS_OF = Object.freeze({
  bold: 'MessageEntityBold',
  italic: 'MessageEntityItalic',
  strike: 'MessageEntityStrike',
  spoiler: 'MessageEntitySpoiler',
  underline: 'MessageEntityUnderline',
  code: 'MessageEntityCode',
  pre: 'MessageEntityPre',
  link: 'MessageEntityTextUrl',
});

const TYPE_OF = Object.fromEntries(
  Object.entries(CLASS_OF).map(([type, name]) => [name, type])
);

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/u;
const LINK =
  /^\[([^[\]\n]+)\]\(((?:https?:\/\/|tg:\/\/|mailto:)[^\s()]+|(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}(?:\/[^\s()]*)?)\)/u;
const LANGUAGE = /^([\w+#.-]{1,32})\n/;

const isWord = (char) => Boolean(char) && WORD.test(char);
const isSpace = (char) => Boolean(char) && SPACE.test(char);

/** A link as Telegram takes it: a bare domain gets https://. */
export const linkUrl = (url) =>
  /^(?:[a-z][a-z0-9+.-]*:)/i.test(url) ? url : `https://${url}`;

// ```lang\ncode``` — taken as typed.
const preAt = (src, i) => {
  if (!src.startsWith('```', i)) {
    return null;
  }
  const close = src.indexOf('```', i + 3);
  if (close < 0) {
    return null;
  }
  let inner = src.slice(i + 3, close);
  const lang = LANGUAGE.exec(inner);
  const language = lang ? lang[1] : '';
  inner = lang ? inner.slice(lang[0].length) : inner.replace(/^\n/, '');
  inner = inner.replace(/\n$/, '');
  return inner
    ? { type: 'pre', inner, literal: true, end: close + 3, language }
    : null;
};

// `code` — one line, taken as typed.
const codeAt = (src, i) => {
  if (src[i] !== '`' || isWord(src[i - 1])) {
    return null;
  }
  const close = src.indexOf('`', i + 1);
  const inner = close > i + 1 ? src.slice(i + 1, close) : '';
  if (!inner || inner.includes('\n') || isWord(src[close + 1])) {
    return null;
  }
  return { type: 'code', inner, literal: true, end: close + 1 };
};

const linkAt = (src, i) => {
  if (src[i] !== '[') {
    return null;
  }
  const found = LINK.exec(src.slice(i));
  return found
    ? {
        type: 'link',
        inner: found[1],
        end: i + found[0].length,
        url: linkUrl(found[2]),
      }
    : null;
};

// **bold**, __italic__, ~~strike~~, ||spoiler||: at a word's edge, not
// starting or ending with a space; the first close that fits ends it.
const pairAt = (src, i) => {
  const pair = PAIRS.find(([tag]) => src.startsWith(tag, i));
  if (!pair || isWord(src[i - 1])) {
    return null;
  }
  const [tag, type] = pair;
  const from = i + tag.length;
  if (!src[from] || isSpace(src[from]) || src.startsWith(tag, from)) {
    return null;
  }
  for (
    let close = src.indexOf(tag, from + 1);
    close > 0;
    close = src.indexOf(tag, close + 1)
  ) {
    const after = src[close + tag.length];
    if (
      !isSpace(src[close - 1]) &&
      !isWord(after) &&
      after !== tag[0] &&
      src[close - 1] !== tag[0]
    ) {
      return { type, inner: src.slice(from, close), end: close + tag.length };
    }
  }
  return null;
};

// <u>underline</u>: anywhere, not starting or ending with a space.
const underlineAt = (src, i) => {
  if (!src.startsWith('<u>', i)) {
    return null;
  }
  const close = src.indexOf('</u>', i + 3);
  const inner = close > i + 3 ? src.slice(i + 3, close) : '';
  return inner && inner.trim() === inner
    ? { type: 'underline', inner, end: close + 4 }
    : null;
};

const MATCHERS = [preAt, codeAt, linkAt, underlineAt, pairAt];

const parseInto = (src, out) => {
  let i = 0;
  while (i < src.length) {
    const match = MATCHERS.reduce((found, at) => found ?? at(src, i), null);
    if (!match) {
      out.text += src[i];
      i += 1;
      continue;
    }
    const offset = out.text.length;
    if (match.literal) {
      out.text += match.inner;
    } else {
      parseInto(match.inner, out);
    }
    const length = out.text.length - offset;
    if (length > 0) {
      out.entities.push({
        type: match.type,
        offset,
        length,
        ...(match.type === 'pre' ? { language: match.language } : {}),
        ...(match.url ? { url: match.url } : {}),
      });
    }
    i = match.end;
  }
  return out;
};

const byPlace = (a, b) => a.offset - b.offset || b.length - a.length;

/** Typed text → `{ text, entities: [{ type, offset, length, url?, language? }] }`. */
export const parseFormatted = (input) => {
  const out = parseInto(String(input ?? ''), { text: '', entities: [] });
  out.entities.sort(byPlace);
  return out;
};

/** Our entities as GramJS's MessageEntity classes. */
export const apiEntities = (Api, entities = []) =>
  entities
    .filter((e) => Api?.[CLASS_OF[e.type]])
    .map((e) => {
      const { type, ...fields } = e;
      return new Api[CLASS_OF[type]](
        type === 'pre' ? { ...fields, language: fields.language ?? '' } : fields
      );
    });

/** Our entities as a stored message's (`raw.entities`, by className). */
export const rawEntities = (entities = []) =>
  entities.map(({ type, ...fields }) => ({
    className: CLASS_OF[type],
    ...fields,
  }));

/**
 * `{ text, entities }` cut at `ranges` ([start, end) of the text, as the
 * long-message split gives them): each part with its own entities.
 */
export const sliceFormatted = ({ text, entities }, ranges) =>
  ranges.map(([start, end]) => ({
    text: text.slice(start, end),
    entities: entities
      .map((e) => {
        const from = Math.max(e.offset, start);
        const to = Math.min(e.offset + e.length, end);
        return { ...e, offset: from - start, length: to - from };
      })
      .filter((e) => e.length > 0),
  }));

const OPEN = {
  bold: () => '**',
  italic: () => '__',
  strike: () => '~~',
  spoiler: () => '||',
  underline: () => '<u>',
  code: () => '`',
  pre: (e) => `\`\`\`${e.language ?? ''}\n`,
  link: () => '[',
};
const CLOSE = {
  ...OPEN,
  pre: () => '\n```',
  underline: () => '</u>',
  link: (e) => `](${e.url})`,
};

/**
 * A message's text and entities back as what one would type: editing a
 * formatted message keeps its formatting, as Desktop's edit box does.
 * Entities markdown cannot say (quotes, custom emoji) are
 * left out.
 */
export const toMarkdown = (text, entities = []) => {
  const known = entities
    .map((e) => ({ ...e, type: e.type ?? TYPE_OF[e.className] }))
    .filter(
      (e) =>
        OPEN[e.type] &&
        Number(e.length) > 0 &&
        (e.type !== 'link' || e.url) &&
        e.offset + e.length <= text.length
    )
    .sort(byPlace);
  // Closes before opens at one place; the inner closes first, the outer
  // opens first.
  const marks = [
    ...known.map((e, n) => ({
      at: e.offset,
      rank: 1,
      n,
      put: OPEN[e.type](e),
    })),
    ...known.map((e, n) => ({
      at: e.offset + e.length,
      rank: 0,
      n: -n,
      put: CLOSE[e.type](e),
    })),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank || a.n - b.n);
  let out = '';
  let at = 0;
  for (const mark of marks) {
    out += text.slice(at, mark.at) + mark.put;
    at = mark.at;
  }
  return out + text.slice(at);
};

export const MARKERS = Object.freeze({
  bold: ['**', '**'],
  italic: ['__', '__'],
  strike: ['~~', '~~'],
  spoiler: ['||', '||'],
  underline: ['<u>', '</u>'],
  code: ['`', '`'],
  link: ['[', ']()'],
});

/**
 * The composer's shortcut: wrap the selection [start, end) of `value` in
 * `kind`'s markers — or take them off when it is wrapped already (a
 * toggle, as Desktop's). Spaces at the selection's edges stay outside.
 * Answers the replaced range, what goes there, and the new selection.
 */
export const wrapSelection = (value, start, end, kind) => {
  const [open, close] = MARKERS[kind];
  let from = start;
  let to = end;
  while (from < to && isSpace(value[from])) {
    from += 1;
  }
  while (to > from && isSpace(value[to - 1])) {
    to -= 1;
  }
  const inner = value.slice(from, to);
  if (
    kind !== 'link' &&
    value.slice(from - open.length, from) === open &&
    value.slice(to, to + close.length) === close
  ) {
    return {
      from: from - open.length,
      to: to + close.length,
      insert: inner,
      select: [from - open.length, to - open.length],
    };
  }
  const at = from + open.length;
  return {
    from,
    to,
    insert: `${open}${inner}${close}`,
    // A link's address goes between the brackets; else the text stays
    // selected (or the caret sits between the markers).
    select:
      kind === 'link'
        ? [at + inner.length + 2, at + inner.length + 2]
        : [at, at + inner.length],
  };
};
