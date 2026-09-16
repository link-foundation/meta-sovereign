/**
 * SuperJob CV plan — R-V11.
 *
 * SuperJob is already a message source in this repository and is one of
 * the resume sync targets the server announces, so its CV plan lives
 * here for parity even though the issue lists it only implicitly. The
 * resume area answers 200 without authentication, which makes it the
 * cheapest platform to smoke-test the runner against.
 */

import { definePlatform, updateGroup } from './define.js';
import {
  click,
  fill,
  goto,
  read,
  readList,
  readRecords,
  requireUrl,
  screenshot,
  snapshot,
  waitFor,
} from './steps.js';

const BASE = 'https://www.superjob.ru';
const OBSERVED = '2026-09-16';

export const superjobCvPlatform = definePlatform({
  id: 'superjob',
  label: 'SuperJob',
  sourceName: 'superjob',
  region: 'ru',
  locales: ['ru'],
  urls: {
    home: BASE,
    login: `${BASE}/login/`,
    resumes: `${BASE}/resume/`,
    resume: `${BASE}/resume/{{resumeId}}.html`,
  },
  auth: {
    kind: 'session-cookie',
    secret: 'secret:superjob:session',
    notes:
      'The SuperJob API key used elsewhere in this repository covers vacancies, not applicant resume editing; the update plan needs a browser session.',
  },
  markupAccess: 'authenticated',
  evidence: [
    {
      url: `${BASE}/resume/`,
      observedAt: OBSERVED,
      finding:
        'HTTP 200 for an anonymous request — the resume area is reachable.',
    },
  ],
  read: [
    goto(`${BASE}/resume/`, { confidence: 'verified', verifiedAt: OBSERVED }),
    requireUrl('superjob\\.ru/resume', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
    }),
    waitFor('main'),
    snapshot('resume-list', 'main'),
    read('basics.name', 'h1'),
    read('basics.headline', '[data-qa="resume-position"], h2'),
    read('preferences.salary', '[data-qa="resume-salary"]'),
    read('basics.location', '[data-qa="resume-town"]'),
    readList('skills', '[data-qa="resume-skill"]'),
    readRecords(
      'experience',
      '[data-qa="resume-experience-item"]',
      {
        title: '[data-qa="experience-position"]',
        company: '[data-qa="experience-company"]',
        period: '[data-qa="experience-period"]',
        description: '[data-qa="experience-description"]',
      },
      { durationField: 'period' }
    ),
    screenshot('resume'),
  ],
  update: [
    updateGroup(
      'headline',
      ['basics.headline', 'preferences.salary'],
      [
        goto(`${BASE}/resume/`),
        click('[data-qa="resume-edit"]'),
        waitFor('form'),
        fill('basics.headline', 'input[name="profession"]'),
        fill('preferences.salary', 'input[name="compensation"]'),
        click('button[type="submit"]'),
        snapshot('editor', 'form'),
      ]
    ),
  ],
  notes: [
    'SuperJob is listed by the server as a resume sync target, so it shares the CV pipeline with the platforms named in the issue.',
  ],
});
