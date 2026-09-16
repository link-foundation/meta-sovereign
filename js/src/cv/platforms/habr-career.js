/**
 * Habr Career (career.habr.com) CV plan — R-V5.
 *
 * Career renders the whole profile into a single server-side state
 * blob (`script[type="application/json"][data-ssr-state="true"]`), so
 * reading is a JSON mapping rather than selector archaeology. The DOM
 * selectors below are kept as a documented fallback and were observed
 * on a public profile on 2026-09-16.
 *
 * Editing is owner-only: every resume section of the state carries an
 * `edit` field that is `null` for guests and holds the section's edit
 * URL for the owner, so the update plan discovers edit targets at
 * runtime instead of hard-coding paths we could not verify.
 */

import {
  clean,
  parseDuration,
  parseLanguage,
  stripHtml,
  uniqueList,
} from './parse.js';
import { definePlatform, updateGroup } from './define.js';
import {
  click,
  extractJson,
  fill,
  goto,
  read,
  readList,
  requireUrl,
  screenshot,
  snapshot,
  waitFor,
} from './steps.js';

const BASE = 'https://career.habr.com';
const SSR_STATE = 'script[type="application/json"][data-ssr-state="true"]';
const OBSERVED = '2026-09-16';

const positions = (companies) =>
  (companies ?? []).flatMap((company) =>
    (company.positions ?? []).map((position) => {
      const period = parseDuration(position.duration);
      return {
        company: clean(company.title),
        title: clean(position.title || position.short_title),
        start: period.start,
        end: period.end,
        current: period.current,
        description: stripHtml(position.message),
      };
    })
  );

const studies = (institutions) =>
  (institutions ?? []).flatMap((institution) =>
    (institution.courses ?? []).map((course) => {
      const period = parseDuration(course.duration);
      return {
        institution: clean(institution.title),
        degree: clean(course.title),
        field: clean(institution.subtitle),
        start: period.start,
        end: period.end,
        description: stripHtml(course.message),
      };
    })
  );

const contactLinks = (contacts) =>
  (contacts?.items ?? [])
    .filter((item) => item.value?.href)
    .map((item) => ({ label: clean(item.title), url: item.value.href }));

const headlineOf = (user) =>
  uniqueList([
    user.qualification,
    ...(user.divisions ?? []).map((division) => division.title),
  ]).join(', ');

/**
 * Map the SSR state of a Habr Career profile to the canonical CV.
 * @param {object} state parsed `data-ssr-state` payload
 */
export const habrStateToCv = (state) => {
  const user = state?.user ?? {};
  const resume = state?.resume ?? {};
  return {
    basics: {
      name: clean(user.title),
      headline: headlineOf(user),
      summary: stripHtml(resume.about?.value),
      location: clean(user.location),
      website: user.site ?? user.personalHref ?? '',
    },
    preferences: {
      employment: clean(user.availability),
      salary: clean(user.salary),
      remote: /удал|remote/i.test(String(user.relocation ?? '')),
      relocation: /переезд|relocat/i.test(String(user.relocation ?? '')),
    },
    skills: (user.skills ?? []).map((skill) => skill.title),
    languages: (user.foreignLanguages ?? []).map((language) =>
      parseLanguage(language.title)
    ),
    experience: positions(resume.companies?.items),
    education: studies(resume.education?.items).concat(
      studies(resume.additionalEducation?.items)
    ),
    links: contactLinks(user.contacts),
  };
};

/**
 * Edit URLs are published per section inside the same state blob for
 * the profile owner. Collecting them keeps the update plan honest: if
 * Career renames a route, the run reports a missing edit link instead
 * of navigating to a 404.
 * @param {object} state
 */
export const habrEditTargets = (state) => {
  const resume = state?.resume ?? {};
  return {
    about: resume.about?.edit ?? null,
    companies: resume.companies?.edit ?? null,
    education: resume.education?.edit ?? null,
    additionalEducation: resume.additionalEducation?.edit ?? null,
    contacts: state?.user?.contacts?.edit ?? null,
  };
};

export const habrCareerCvPlatform = definePlatform({
  id: 'habr-career',
  label: 'Habr Career',
  sourceName: 'habr-career',
  region: 'ru',
  locales: ['ru', 'en'],
  urls: {
    home: BASE,
    login: `${BASE}/login`,
    profile: `${BASE}/{{login}}`,
    resumes: `${BASE}/resumes`,
    settings: `${BASE}/{{login}}/edit/profile`,
  },
  auth: {
    kind: 'session-cookie',
    secret: 'secret:habr-career:session',
    notes:
      'Sign in once in the browser-commander profile; Career keeps a long-lived session cookie. The API token used by the message adapter does not grant resume access.',
  },
  markupAccess: 'public-profile',
  evidence: [
    {
      url: `${BASE}/`,
      observedAt: OBSERVED,
      finding: 'HTTP 200 without authentication.',
    },
    {
      url: `${BASE}/login`,
      observedAt: OBSERVED,
      finding: 'HTTP 200; dedicated login page confirmed.',
    },
    {
      url: `${BASE}/lightalloy`,
      observedAt: OBSERVED,
      finding:
        'Public profile (135 KB) embeds the full profile state in script[type="application/json"][data-ssr-state="true"] with visitor/user/resume keys; resume sections carry an "edit" field that is null for guests.',
    },
    {
      url: `${BASE}/lightalloy`,
      observedAt: OBSERVED,
      finding:
        'DOM fallbacks confirmed: .page-title__title, .skills-list-show-item--profile, .job-position__title, .job-position__duration, .resume-education-item__title, .user-contacts-item.',
    },
  ],
  read: [
    goto(`${BASE}/{{login}}`, { confidence: 'verified' }),
    requireUrl('career\\.habr\\.com', { confidence: 'verified' }),
    waitFor(SSR_STATE, { confidence: 'verified', verifiedAt: OBSERVED }),
    snapshot('profile', 'body'),
    extractJson(SSR_STATE, 'state', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
      provides: [
        'basics',
        'preferences',
        'skills',
        'languages',
        'experience',
        'education',
        'links',
      ],
    }),
    read('basics.name', '.page-title__title', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
      note: 'DOM fallback when the state blob is absent.',
    }),
    readList('skills', '.skills-list-show-item--profile', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
    }),
    screenshot('profile'),
  ],
  update: [
    updateGroup(
      'about',
      ['basics.summary', 'basics.headline'],
      [
        goto(`${BASE}/{{login}}`, { confidence: 'verified' }),
        extractJson(SSR_STATE, 'editTargets', { confidence: 'verified' }),
        goto('{{editTargets.about}}', {
          note: 'Edit URL read from the state blob; owner-only.',
        }),
        fill('basics.summary', '#resume_about, [name="resume[about]"]'),
        click('[data-qa="resume-save"], button[type="submit"]'),
        snapshot('about-editor', 'form'),
      ]
    ),
    updateGroup(
      'experience',
      ['experience'],
      [
        goto('{{editTargets.companies}}', {
          note: 'Career edits work history one company at a time.',
        }),
        waitFor('form', { optional: true }),
        screenshot('experience-editor'),
      ],
      { optional: true, note: 'Draft: needs an authenticated run to confirm.' }
    ),
  ],
  mappers: { state: habrStateToCv, editTargets: habrEditTargets },
  notes: [
    'The public profile exposes everything we need to read; only writing requires a session.',
    'Additional education is folded into the canonical education section.',
  ],
});
