/**
 * CV comparison: field-level diffs between two snapshots and a
 * cross-platform agreement matrix (R-V2).
 *
 * Both operations are built on one flattening pass that turns a CV
 * into stable `path → value` pairs. Repeated records are keyed by
 * their identity fields rather than by array position, so inserting a
 * job at the top of an experience list does not report every later
 * entry as changed.
 */

import {
  LIST_SECTIONS,
  MAP_SECTIONS,
  RECORD_SECTIONS,
  normalizeCv,
  recordKey,
} from './model.js';

/**
 * Flatten a CV into a `Map` of dotted paths to scalar values.
 * @param {object} cv
 * @returns {Map<string, string|boolean>}
 */
export const flattenCv = (cv) => {
  const normalized = normalizeCv(cv);
  const flat = new Map();
  for (const [section, fields] of Object.entries(MAP_SECTIONS)) {
    for (const field of fields) {
      const value = normalized[section][field];
      if (value !== undefined) {
        flat.set(`${section}.${field}`, value);
      }
    }
  }
  for (const section of Object.keys(LIST_SECTIONS)) {
    for (const value of normalized[section]) {
      flat.set(`${section}[${value.toLowerCase()}]`, value);
    }
  }
  for (const section of Object.keys(RECORD_SECTIONS)) {
    for (const record of normalized[section]) {
      const key = recordKey(section, record);
      for (const [field, value] of Object.entries(record)) {
        flat.set(`${section}[${key}].${field}`, value);
      }
    }
  }
  return flat;
};

const sortedPaths = (maps) => {
  const paths = new Set();
  for (const map of maps) {
    for (const path of map.keys()) {
      paths.add(path);
    }
  }
  return [...paths].sort();
};

/**
 * Diff two CVs field by field.
 * @param {object} left previous/local snapshot
 * @param {object} right next/remote snapshot
 * @returns {Array<{path: string, kind: 'added'|'removed'|'changed', left: any, right: any}>}
 */
export const diffCv = (left, right) => {
  const a = flattenCv(left);
  const b = flattenCv(right);
  const changes = [];
  for (const path of sortedPaths([a, b])) {
    const before = a.get(path);
    const after = b.get(path);
    if (before === after) {
      continue;
    }
    const kind =
      before === undefined
        ? 'added'
        : after === undefined
          ? 'removed'
          : 'changed';
    changes.push({ path, kind, left: before ?? null, right: after ?? null });
  }
  return changes;
};

/** True when two CVs carry exactly the same canonical values. */
export const cvsEqual = (left, right) => diffCv(left, right).length === 0;

/** Human-readable one-line rendering of a single change. */
export const formatChange = (change) => {
  if (change.kind === 'added') {
    return `+ ${change.path}: ${change.right}`;
  }
  if (change.kind === 'removed') {
    return `- ${change.path}: ${change.left}`;
  }
  return `~ ${change.path}: ${change.left} -> ${change.right}`;
};

/** Render a diff as a plain-text patch, one change per line. */
export const formatDiff = (changes) =>
  changes.map(formatChange).join('\n') + (changes.length > 0 ? '\n' : '');

/**
 * Build a cross-platform comparison matrix.
 *
 * @param {Array<{platform: string, cv: object}>} entries
 * @returns {{platforms: string[], rows: Array<{path: string, values: object, present: string[], missing: string[], conflict: boolean}>, conflicts: object[], missing: object[]}}
 */
export const compareCvs = (entries = []) => {
  const platforms = entries.map((entry) => entry.platform);
  const flats = entries.map((entry) => flattenCv(entry.cv));
  const rows = sortedPaths(flats).map((path) => {
    const values = {};
    const present = [];
    const missing = [];
    for (const [index, flat] of flats.entries()) {
      const value = flat.get(path);
      if (value === undefined) {
        missing.push(platforms[index]);
      } else {
        values[platforms[index]] = value;
        present.push(platforms[index]);
      }
    }
    const distinct = new Set(Object.values(values).map((v) => String(v)));
    return { path, values, present, missing, conflict: distinct.size > 1 };
  });
  return {
    platforms,
    rows,
    conflicts: rows.filter((row) => row.conflict),
    missing: rows.filter((row) => row.missing.length > 0 && !row.conflict),
  };
};

/**
 * Pick the value each platform should converge on: the newest
 * snapshot wins, then the majority value, then the first defined one.
 * Callers can override per path before applying an update.
 *
 * @param {Array<{platform: string, cv: object, capturedAt?: string}>} entries
 * @param {{prefer?: string|null}} [options] platform whose values win ties
 */
export const reconcileCvs = (entries = [], { prefer = null } = {}) => {
  const ranked = [...entries].sort((a, b) => {
    if (prefer && a.platform !== b.platform) {
      if (a.platform === prefer) {
        return -1;
      }
      if (b.platform === prefer) {
        return 1;
      }
    }
    return String(b.capturedAt ?? '').localeCompare(String(a.capturedAt ?? ''));
  });
  const { rows } = compareCvs(entries);
  const order = new Map(ranked.map((entry, index) => [entry.platform, index]));
  return rows.map((row) => {
    const winner = row.present
      .slice()
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))[0];
    return {
      path: row.path,
      value: winner === undefined ? null : row.values[winner],
      source: winner ?? null,
      conflict: row.conflict,
      appliesTo: row.missing.concat(
        row.present.filter(
          (platform) =>
            platform !== winner &&
            String(row.values[platform]) !== String(row.values[winner])
        )
      ),
    };
  });
};
