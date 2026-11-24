import { technologyMatcher } from './technology-mentions.js';
import { splitTechnologyList } from './cv-technology-lists.js';
import { technologyFailure } from './technology-catalog.js';

export const technologyKey = (text) =>
  text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
export const compareTechnologyLabels = (a, b, language) =>
  a.localeCompare(b, language, { sensitivity: 'base', numeric: true });
const typo = new Map([
  ['cuter', 'Cutter'],
  ['teleric', 'Telerik'],
]);
const compatibleRanges = (text) => [
  ...text.matchAll(
    /(?:Amazon\s+(?:AWS\s+)?S3|S3)[\s-]+(?:compatible|совместим\p{L}*)(?:\s+(?:storage|хранилищ\p{L}*))?/giu
  ),
];

/** Whole list names only; unknown names and collisions remain visible. */
export const technologyNormalizer = (catalog) => {
  const scan = technologyMatcher(catalog.entries);
  const normalize = (raw) => {
    if (raw.length > 500) {
      throw technologyFailure('limit');
    }
    const cleaned = raw.trim().replace(/^[\s/\\|]+|[\s/\\|]+$/gu, '');
    if (
      compatibleRanges(cleaned).some(
        (range) => range.index === 0 && range[0].length === cleaned.length
      )
    ) {
      return {
        raw,
        cleaned,
        canonical: 'S3-compatible storage',
        candidates: [],
        malformed: raw !== cleaned,
        known: false,
      };
    }
    if (!/[\p{L}\p{N}]/u.test(cleaned)) {
      return { raw, cleaned, canonical: '', candidates: [], malformed: true };
    }
    const candidates = scan(cleaned, 'list')
      .filter((item) => item.start === 0 && item.end === cleaned.length)
      .flatMap((item) => item.candidates);
    return {
      raw,
      cleaned,
      canonical: candidates.length === 1 ? candidates[0] : cleaned,
      candidates,
      malformed: raw !== cleaned,
      ambiguous: candidates.length > 1,
      known: candidates.length === 1,
    };
  };
  const expand = (raw) => {
    if (/^C\s*\/\s*C\+\+$/iu.test(raw)) {
      return ['C', 'C++'].map(normalize);
    }
    const decorated = raw.match(/^(.*?)\s+\(([^()]*)\)$/u);
    if (decorated) {
      const first = normalize(decorated[1]);
      const others = splitTechnologyList(decorated[2]).map(normalize);
      if (
        first.known &&
        others.length &&
        others.every((item) => item.known && item.canonical === first.canonical)
      ) {
        return [
          { ...first, raw, observed: others.map((item) => item.cleaned) },
        ];
      }
      if (
        first.canonical === 'C#' &&
        others.length &&
        others.every((item) => /^\.NET(?:\s|$)/u.test(item.cleaned))
      ) {
        return [first, ...others];
      }
    }
    return [normalize(raw)];
  };
  const label = (item, observed, language) => {
    const aliases = new Set(
      (item.observed ?? []).filter(
        (name) => typo.get(technologyKey(name)) !== item.canonical
      )
    );
    if (item.known) {
      for (const row of observed) {
        const term = normalize(row.spelling);
        if (
          row.canonical === item.canonical &&
          term.known &&
          term.canonical === item.canonical &&
          typo.get(technologyKey(term.cleaned)) !== item.canonical &&
          !term.malformed &&
          technologyKey(term.cleaned) !== technologyKey(item.canonical)
        ) {
          aliases.add(
            technologyKey(term.cleaned) === 'k8s' ? 'k8s' : term.cleaned
          );
        }
      }
    }
    const suffix = [...aliases].sort((a, b) =>
      compareTechnologyLabels(a, b, language)
    );
    return `${item.canonical}${suffix.length ? ` (${suffix.join(', ')})` : ''}`;
  };
  const evidence = (text, field) => {
    const compatible = compatibleRanges(text);
    const mentions = scan(text, field).filter(
      (item) =>
        !compatible.some(
          (range) =>
            item.start >= range.index &&
            item.end <= range.index + range[0].length
        )
    );
    return [
      ...mentions,
      ...compatible.map((range) => ({
        field,
        start: range.index,
        end: range.index + range[0].length,
        spelling: range[0],
        candidates: ['S3-compatible storage'],
        requirement: 'unspecified',
        context: text.slice(
          Math.max(0, range.index - 80),
          range.index + range[0].length + 80
        ),
      })),
    ];
  };
  return { normalize, expand, label, scan: evidence };
};
