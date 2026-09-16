/**
 * Canonical CV model and its Links Notation projection (R-V1).
 *
 * Every platform adapter reads into — and writes out of — this single
 * shape, so a LinkedIn CV and a TopCV CV can be diffed field by field
 * without any platform-specific knowledge leaking into the comparison
 * code. The notation projection reuses the repository's indented
 * links-notation reader/writer, which makes a CV just another link
 * tree inside the store.
 */

import { formatLino, parseLino } from '../storage/lino.js';

/** Scalar sections: a flat map of named string/boolean values. */
export const MAP_SECTIONS = {
  basics: [
    'name',
    'headline',
    'summary',
    'email',
    'phone',
    'location',
    'website',
    'birthDate',
  ],
  preferences: [
    'employment',
    'schedule',
    'salary',
    'currency',
    'relocation',
    'remote',
  ],
};

/** Plain string lists. */
export const LIST_SECTIONS = { skills: 'skill' };

/** Repeated records: an ordered list of field maps. */
export const RECORD_SECTIONS = {
  languages: { item: 'language', fields: ['name', 'level'] },
  experience: {
    item: 'position',
    fields: [
      'company',
      'title',
      'start',
      'end',
      'current',
      'location',
      'description',
    ],
    key: ['company', 'title', 'start'],
  },
  education: {
    item: 'study',
    fields: ['institution', 'degree', 'field', 'start', 'end', 'description'],
    key: ['institution', 'degree', 'start'],
  },
  links: { item: 'link', fields: ['label', 'url'], key: ['url'] },
};

/** Fields stored as booleans rather than strings. */
export const BOOLEAN_FIELDS = new Set(['current', 'relocation', 'remote']);

/** Canonical section order — diffs and notation output follow it. */
export const CV_SECTIONS = [
  'basics',
  'preferences',
  'skills',
  'languages',
  'experience',
  'education',
  'links',
];

export const RECORD_KEY_FIELDS = Object.fromEntries(
  Object.entries(RECORD_SECTIONS).map(([section, spec]) => [
    section,
    spec.key ?? spec.fields,
  ])
);

/** An empty CV with every section present, so callers never null-check. */
export const emptyCv = () => ({
  basics: {},
  preferences: {},
  skills: [],
  languages: [],
  experience: [],
  education: [],
  links: [],
});

const scalar = (field, value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (BOOLEAN_FIELDS.has(field)) {
    return value === true || value === 'true' || value === 'yes';
  }
  return String(value).trim();
};

const normalizeMap = (fields, input) => {
  const out = {};
  for (const field of fields) {
    const value = scalar(field, input?.[field]);
    if (value !== undefined) {
      out[field] = value;
    }
  }
  return out;
};

const normalizeList = (input) =>
  (Array.isArray(input) ? input : [])
    .map((v) => (typeof v === 'object' && v ? (v.name ?? v.title ?? '') : v))
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0);

const normalizeRecords = (fields, input) =>
  (Array.isArray(input) ? input : [])
    .map((record) => normalizeMap(fields, record))
    .filter((record) => Object.keys(record).length > 0);

/**
 * Coerce arbitrary adapter output into the canonical shape: unknown
 * keys are dropped, values trimmed, booleans parsed, sections always
 * present. Normalisation is idempotent, which is what makes diffs
 * stable across platforms.
 * @param {object} input
 */
export const normalizeCv = (input = {}) => {
  const cv = emptyCv();
  for (const [section, fields] of Object.entries(MAP_SECTIONS)) {
    cv[section] = normalizeMap(fields, input?.[section]);
  }
  for (const section of Object.keys(LIST_SECTIONS)) {
    cv[section] = normalizeList(input?.[section]);
  }
  for (const [section, spec] of Object.entries(RECORD_SECTIONS)) {
    cv[section] = normalizeRecords(spec.fields, input?.[section]);
  }
  return cv;
};

/** Stable identity of a repeated record, used for keyed diffing. */
export const recordKey = (section, record) =>
  RECORD_KEY_FIELDS[section]
    .map((field) => String(record?.[field] ?? '').toLowerCase())
    .join('|');

const mapNodes = (fields, values) =>
  fields
    .filter((field) => values?.[field] !== undefined)
    .map((field) => ({
      tokens: [field, String(values[field])],
      children: [],
    }));

const sectionNode = (name, children) => ({ tokens: [name], children });

