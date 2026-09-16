/**
 * VietnamWorks CV plan — R-V9.
 *
 * VietnamWorks is a Next.js application: `/my-profile` answers 200 even
 * for guests, but its `__NEXT_DATA__` payload carries only
 * `{params, userIP}` — the profile itself is fetched client-side after
 * authentication. The plan therefore extracts `__NEXT_DATA__` when the
 * page ships one (so an authenticated run captures whatever the server
 * does embed) and otherwise reads the rendered DOM.
 *
 * Class names are hashed CSS modules (`ProfileStrength_header__JzLOw`)
 * and styled-components (`sc-2eb60299-0`), which change on every build,
 * so selectors anchor on the stable module prefix via `[class*="…"]`
 * and on the `data-tab` attributes the app ships.
 */

import { clean, parseDuration, uniqueList } from './parse.js';
import { definePlatform, updateGroup } from './define.js';
import {
  click,
  extractJson,
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

const BASE = 'https://www.vietnamworks.com';
const NEXT_DATA = 'script#__NEXT_DATA__';
const OBSERVED = '2026-09-16';

/**
 * Map the Next.js payload of VietnamWorks' profile page. The shape is
 * only populated for authenticated sessions, so every lookup is
 * defensive and an empty payload simply yields an empty CV that the
 * DOM steps then fill in.
 * @param {object} data parsed `__NEXT_DATA__`
 */
const vwBasics = (profile) => ({
  name: clean(profile.fullName ?? profile.name),
  headline: clean(profile.currentJobTitle ?? profile.jobTitle),
  summary: clean(profile.objective ?? profile.summary),
  email: clean(profile.email),
  phone: clean(profile.phoneNumber ?? profile.phone),
  location: clean(profile.address ?? profile.city),
});

const vwPreferences = (profile) => ({
  salary: clean(profile.expectedSalary),
  currency: clean(profile.salaryCurrency),
  employment: clean(profile.jobType ?? profile.desiredJobType),
});

const vwExperience = (entry) => {
  const period = parseDuration(
    entry.duration ?? `${entry.startDate ?? ''} - ${entry.endDate ?? ''}`
  );
  return {
    company: clean(entry.companyName ?? entry.company),
    title: clean(entry.jobTitle ?? entry.title),
    start: period.start,
    end: period.end,
    current: Boolean(entry.isCurrent ?? period.current),
    description: clean(entry.description),
  };
};

const vwEducation = (entry) => ({
  institution: clean(entry.schoolName ?? entry.institution),
  degree: clean(entry.degree ?? entry.certificate),
  field: clean(entry.major ?? entry.field),
  start: clean(entry.startYear ?? entry.fromYear),
  end: clean(entry.endYear ?? entry.toYear),
});

export const vietnamworksNextDataToCv = (data) => {
  const props = data?.props?.pageProps ?? {};
  const profile = props.profile ?? props.userProfile ?? props.jobSeeker ?? {};
  const experience = profile.workingExperiences ?? profile.experiences ?? [];
  const education = profile.educations ?? profile.education ?? [];
  return {
    basics: vwBasics(profile),
    preferences: vwPreferences(profile),
    skills: uniqueList(
      (profile.skills ?? []).map(
        (skill) => skill.name ?? skill.skillName ?? skill
      )
    ),
    experience: experience.map(vwExperience),
    education: education.map(vwEducation),
  };
};

export const vietnamworksCvPlatform = definePlatform({
  id: 'vietnamworks',
  label: 'VietnamWorks',
  sourceName: 'vietnamworks',
  region: 'vn',
  locales: ['vi', 'en'],
  urls: {
    home: BASE,
    login: 'https://secure.vietnamworks.com/login/en?client_id=3',
    profile: `${BASE}/my-profile`,
    cvBuilder: `${BASE}/wowcv`,
    previewResume: `${BASE}/preview-resume/0`,
  },
  auth: {
    kind: 'session-cookie',
    secret: 'secret:vietnamworks:session',
    notes:
      'Authentication lives on secure.vietnamworks.com (client_id=3) and drops a session cookie for www.vietnamworks.com; /login on the main host redirects to the register page instead.',
  },
  markupAccess: 'authenticated',
  evidence: [
    {
      url: `${BASE}/my-profile`,
      observedAt: OBSERVED,
      finding:
        'HTTP 200 for guests; __NEXT_DATA__ reports page "/my-profile" and pageProps {params, userIP} only — profile data is loaded client-side after login.',
    },
    {
      url: `${BASE}/my-profile`,
      observedAt: OBSERVED,
      finding:
        'Stable hooks observed: [data-tab="my-profile-tab"], [data-tab="attached-cv"]; component classes are hashed CSS modules (ProfileStrength_header__JzLOw, ProgressBar_progressFill__FF_I8, WorkingPreferences_iconEdit__f3VcT) so selectors use [class*="Module_part"] prefixes.',
    },
    {
      url: `${BASE}/wowcv`,
      observedAt: OBSERVED,
      finding: 'HTTP 200 — the CV builder used for the downloadable CV.',
    },
    {
      url: 'https://secure.vietnamworks.com/login/en?client_id=3',
      observedAt: OBSERVED,
      finding:
        'Login form host; https://www.vietnamworks.com/login redirects to secure.vietnamworks.com/register/en?client_id=3.',
    },
  ],
  read: [
    goto(`${BASE}/my-profile`, {
      confidence: 'verified',
      verifiedAt: OBSERVED,
    }),
    requireUrl('vietnamworks\\.com/my-profile', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
      note: 'A redirect to secure.vietnamworks.com means the session expired.',
    }),
    waitFor('[data-tab="my-profile-tab"]', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
    }),
    snapshot('profile', 'body'),
    extractJson(NEXT_DATA, 'nextData', {
      confidence: 'verified',
      verifiedAt: OBSERVED,
      provides: ['basics', 'preferences', 'skills', 'experience', 'education'],
      note: 'Populated only for authenticated sessions; empty payloads are ignored.',
    }),
    read('basics.name', '[class*="PersonalInformation_name"], h1'),
    read('basics.headline', '[class*="PersonalInformation_jobTitle"]'),
    read('basics.location', '[class*="PersonalInformation_address"]'),
    read('basics.summary', '[class*="Objective_content"]'),
    read('preferences.salary', '[class*="WorkingPreferences_salary"]'),
    read(
      'preferences.employment',
      '[class*="WorkingPreferenceView_preference"]'
    ),
    readList(
      'skills',
      '[class*="Skills_skillName"], [class*="SkillItem_name"]'
    ),
    readRecords(
      'experience',
      '[class*="WorkingExperience_item"]',
      {
        title: '[class*="_jobTitle"]',
        company: '[class*="_companyName"]',
        period: '[class*="_duration"]',
        description: '[class*="_description"]',
      },
      { durationField: 'period' }
    ),
    readRecords(
      'education',
      '[class*="Education_item"]',
      {
        institution: '[class*="_schoolName"]',
        degree: '[class*="_degree"]',
        field: '[class*="_major"]',
        period: '[class*="_duration"]',
      },
      { durationField: 'period' }
    ),
    screenshot('profile'),
  ],
  update: [
    updateGroup(
      'personal',
      ['basics.name', 'basics.headline', 'basics.location', 'basics.phone'],
      [
        goto(`${BASE}/my-profile`),
        click('[class*="PersonalInformation_iconEdit"]'),
        waitFor('form'),
        fill('basics.headline', 'input[name="jobTitle"]'),
        fill('basics.phone', 'input[name="phoneNumber"]'),
        click('button[type="submit"]'),
        snapshot('personal-form', 'form'),
      ]
    ),
    updateGroup(
      'preferences',
      ['preferences.salary', 'preferences.employment'],
      [
        goto(`${BASE}/my-profile`),
        click('[class*="WorkingPreferences_iconEdit"]', {
          confidence: 'verified',
          verifiedAt: OBSERVED,
        }),
        fill('preferences.salary', 'input[name="expectedSalary"]'),
        click('button[type="submit"]'),
        screenshot('preferences-form'),
      ]
    ),
    updateGroup(
      'cv-builder',
      ['basics.summary', 'skills'],
      [
        goto(`${BASE}/wowcv`, { confidence: 'verified', verifiedAt: OBSERVED }),
        waitFor('[class*="module_container"]', { optional: true }),
        fill('basics.summary', 'textarea[name="objective"]'),
        click('button[type="submit"]'),
        snapshot('wowcv', 'body'),
      ],
      { optional: true }
    ),
  ],
  mappers: { nextData: vietnamworksNextDataToCv },
  notes: [
    'Hashed class suffixes change on every deploy; only the module prefix is matched, and telemetry records the full class list so drift is visible.',
    'The attached-CV tab ([data-tab="attached-cv"]) holds uploaded files and is not part of the structured CV.',
  ],
});
