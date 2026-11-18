import {
  technologyCatalogEntries,
  technologyFailure,
} from './technology-catalog.js';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const word = (text) => /[\p{L}\p{N}_+#]/u.test(text);
const requirement = (line, previous) => {
  const plain = line.replace(/^\s*[-*•\d.)]+\s*/u, '').trim();
  if (
    /^(?:requirements?|required|must have|what you bring|требования|обязательно|ожидаем|необходимо)(?=$|[\s:—-])/iu.test(
      plain
    )
  ) {
    return 'required';
  }
  if (
    /^(?:preferred|nice[ -]to[ -]have|bonus|desirable|будет плюсом|желательно|преимуществом)(?=$|[\s:—-])/iu.test(
      plain
    )
  ) {
    return 'preferred';
  }
  if (
    /^(?:responsibilities|benefits|we offer|duties|обязанности|условия|мы предлагаем|задачи)(?=$|[\s:—-])/iu.test(
      plain
    )
  ) {
    return 'unspecified';
  }
  return previous;
};
const inlineRequirement = (line, section) =>
  /(?:^|[^\p{L}\p{N}_])(?:nice[ -]to[ -]have|preferred|bonus|would be a plus|будет плюсом|желательно)(?=$|[^\p{L}\p{N}_])/iu.test(
    line
  )
    ? 'preferred'
    : section;
const ordinaryBasic = (spelling, following) =>
  spelling === 'Basic' &&
  /^\s+(?:knowledge|understanding|skills?|concepts?|principles?|requirements?|experience)\b/iu.test(
    following
  );

/** Longest whole names consume their span; alias collisions remain explicit. */
export const technologyMatcher = (input) => {
  const entries = technologyCatalogEntries(input);
  const names = new Map();
  for (const row of entries) {
    for (const name of new Set([row.canonical, ...row.aliases])) {
      const key = name.toLowerCase();
      const group = names.get(key) ?? [];
      group.push({
        name,
        canonical: row.canonical,
        caseSensitive: row.caseSensitive,
      });
      names.set(key, group);
    }
  }
  const pattern = [...names.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  const scan = (text, field, classify = false) => {
    if (!pattern) {
      return [];
    }
    const regex = new RegExp(pattern, 'giu');
    const result = [];
    let section = 'unspecified';
    let offset = 0;
    for (const line of text.split('\n')) {
      if (classify) {
        section = requirement(line, section);
      }
      for (const match of line.matchAll(regex)) {
        const start = match.index;
        const end = start + match[0].length;
        if (word(line[start - 1] ?? '') || word(line[end] ?? '')) {
          continue;
        }
        // An unlisted numbered version is not evidence for its parent product.
        if (/^\s+v?\d(?:[.\d]|\b)/iu.test(line.slice(end))) {
          continue;
        }
        if (ordinaryBasic(match[0], line.slice(end))) {
          continue;
        }
        const candidates = [
          ...new Set(
            names
              .get(match[0].toLowerCase())
              .filter((row) => !row.caseSensitive || row.name === match[0])
              .map((row) => row.canonical)
          ),
        ].sort();
        if (!candidates.length) {
          continue;
        }
        result.push({
          field,
          start: offset + start,
          end: offset + end,
          spelling: match[0],
          candidates,
          requirement: classify
            ? inlineRequirement(line, section)
            : 'unspecified',
          context: line.slice(
            Math.max(0, start - 80),
            Math.min(line.length, end + 80)
          ),
        });
        if (result.length > 2000) {
          throw technologyFailure('limit');
        }
      }
      offset += line.length + 1;
    }
    return result;
  };
  return scan;
};

/** A suggestion only: one changed letter in a sufficiently long whole brand. */
export const similarTechnologyNames = (unknown, entries) => {
  const a = unknown.toLowerCase();
  if (a.length < 5) {
    return [];
  }
  return entries
    .filter(({ canonical }) => {
      const b = canonical.toLowerCase();
      if (Math.abs(a.length - b.length) > 1 || a === b) {
        return false;
      }
      let left = 0;
      while (a[left] === b[left] && left < Math.min(a.length, b.length)) {
        left++;
      }
      return a.length === b.length
        ? a.slice(left + 1) === b.slice(left + 1)
        : a.length > b.length
          ? a.slice(left + 1) === b.slice(left)
          : a.slice(left) === b.slice(left + 1);
    })
    .map((row) => row.canonical)
    .slice(0, 8);
};
