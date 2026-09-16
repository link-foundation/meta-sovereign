/**
 * TopCV CV plan — R-V10.
 *
 * TopCV rejects plain HTTP clients outright: every path we probed —
 * including the home page — answered 403 to curl with a desktop user
 * agent. That is itself the finding that justifies browser automation
 * here; the URLs below are recorded as candidates and the first
 * authenticated run confirms them through telemetry.
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

const BASE = 'https://www.topcv.vn';
const OBSERVED = '2026-09-16';

export const topcvCvPlatform = definePlatform({
  id: 'topcv',
  label: 'TopCV',
  sourceName: 'topcv',
  region: 'vn',
  locales: ['vi', 'en'],
  urls: {
    home: BASE,
    login: `${BASE}/dang-nhap`,
    profile: `${BASE}/ho-so`,
    cvManager: `${BASE}/quan-ly-cv`,
    cvBuilder: `${BASE}/mau-cv`,
  },
  auth: {
    kind: 'session-cookie',
    secret: 'secret:topcv:session',
    notes:
      'TopCV fingerprints clients: use a persistent browser-commander profile with a real user agent, sign in once at /dang-nhap, and keep the session warm. Automated requests without a browser are refused with 403.',
  },
  markupAccess: 'blocked-without-browser',
  evidence: [
    {
      url: `${BASE}/`,
      observedAt: OBSERVED,
      finding:
        'HTTP 403 for a plain HTTPS GET with a desktop User-Agent — no markup is reachable without a real browser.',
    },
    {
      url: `${BASE}/quan-ly-cv`,
      observedAt: OBSERVED,
      finding:
        'HTTP 403 for the same client; recorded as the CV manager candidate route.',
    },
    {
      url: `${BASE}/ho-so`,
      observedAt: OBSERVED,
      finding:
        'HTTP 403 for the same client; recorded as the profile candidate route.',
    },
    {
      url: `${BASE}/dang-nhap`,
      observedAt: OBSERVED,
      finding:
        'HTTP 403 for the same client; recorded as the login candidate route.',
    },
  ],
  read: [
    goto(`${BASE}/ho-so`),
    requireUrl('topcv\\.vn/ho-so', {
      note: 'A redirect to /dang-nhap means the session expired.',
    }),
    waitFor('.profile-container, #profile-page'),
    snapshot('profile', 'body'),
    read('basics.name', '.profile-name, .box-user-info .name'),
    read('basics.headline', '.profile-title, .box-user-info .job-title'),
    read('basics.email', '.box-user-info .email'),
    read('basics.phone', '.box-user-info .phone'),
    read('basics.location', '.box-user-info .address'),
    read('basics.summary', '#box-career-objective .content'),
    read('preferences.salary', '#box-job-expectation .salary'),
    read('preferences.employment', '#box-job-expectation .job-type'),
    readList('skills', '#box-skill .skill-name, .list-skill .item'),
    readRecords(
      'experience',
      '#box-experience .item, .list-experience .item',
      {
        title: '.job-title',
        company: '.company-name',
        period: '.time',
        description: '.description',
      },
      { durationField: 'period' }
    ),
    readRecords(
      'education',
      '#box-education .item, .list-education .item',
      {
        institution: '.school-name',
        degree: '.degree',
        field: '.major',
        period: '.time',
      },
      { durationField: 'period' }
    ),
    readList('languages', '#box-language .item'),
    screenshot('profile'),
  ],
  update: [
    updateGroup(
      'objective',
      ['basics.summary'],
      [
        goto(`${BASE}/ho-so`),
        click('#box-career-objective .btn-edit'),
        waitFor('.modal.show form, .modal-content form'),
        fill('basics.summary', '.modal textarea[name="career_objective"]'),
        click('.modal button[type="submit"]'),
        snapshot('objective-modal', '.modal'),
      ]
    ),
    updateGroup(
      'expectation',
      ['preferences.salary', 'preferences.employment', 'basics.location'],
      [
        goto(`${BASE}/ho-so`),
        click('#box-job-expectation .btn-edit'),
        fill('preferences.salary', '.modal input[name="salary"]'),
        click('.modal button[type="submit"]'),
        screenshot('expectation-modal'),
      ]
    ),
    updateGroup(
      'cv-document',
      ['skills', 'experience'],
      [
        goto(`${BASE}/quan-ly-cv`),
        waitFor('.cv-list, .list-cv', { optional: true }),
        click('.cv-item .btn-edit'),
        snapshot('cv-editor', 'body'),
      ],
      {
        optional: true,
        note: 'TopCV keeps CV documents separate from the profile.',
      }
    ),
  ],
  notes: [
    'Vietnamese route names are intentional: /ho-so (profile), /quan-ly-cv (CV manager), /dang-nhap (login).',
    'Because no markup could be fetched, every selector here is a draft; the runner reports each miss with a markup fingerprint so the first real session produces a correction list rather than a failure.',
  ],
});
