/**
 * LinkedIn CV plan — R-V7.
 *
 * LinkedIn has no public profile-editing API: the Profile API is
 * gated behind partner programs, so the supported route for keeping a
 * profile current is the member's own browser session. `/in/me/`
 * resolves to the signed-in member's profile, which lets the plan work
 * without knowing the vanity URL, and redirects to `/uas/login` when
 * the session is gone — the plan's authentication check.
 */

import { definePlatform, updateGroup } from './define.js';
import {
  click,
  fill,
  goto,
  press,
  read,
  readList,
  readRecords,
  requireUrl,
  screenshot,
  snapshot,
  waitFor,
} from './steps.js';

const BASE = 'https://www.linkedin.com';
const OBSERVED = '2026-09-16';

export const linkedinCvPlatform = definePlatform({
  id: 'linkedin',
  label: 'LinkedIn',
  sourceName: 'linkedin',
  region: 'global',
  locales: ['en'],
  urls: {
    home: BASE,
    login: `${BASE}/uas/login`,
    profile: `${BASE}/in/me/`,
    skills: `${BASE}/in/me/details/skills/`,
    experience: `${BASE}/in/me/details/experience/`,
    education: `${BASE}/in/me/details/education/`,
  },
  auth: {
    kind: 'session-cookie',
    secret: 'secret:linkedin:session',
    notes:
      'LinkedIn blocks headless traffic aggressively: run browser-commander with a persistent, already signed-in profile and a real user agent.',
  },
  markupAccess: 'authenticated',
  evidence: [
    {
      url: `${BASE}/in/me/`,
      observedAt: OBSERVED,
      finding:
        'HTTP 302 to https://www.linkedin.com/uas/login?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fme — confirms both the own-profile alias and the login redirect used as the session check.',
    },
  ],
  read: [
    goto(`${BASE}/in/me/`, { confidence: 'verified', verifiedAt: OBSERVED }),
    requireUrl('linkedin\\.com/in/', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
      note: 'A /uas/login URL means the session cookie expired.',
    }),
    waitFor('main section'),
    snapshot('profile', 'main'),
    read('basics.name', 'main h1'),
    read('basics.headline', 'main .text-body-medium'),
    read('basics.location', 'main .text-body-small.inline'),
    read('basics.summary', '#about ~ div .inline-show-more-text'),
    goto(`${BASE}/in/me/details/skills/`),
    readList(
      'skills',
      'main .pvs-list__paged-list-item .t-bold span[aria-hidden="true"]'
    ),
    goto(`${BASE}/in/me/details/experience/`),
    readRecords(
      'experience',
      'main .pvs-list__paged-list-item',
      {
        title: '.t-bold span[aria-hidden="true"]',
        company: '.t-14.t-normal span[aria-hidden="true"]',
        period: '.pvs-entity__caption-wrapper',
        location: '.t-14.t-normal.t-black--light span[aria-hidden="true"]',
      },
      { durationField: 'period' }
    ),
    goto(`${BASE}/in/me/details/education/`),
    readRecords(
      'education',
      'main .pvs-list__paged-list-item',
      {
        institution: '.t-bold span[aria-hidden="true"]',
        degree: '.t-14.t-normal span[aria-hidden="true"]',
        period: '.pvs-entity__caption-wrapper',
      },
      { durationField: 'period' }
    ),
    screenshot('profile'),
  ],
  update: [
    updateGroup(
      'intro',
      ['basics.headline', 'basics.location'],
      [
        goto(`${BASE}/in/me/`),
        click('button[aria-label*="Edit intro"]'),
        waitFor('div[role="dialog"] form'),
        fill(
          'basics.headline',
          'div[role="dialog"] #single-line-text-form-component-profileEditFormElement-TOPCARD-headline'
        ),
        click('div[role="dialog"] button[aria-label="Save"]'),
        snapshot('intro-dialog', 'div[role="dialog"]'),
      ]
    ),
    updateGroup(
      'about',
      ['basics.summary'],
      [
        goto(`${BASE}/in/me/`),
        click('#about ~ div button[aria-label*="Edit"]'),
        fill('basics.summary', 'div[role="dialog"] textarea'),
        click('div[role="dialog"] button[aria-label="Save"]'),
        screenshot('about-dialog'),
      ]
    ),
    updateGroup(
      'skills',
      ['skills'],
      [
        goto(`${BASE}/in/me/details/skills/`),
        click('button[aria-label="Add skill"]'),
        fill('skills', 'div[role="dialog"] input[role="combobox"]', {
          note: 'One skill per iteration; the runner repeats this group per added skill.',
        }),
        press('Enter'),
        click('div[role="dialog"] button[aria-label="Save"]'),
        snapshot('skills-dialog', 'div[role="dialog"]'),
      ]
    ),
  ],
  notes: [
    'Public knowledge, not verified here: LinkedIn profile write access is limited to approved partners (learn.microsoft.com/linkedin), so browser automation is the only self-service route.',
    'Selectors are drafts derived from public knowledge of the profile UI; the first authenticated run records markup fingerprints so they can be corrected from telemetry rather than guesswork.',
    'LinkedIn localises aria-labels: pass the account UI language when the labels do not match.',
  ],
});