const cvSectionNodes = (cv) =>
  CV_SECTIONS.map((section) => {
    if (MAP_SECTIONS[section]) {
      return sectionNode(section, mapNodes(MAP_SECTIONS[section], cv[section]));
    }
    if (LIST_SECTIONS[section]) {
      return sectionNode(
        section,
        cv[section].map((value) => ({
          tokens: [LIST_SECTIONS[section], String(value)],
          children: [],
        }))
      );
    }
    const spec = RECORD_SECTIONS[section];
    return sectionNode(
      section,
      cv[section].map((record) => ({
        tokens: [spec.item],
        children: mapNodes(spec.fields, record),
      }))
    );
  }).filter((node) => node.children.length > 0);

/**
 * Project a CV into links-notation nodes rooted at a `cv <platform>`
 * link, ready to be handed to `formatLino` or embedded in a larger
 * tree.
 * @param {object} cv
 * @param {{platform?: string}} [options]
 */
export const cvToLinoNodes = (cv, { platform = 'canonical' } = {}) => [
  { tokens: ['cv', platform], children: cvSectionNodes(normalizeCv(cv)) },
];

/**
 * Render a CV as indented links notation.
 * @param {object} cv
 * @param {{platform?: string}} [options]
 */
export const cvToLino = (cv, options = {}) =>
  formatLino(cvToLinoNodes(cv, options));

const nodeValue = (node) => node.tokens.slice(1).join(' ');

const readMapSection = (fields, node) =>
  normalizeMap(
    fields,
    Object.fromEntries(node.children.map((c) => [c.tokens[0], nodeValue(c)]))
  );

const readRecordSection = (spec, node) =>
  normalizeRecords(
    spec.fields,
    node.children
      .filter((c) => c.tokens[0] === spec.item)
      .map((c) =>
        Object.fromEntries(c.children.map((f) => [f.tokens[0], nodeValue(f)]))
      )
  );

/**
 * Parse links notation produced by {@link cvToLino} back into the
 * canonical CV shape. Round-tripping is lossless for every canonical
 * field, which the model tests assert.
 * @param {string} text
 */
export const cvFromLino = (text) => {
  const roots = parseLino(text);
  const root = roots.find((node) => node.tokens[0] === 'cv') ?? roots[0];
  const cv = emptyCv();
  if (!root) {
    return cv;
  }
  for (const node of root.children ?? []) {
    const section = node.tokens[0];
    if (MAP_SECTIONS[section]) {
      cv[section] = readMapSection(MAP_SECTIONS[section], node);
    } else if (LIST_SECTIONS[section]) {
      cv[section] = normalizeList(
        node.children
          .filter((c) => c.tokens[0] === LIST_SECTIONS[section])
          .map(nodeValue)
      );
    } else if (RECORD_SECTIONS[section]) {
      cv[section] = readRecordSection(RECORD_SECTIONS[section], node);
    }
  }
  return cv;
};

/** Store id of a per-platform CV snapshot. */
export const cvLinkId = (platform) => `cv:${platform}`;

/**
 * Wrap a CV snapshot in a store link. The notation text travels with
 * the link so a snapshot is readable without re-serialising it.
 * @param {{platform: string, cv: object, capturedAt?: string, url?: string|null, warnings?: string[]}} options
 */
export const cvToLink = ({
  platform,
  cv,
  capturedAt = new Date().toISOString(),
  url = null,
  warnings = [],
}) => {
  const normalized = normalizeCv(cv);
  return {
    id: cvLinkId(platform),
    tokens: ['cv', platform],
    platform,
    cv: normalized,
    lino: cvToLino(normalized, { platform }),
    url,
    warnings,
    capturedAt,
  };
};

/** Read a CV back out of a store link written by {@link cvToLink}. */
export const cvFromLink = (link) => {
  if (!link) {
    return emptyCv();
  }
  if (link.cv) {
    return normalizeCv(link.cv);
  }
  return link.lino ? cvFromLino(link.lino) : emptyCv();
};

/** Count of populated leaf values — used for coverage telemetry. */
export const cvFieldCount = (cv) => {
  const normalized = normalizeCv(cv);
  let total = 0;
  for (const section of CV_SECTIONS) {
    const value = normalized[section];
    if (Array.isArray(value)) {
      total += value.reduce(
        (sum, item) =>
          sum + (typeof item === 'object' ? Object.keys(item).length : 1),
        0
      );
    } else {
      total += Object.keys(value).length;
    }
  }
  return total;
};
