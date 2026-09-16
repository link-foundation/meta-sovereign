// Issue #29 / R-V3..R-V11: every platform plan must be valid, complete
// and honest about how much of it is still a draft.
//
// These tests are the safety net that lets us ship full step drafts for
// platforms whose authenticated markup we cannot fetch yet: the shapes,
// the canonical paths, the mapper references and the evidence backing
// every "verified" claim are all checked mechanically.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'test-anywhere';

import { isCvPath, normalizeCv, cvFieldCount } from '../src/cv/model.js';
import {
  cvPlatformCatalogue,
  cvPlatforms,
  getCvPlatform,
  listCvPlatforms,
  validateCvPlatforms,
  validatePlatform,
} from '../src/cv/platforms/index.js';
import {
  habrStateToCv,
  habrEditTargets,
} from '../src/cv/platforms/habr-career.js';
import { vietnamworksNextDataToCv } from '../src/cv/platforms/vietnamworks.js';
import { validateSteps } from '../src/cv/platforms/steps.js';

const fixture = (name) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
      'utf8'
    )
  );

// The platforms the issue names explicitly, plus superjob which the
// server already advertises as a resume sync target.
const REQUIRED = [
  'linkedin',
  'hh',
  'habr-career',
  'naukri',
  'vietnamworks',
  'topcv',
];

describe('cv platform registry', () => {
  it('registers every platform named in the issue', () => {
    for (const id of REQUIRED) {
      expect(listCvPlatforms()).toContain(id);
    }
  });

  it('looks platforms up by id and reports unknown ones', () => {
    expect(getCvPlatform('hh').label).toBe('hh.ru');
    let message = '';
    try {
      getCvPlatform('monster');
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('Unknown CV platform: monster');
    expect(message).toContain('linkedin');
  });

  it('validates all descriptors against the canonical model', () => {
    expect(validateCvPlatforms()).toEqual([]);
  });

  it('serialises a catalogue entry per platform', () => {
    const catalogue = cvPlatformCatalogue();
    expect(catalogue.length).toBe(cvPlatforms.length);
    expect(JSON.parse(JSON.stringify(catalogue)).length).toBe(
      cvPlatforms.length
    );
  });
});

describe('cv platform plans', () => {
  for (const platform of cvPlatforms) {
    it(`${platform.id}: has read and update plans with a login URL`, () => {
      expect(validatePlatform(platform, isCvPath)).toEqual([]);
      expect(platform.urls.login.startsWith('https://')).toBe(true);
      expect(platform.read.length).toBeGreaterThan(0);
      expect(platform.update.length).toBeGreaterThan(0);
      expect(platform.readPaths.length).toBeGreaterThan(0);
      expect(platform.writePaths.length).toBeGreaterThan(0);
    });

    it(`${platform.id}: reads every path it claims to write`, () => {
      // Without a read-back an update can never be verified.
      for (const path of platform.writePaths) {
        const section = path.split(/[.[]/)[0];
        const readable =
          platform.readPaths.some(
            (known) => known === path || known.split(/[.[]/)[0] === section
          ) || platform.providedSections.includes(section);
        expect(readable).toBe(true);
      }
    });

    it(`${platform.id}: records evidence and keeps drafts labelled`, () => {
      for (const entry of platform.evidence) {
        expect(entry.url.startsWith('http')).toBe(true);
        expect(entry.observedAt.length).toBeGreaterThan(0);
        expect(entry.finding.length).toBeGreaterThan(0);
      }
      // draftCount is what the CLI and the SPA surface as "unconfirmed".
      expect(platform.draftCount).toBe(platform.confidence.draft ?? 0);
      expect(platform.stepCount).toBeGreaterThan(0);
    });

    it(`${platform.id}: every step keeps the shape the runner expects`, () => {
      const steps = [
        ...platform.read,
        ...platform.update.flatMap((group) => group.steps),
      ];
      expect(validateSteps(steps, platform.id)).toEqual([]);
      for (const step of steps) {
        expect(typeof step.action).toBe('string');
        expect(typeof step.confidence).toBe('string');
      }
    });
  }
});

describe('habr career mapper', () => {
  const state = fixture('habr-career-profile-state.json');
  const cv = habrStateToCv(state);

  it('maps the captured SSR state onto the canonical model', () => {
    expect(cv.basics.name).toBe('Анна Буянова');
    expect(cv.basics.location).toBe('Россия, Вологда');
    expect(cv.basics.headline).toContain('Бэкенд разработчик');
    expect(cv.skills).toContain('Ruby on Rails');
    expect(cv.languages[0]).toEqual({ name: 'Английский', level: 'B2' });
  });

  it('turns rich HTML into plain text without leaking markup', () => {
    expect(cv.basics.summary).toContain('10+ лет коммерческой разработки');
    expect(cv.basics.summary).not.toContain('<');
    expect(cv.experience[0].description).not.toContain('&nbsp;');
  });

  it('parses Russian durations into sortable months', () => {
    expect(cv.experience[0].start).toBe('2025-01');
    expect(cv.experience[0].current).toBe(true);
    expect(cv.experience[0].end).toBe('');
    expect(normalizeCv(cv).experience[1]).toEqual({
      company: 'dev.to',
      title: 'Senior Software Developer',
      start: '2019-01',
      end: '2024-05',
      current: false,
      // normalizeCv drops empty fields, so `location` is absent here.
      description: cv.experience[1].description,
    });
  });

  it('extracts education and remote preferences', () => {
    expect(cv.education[0].institution).toBe('МПГУ');
    expect(cv.education[0].start).toBe('2022-10');
    expect(cv.preferences.remote).toBe(true);
  });

  it('produces a populated canonical CV', () => {
    expect(cvFieldCount(normalizeCv(cv))).toBeGreaterThan(40);
  });

  it('reports which sections are editable for this session', () => {
    // The fixture is an anonymous capture: no edit links are exposed,
    // which is exactly the signal the runner needs to demand a login.
    const targets = habrEditTargets(state);
    expect(targets.about).toBe(null);
    expect(Object.keys(targets)).toContain('companies');
  });
});

describe('vietnamworks mapper', () => {
  it('maps a __NEXT_DATA__ profile payload defensively', () => {
    const cv = vietnamworksNextDataToCv({
      props: {
        pageProps: {
          profile: {
            fullName: 'Le Minh',
            currentJobTitle: 'Backend Engineer',
            address: 'Ho Chi Minh City',
            skills: [{ name: 'Go' }, 'Go', { skillName: 'Kubernetes' }],
            workingExperiences: [
              {
                companyName: 'Acme VN',
                jobTitle: 'Backend Engineer',
                duration: 'Tháng 10/2022 - Hiện tại',
              },
            ],
            educations: [{ schoolName: 'HCMUT', major: 'Computer Science' }],
          },
        },
      },
    });
    expect(cv.basics.name).toBe('Le Minh');
    expect(cv.basics.location).toBe('Ho Chi Minh City');
    expect(cv.skills).toEqual(['Go', 'Kubernetes']);
    expect(cv.experience[0].start).toBe('2022-10');
    expect(cv.experience[0].current).toBe(true);
    expect(cv.education[0].institution).toBe('HCMUT');
  });

  it('survives a payload without any profile at all', () => {
    const cv = vietnamworksNextDataToCv({
      props: { pageProps: { userIP: '1.2.3.4' } },
    });
    expect(cv.basics.name).toBe('');
    expect(cv.skills).toEqual([]);
    expect(cv.experience).toEqual([]);
  });
});
