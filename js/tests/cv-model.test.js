// Issue #29 / R-V1: reproducing tests for the canonical CV model.
//
// Covers normalisation (unknown key rejection, trimming, boolean
// parsing), the links-notation round-trip used to store CVs, record
// keys used by the diff engine, and the store-link projection.

import { describe, it, expect } from 'test-anywhere';

import {
  CV_SECTIONS,
  cvFieldCount,
  cvFromLino,
  cvFromLink,
  cvLinkId,
  cvToLino,
  cvToLink,
  emptyCv,
  normalizeCv,
  recordKey,
} from '../src/cv/model.js';

const sample = {
  basics: {
    name: '  Anna Buyanova  ',
    headline: 'Senior Software Developer',
    email: 'anna@example.com',
    location: 'Saint Petersburg',
    unknownField: 'dropped',
  },
  preferences: { employment: 'full', relocation: 'true', remote: 'no' },
  skills: ['Ruby', 'Ruby on Rails', '  PostgreSQL  ', ''],
  languages: [{ name: 'English', level: 'C1' }],
  experience: [
    {
      company: 'Acme',
      title: 'Developer',
      start: '2019-01',
      end: '2024-05',
      current: false,
      description: 'Built things',
    },
  ],
  education: [
    { institution: 'SPbU', degree: 'MSc', field: 'CS', start: '2012' },
  ],
  links: [{ label: 'GitHub', url: 'https://github.com/example' }],
};

describe('cv model normalisation', () => {
  it('provides every section even for an empty CV', () => {
    const cv = emptyCv();
    for (const section of CV_SECTIONS) {
      expect(cv[section] !== undefined).toBe(true);
    }
  });
  it('drops unknown fields and trims values', () => {
    const cv = normalizeCv(sample);
    expect(cv.basics.name).toBe('Anna Buyanova');
    expect(cv.basics.unknownField).toBeUndefined();
    expect(cv.skills.join(',')).toBe('Ruby,Ruby on Rails,PostgreSQL');
  });
  it('parses boolean fields from strings', () => {
    const cv = normalizeCv(sample);
    expect(cv.preferences.relocation).toBe(true);
    expect(cv.preferences.remote).toBe(false);
  });
  it('is idempotent', () => {
    const once = normalizeCv(sample);
    expect(JSON.stringify(normalizeCv(once))).toBe(JSON.stringify(once));
  });
  it('tolerates missing input', () => {
    expect(JSON.stringify(normalizeCv())).toBe(JSON.stringify(emptyCv()));
  });
  it('counts populated leaf fields', () => {
    expect(cvFieldCount(sample)).toBeGreaterThan(15);
    expect(cvFieldCount(emptyCv())).toBe(0);
  });
});

describe('cv links notation', () => {
  it('renders an indented cv tree headed by the platform', () => {
    const text = cvToLino(sample, { platform: 'linkedin' });
    expect(text.startsWith('cv linkedin\n')).toBe(true);
    expect(text).toContain('  basics\n    name "Anna Buyanova"\n');
    expect(text).toContain('    skill "Ruby on Rails"\n');
    expect(text).toContain('  experience\n    position\n      company Acme\n');
  });
  it('round-trips without loss', () => {
    const cv = normalizeCv(sample);
    const back = cvFromLino(cvToLino(cv, { platform: 'hh' }));
    expect(JSON.stringify(back)).toBe(JSON.stringify(cv));
  });
  it('omits empty sections from the notation', () => {
    const text = cvToLino({ basics: { name: 'Solo' } });
    expect(text).toContain('cv canonical\n');
    expect(text.includes('education')).toBe(false);
  });
  it('returns an empty CV for empty notation', () => {
    expect(JSON.stringify(cvFromLino(''))).toBe(JSON.stringify(emptyCv()));
  });
});

describe('cv record keys', () => {
  it('keys experience by company, title and start', () => {
    expect(recordKey('experience', sample.experience[0])).toBe(
      'acme|developer|2019-01'
    );
  });
  it('keys links by url alone so labels can change', () => {
    expect(recordKey('links', sample.links[0])).toBe(
      'https://github.com/example'
    );
  });
});

describe('cv store links', () => {
  it('stamps a platform-scoped id and carries the notation', () => {
    const link = cvToLink({
      platform: 'topcv',
      cv: sample,
      capturedAt: '2026-01-01T00:00:00.000Z',
      url: 'https://www.topcv.vn/quan-ly-cv',
    });
    expect(link.id).toBe(cvLinkId('topcv'));
    expect(link.tokens.join(' ')).toBe('cv topcv');
    expect(link.lino.startsWith('cv topcv\n')).toBe(true);
    expect(link.capturedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(link.url).toBe('https://www.topcv.vn/quan-ly-cv');
  });
  it('reads a CV back from a link, falling back to the notation', () => {
    const link = cvToLink({ platform: 'naukri', cv: sample });
    expect(JSON.stringify(cvFromLink(link))).toBe(
      JSON.stringify(normalizeCv(sample))
    );
    const notationOnly = { lino: link.lino };
    expect(JSON.stringify(cvFromLink(notationOnly))).toBe(
      JSON.stringify(normalizeCv(sample))
    );
    expect(JSON.stringify(cvFromLink(null))).toBe(JSON.stringify(emptyCv()));
  });
});
