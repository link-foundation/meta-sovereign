// Issue #29 / R-V2: reproducing tests for CV comparison.
//
// Covers keyed flattening, added/removed/changed classification,
// list-order independence, the cross-platform matrix with conflicts
// and gaps, and reconciliation of a target value per field.

import { describe, it, expect } from 'test-anywhere';

import {
  compareCvs,
  cvsEqual,
  diffCv,
  flattenCv,
  formatDiff,
  reconcileCvs,
} from '../src/cv/diff.js';

const base = {
  basics: { name: 'Anna Buyanova', headline: 'Developer' },
  skills: ['Ruby', 'SQL'],
  experience: [
    { company: 'Acme', title: 'Developer', start: '2019-01', end: '2024-05' },
  ],
};

describe('cv flattening', () => {
  it('keys repeated records by identity, not by position', () => {
    const flat = flattenCv(base);
    expect(flat.get('experience[acme|developer|2019-01].end')).toBe('2024-05');
    expect(flat.get('skills[ruby]')).toBe('Ruby');
    expect(flat.get('basics.name')).toBe('Anna Buyanova');
  });
});

describe('cv diff', () => {
  it('reports no changes for equal CVs regardless of list order', () => {
    const reordered = { ...base, skills: ['SQL', 'Ruby'] };
    expect(diffCv(base, reordered).length).toBe(0);
    expect(cvsEqual(base, reordered)).toBe(true);
  });
  it('classifies added, removed and changed fields', () => {
    const next = {
      basics: { name: 'Anna Buyanova', headline: 'Senior Developer' },
      skills: ['Ruby', 'Go'],
      experience: [
        {
          company: 'Acme',
          title: 'Developer',
          start: '2019-01',
          end: '2024-05',
        },
      ],
    };
    const changes = diffCv(base, next);
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]));
    expect(byPath['basics.headline'].kind).toBe('changed');
    expect(byPath['basics.headline'].right).toBe('Senior Developer');
    expect(byPath['skills[go]'].kind).toBe('added');
    expect(byPath['skills[sql]'].kind).toBe('removed');
  });
  it('does not renumber untouched entries when a record is prepended', () => {
    const next = {
      ...base,
      experience: [
        { company: 'New', title: 'Lead', start: '2024-06' },
        ...base.experience,
      ],
    };
    const changes = diffCv(base, next);
    expect(changes.every((c) => c.kind === 'added')).toBe(true);
    expect(changes.length).toBe(3);
  });
  it('renders a readable patch', () => {
    const text = formatDiff(diffCv(base, { ...base, skills: ['Ruby'] }));
    expect(text).toBe('- skills[sql]: SQL\n');
    expect(formatDiff([])).toBe('');
  });
});

describe('cross-platform comparison', () => {
  const entries = [
    {
      platform: 'linkedin',
      cv: { basics: { name: 'Anna Buyanova', headline: 'Developer' } },
      capturedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      platform: 'hh',
      cv: { basics: { name: 'Anna Buyanova', headline: 'Senior Developer' } },
      capturedAt: '2026-01-03T00:00:00.000Z',
    },
    {
      platform: 'topcv',
      cv: { basics: { name: 'Anna Buyanova' } },
      capturedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  it('lists conflicting and missing fields per platform', () => {
    const matrix = compareCvs(entries);
    expect(matrix.platforms.join(',')).toBe('linkedin,hh,topcv');
    const headline = matrix.rows.find((r) => r.path === 'basics.headline');
    expect(headline.conflict).toBe(true);
    expect(headline.missing.join(',')).toBe('topcv');
    expect(matrix.conflicts.length).toBe(1);
    const name = matrix.rows.find((r) => r.path === 'basics.name');
    expect(name.conflict).toBe(false);
    expect(name.present.length).toBe(3);
  });
  it('reconciles to the newest value and lists platforms to update', () => {
    const plan = reconcileCvs(entries);
    const headline = plan.find((row) => row.path === 'basics.headline');
    expect(headline.value).toBe('Senior Developer');
    expect(headline.source).toBe('hh');
    expect(headline.appliesTo.sort().join(',')).toBe('linkedin,topcv');
  });
  it('honours an explicitly preferred platform', () => {
    const plan = reconcileCvs(entries, { prefer: 'linkedin' });
    const headline = plan.find((row) => row.path === 'basics.headline');
    expect(headline.source).toBe('linkedin');
    expect(headline.value).toBe('Developer');
  });
  it('handles an empty comparison', () => {
    const matrix = compareCvs();
    expect(matrix.rows.length).toBe(0);
    expect(reconcileCvs().length).toBe(0);
  });
});
