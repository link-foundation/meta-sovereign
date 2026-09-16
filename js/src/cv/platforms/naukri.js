/**
 * Naukri.com CV plan — R-V8.
 *
 * Naukri keeps the applicant profile behind `/mnjuser/profile` and
 * bounces anonymous visitors to `/nlogin/login` with the original path
 * in the `URL` query parameter — a redirect we confirmed ourselves and
 * that the plan uses as its session check. Naukri's public APIs cover
 * job search only, so profile edits go through the UI.
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

const BASE = 'https://www.naukri.com';
const OBSERVED = '2026-09-16';

export const naukriCvPlatform = definePlatform({
  id: 'naukri',
  label: 'Naukri',
  sourceName: 'naukri',
  region: 'in',
  locales: ['en'],
  urls: {
    home: BASE,
    login: `${BASE}/nlogin/login`,
    profile: `${BASE}/mnjuser/profile`,
    resume: `${BASE}/mnjuser/profile?id=&altresid`,
    recruiterView: `${BASE}/mnjuser/recruiterview`,
  },
  auth: {
    kind: 'session-cookie',
    secret: 'secret:naukri:session',
    notes:
      'Sign in at /nlogin/login inside the browser-commander profile. Naukri keeps a nauk_at cookie; an expired session silently redirects every profile URL back to the login form.',
  },
  markupAccess: 'authenticated',
  evidence: [
    {
      url: `${BASE}/mnjuser/profile`,
      observedAt: OBSERVED,
      finding:
        'Anonymous request redirects to https://www.naukri.com/nlogin/login?URL=//www.naukri.com/mnjuser/profile — confirms both the profile route and the login route.',
    },
  ],
  read: [
    goto(`${BASE}/mnjuser/profile`, {
      confidence: 'verified',
      verifiedAt: OBSERVED,
    }),
    requireUrl('naukri\\.com/mnjuser/profile', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
      note: 'Landing on /nlogin/login means the session expired.',
    }),
    waitFor('.card.profile-container, #lazyProfileCard'),
    snapshot('profile', '#root'),
    read('basics.name', '.card.profile-container .name, .mn-hdr-nm'),
    read(
      'basics.headline',
      '.card.resumeHeadline .widgetCont, #lazyResumeHead'
    ),
    read('basics.location', '.card.profile-container .loc span'),
    read('basics.phone', '.card.profile-container .phone span'),
    read('basics.email', '.card.profile-container .email span'),
    read('preferences.salary', '.card.profile-container .exp + .sal span'),
    readList('skills', '#lazyKeySkills .chip, .key-skill .chip span'),
    readRecords(
      'experience',
      '#lazyEmpDetails .item, .employment .item',
      {
        title: '.deg, .profile-title',
        company: '.org, .company-name',
        period: '.dur, .duration',
        description: '.desc, .job-desc',
      },
      { durationField: 'period' }
    ),
    readRecords(
      'education',
      '#lazyEducation .item, .education .item',
      {
        degree: '.deg, .edu-degree',
        institution: '.org, .edu-institute',
        period: '.dur, .edu-duration',
      },
      { durationField: 'period' }
    ),
    readList('languages', '#lazyLanguages .item .lang, .languages .chip'),
    screenshot('profile'),
  ],
  update: [
    updateGroup(
      'headline',
      ['basics.headline'],
      [
        goto(`${BASE}/mnjuser/profile`),
        click('.card.resumeHeadline .edit, [title="Edit Resume headline"]'),
        waitFor('#resumeHeadlineForm, .drawer textarea'),
        fill('basics.headline', '#resumeHeadlineTxt, .drawer textarea'),
        click('.drawer button[type="submit"], #saveHeadline'),
        snapshot('headline-drawer', '.drawer'),
      ]
    ),
    updateGroup(
      'key-skills',
      ['skills'],
      [
        goto(`${BASE}/mnjuser/profile`),
        click('#lazyKeySkills .edit, [title="Edit Key skills"]'),
        fill('skills', '#keySkillSugg, .drawer input[type="text"]', {
          note: 'Naukri accepts one skill per suggestion pick; the runner repeats the group.',
        }),
        click('.drawer button[type="submit"], #saveKeySkills'),
        screenshot('skills-drawer'),
      ]
    ),
    updateGroup(
      'employment',
      ['experience'],
      [
        goto(`${BASE}/mnjuser/profile`),
        click('#lazyEmpDetails .edit, [title="Edit Employment"]'),
        waitFor('.drawer form'),
        fill('experience[].title', '#designation'),
        fill('experience[].company', '#organization'),
        fill('experience[].description', '#jobDesc'),
        click('.drawer button[type="submit"]'),
        snapshot('employment-drawer', '.drawer'),
      ],
      { optional: true }
    ),
  ],
  notes: [
    'Naukri renders profile cards lazily (the `lazy*` ids); the plan waits for the card before reading it.',
    'Uploading a CV file is a separate flow and is intentionally out of scope: this plan edits the structured profile.',
  ],
});
