/**
 * Text normalisation shared by the platform mappers (R-V4).
 *
 * Job boards render the same facts in wildly different shapes: Habr
 * Career ships rich HTML inside a JSON blob and Russian month names,
 * VietnamWorks and TopCV use Vietnamese ones, LinkedIn uses English.
 * Normalising here — rather than in each descriptor — is what makes a
 * cross-platform diff meaningful instead of a wall of formatting
 * noise.
 */

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
};

/** Convert a rich-text fragment into readable plain text. */
export const stripHtml = (input) => {
  if (!input) {
    return '';
  }
  return (
    String(input)
      .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?\s*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      // A capture truncated mid-tag would otherwise leak a stray '<'.
      .replace(/<[^>]*$/, '')
      .replace(
        /&[a-z#0-9]+;/gi,
        (entity) => ENTITIES[entity.toLowerCase()] ?? ' '
      )
      .split('\n')
      .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n')
  );
};

const MONTHS = {
  en: [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ],
  ru: [
    'январь',
    'февраль',
    'март',
    'апрель',
    'май',
    'июнь',
    'июль',
    'август',
    'сентябрь',
    'октябрь',
    'ноябрь',
    'декабрь',
  ],
  ruGenitive: [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ],
};

const MONTH_INDEX = new Map();
for (const names of Object.values(MONTHS)) {
  for (const [index, name] of names.entries()) {
    MONTH_INDEX.set(name, index + 1);
    MONTH_INDEX.set(name.slice(0, 3), index + 1);
  }
}

/** Words that mean "still working here" across the supported locales. */
export const PRESENT_MARKERS = [
  'по настоящее время',
  'настоящее время',
  'present',
  'current',
  'now',
  'hiện tại',
  'hiện nay',
];

/** True when a duration fragment marks an ongoing period. */
export const isPresent = (text) => {
  const lower = String(text ?? '').toLowerCase();
  return PRESENT_MARKERS.some((marker) => lower.includes(marker));
};

const pad = (month) => String(month).padStart(2, '0');

/**
 * Normalise a single month expression to `YYYY-MM` (or `YYYY` when no
 * month is given). Unrecognised input is returned trimmed, so nothing
 * is ever silently lost.
 * @param {string} input e.g. "Октябрь 2022", "Tháng 10/2022", "10/2022"
 */
export const parseMonth = (input) => {
  const text = String(input ?? '')
    .replace(/\(.*?\)/g, '')
    .trim();
  if (!text) {
    return '';
  }
  const numeric = text.match(/^(?:tháng\s*)?(\d{1,2})[./-](\d{4})$/i);
  if (numeric) {
    return `${numeric[2]}-${pad(numeric[1])}`;
  }
  const iso = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${pad(iso[2])}`;
  }
  const named = text.match(/^([^\s\d]+)\.?\s+(\d{4})$/u);
  if (named) {
    const month = MONTH_INDEX.get(named[1].toLowerCase());
    if (month) {
      return `${named[2]}-${pad(month)}`;
    }
  }
  const yearOnly = text.match(/^(\d{4})$/);
  return yearOnly ? yearOnly[1] : text;
};

const RANGE_SEPARATOR = /\s*(?:—|–|-|to|по|đến)\s*/iu;

/**
 * Split a duration such as `"Январь 2025 — По настоящее время (1 год)"`
 * into canonical `{start, end, current}`.
 * @param {string} input
 */
export const parseDuration = (input) => {
  const text = String(input ?? '')
    .replace(/\(.*?\)/g, '')
    .trim();
  if (!text) {
    return { start: '', end: '', current: false };
  }
  const parts = text.split(RANGE_SEPARATOR).filter((part) => part.trim());
  const start = parseMonth(parts[0] ?? '');
  const tail = parts.slice(1).join(' ');
  if (!tail || isPresent(tail)) {
    return { start, end: '', current: true };
  }
  return { start, end: parseMonth(tail), current: false };
};

const LEVEL_PATTERN =
  /\b([ABC][12]|native|fluent|basic|intermediate|advanced)\b/i;

/**
 * Split `"Английский B2"` / `"English — Fluent"` into name and level.
 * @param {string} input
 */
export const parseLanguage = (input) => {
  const text = String(input ?? '')
    .replace(/[—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return { name: '', level: '' };
  }
  // Cyrillic В2 looks identical to Latin B2 but is a different code point.
  const latin = text.replace(/В(?=[12]\b)/g, 'B').replace(/С(?=[12]\b)/g, 'C');
  const match = latin.match(LEVEL_PATTERN);
  if (!match) {
    return { name: text, level: '' };
  }
  const level = /^[abc][12]$/i.test(match[1])
    ? match[1].toUpperCase()
    : match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return { name: latin.slice(0, match.index).trim() || text, level };
};

/** Collapse whitespace in scraped text content. */
export const clean = (input) =>
  String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Drop empty/duplicate entries while keeping the original order. */
export const uniqueList = (values) => {
  const seen = new Set();
  const out = [];
  for (const value of values ?? []) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (text && !seen.has(key)) {
      seen.add(key);
      out.push(text);
    }
  }
  return out;
};
