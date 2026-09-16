/**
 * hh.ru CV plan — R-V6.
 *
 * hh publishes a large OpenAPI specification, but it contains no
 * applicant-side resume mutation: `/resumes/{resume_id}` is read-only
 * (`operationId: get-resume`) and the applicant's own list is only
 * referenced as `resumes_url` → `https://api.hh.ru/resumes/mine`.
 * Everything that changes a resume happens in the web UI, which is why
 * this platform is driven through browser-commander.
 *
 * hh markup is annotated with `data-qa` attributes — the same
 * convention browser-commander itself prefers when it has to synthesise
 * a unique selector — so the plan targets those rather than class
 * names, and every selector is reported through telemetry until an
 * authenticated run confirms it.
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

const WEB = 'https://hh.ru';
const API = 'https://api.hh.ru';
const OBSERVED = '2026-09-16';

export const hhCvPlatform = definePlatform({
  id: 'hh',
  label: 'hh.ru',
  sourceName: 'hh',
  region: 'ru',
  locales: ['ru', 'en'],
  urls: {
    home: WEB,
    login: `${WEB}/account/login`,
    resumes: `${WEB}/applicant/resumes`,
    resume: `${WEB}/resume/{{resumeId}}`,
    api: `${API}/resumes/mine`,
    apiResume: `${API}/resumes/{{resumeId}}`,
    docs: `${API}/openapi/en/`,
  },
  auth: {
    kind: 'session-cookie',
    secret: 'secret:hh:session',
    notes:
      'The OAuth token used by the hh message adapter can read /resumes/mine but cannot write a resume; the update plan needs an interactive browser session.',
  },
  markupAccess: 'authenticated',
  evidence: [
    {
      url: `${API}/openapi/specification/public/en`,
      observedAt: OBSERVED,
      finding:
        'Public OpenAPI spec (1.07 MB YAML): applicant profile exposes resumes_url with example https://api.hh.ru/resumes/mine; /resumes/{resume_id} declares only a GET (operationId get-resume) — no applicant-side create/update/publish operation exists.',
    },
    {
      url: `${WEB}/`,
      observedAt: OBSERVED,
      finding:
        'Plain HTTPS GET with a browser User-Agent returns HTTP 403; a real browser session is required to reach any markup.',
    },
    {
      url: 'https://github.com/link-foundation/browser-commander',
      observedAt: OBSERVED,
      finding:
        'browser-commander resolves text matches to [data-qa="…"] selectors when available, matching hh markup conventions.',
    },
  ],
  read: [
    goto(`${WEB}/applicant/resumes`, { confidence: 'documented' }),
    requireUrl('hh\\.ru/applicant/resumes', {
      confidence: 'documented',
      note: 'A redirect to /account/login means the session expired.',
    }),
    snapshot('resume-list', 'main'),
    click('[data-qa="resume-title"]', {
      note: 'Opens the first resume; multi-resume accounts pass resumeId instead.',
    }),
    waitFor('[data-qa="resume-block-title-position"]'),
    snapshot('resume', 'main'),
    read('basics.name', '[data-qa="resume-personal-name"]'),
    read('basics.headline', '[data-qa="resume-block-title-position"]'),
    read('basics.summary', '[data-qa="resume-block-skills-content"]'),
    read('basics.location', '[data-qa="resume-personal-address"]'),
    read('preferences.salary', '[data-qa="resume-block-salary"]'),
    read(
      'preferences.employment',
      '[data-qa="resume-block-position-employment"]'
    ),
    read(
      'preferences.schedule',
      '[data-qa="resume-block-position-work-schedule"]'
    ),
    readList('skills', '[data-qa="bloko-tag__text"]'),
    readRecords(
      'experience',
      '[data-qa="resume-block-experience"] .resume-block-item-gap',
      {
        company: '[data-qa="resume-block-experience-company"]',
        title: '[data-qa="resume-block-experience-position"]',
        description: '[data-qa="resume-block-experience-description"]',
        period: '.bloko-column_s-2',
      },
      { durationField: 'period' }
    ),
    readRecords(
      'education',
      '[data-qa="resume-block-education"] .resume-block-item-gap',
      {
        institution: '[data-qa="resume-block-education-name"]',
        degree: '[data-qa="resume-block-education-organization"]',
        start: '.bloko-column_s-2',
      },
      { note: 'hh renders only the graduation year for education entries.' }
    ),
    screenshot('resume'),
  ],
  update: [
    updateGroup(
      'title',
      ['basics.headline', 'preferences.salary'],
      [
        goto(`${WEB}/applicant/resumes/short?resume={{resumeId}}`, {
          note: 'Short edit form; confirm the exact route on the first authenticated run.',
        }),
        waitFor('[data-qa="resume-block-position"] form', { optional: true }),
        fill('basics.headline', '[data-qa="resume-position-input"]'),
        fill('preferences.salary', '[data-qa="resume-salary-input"]'),
        click('[data-qa="resume-submit"]'),
        snapshot('title-editor', 'form'),
      ]
    ),
    updateGroup(
      'skills',
      ['skills'],
      [
        goto(`${WEB}/applicant/resumes/skills?resume={{resumeId}}`),
        fill('skills', '[data-qa="skills-input"]', {
          note: 'hh takes skills as a comma-separated list in one control.',
        }),
        click('[data-qa="resume-submit"]'),
        screenshot('skills-editor'),
      ]
    ),
    updateGroup(
      'publish',
      ['basics.summary'],
      [
        goto(`${WEB}/resume/{{resumeId}}`),
        click('[data-qa="resume-update-button"]', {
          note: 'hh requires re-publishing a resume for changes to become visible.',
        }),
        snapshot('published', 'main'),
      ],
      { optional: true }
    ),
  ],
  notes: [
    'Read-only verification can also go through the API: GET /resumes/mine with the applicant token.',
    'hh throttles automation aggressively; the runner keeps its default navigation waits.',
  ],
});
