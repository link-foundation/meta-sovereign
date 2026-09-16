// Issue #29 / R-V14: the plan runner drives browser-commander from the
// declarative descriptors, records everything through telemetry and
// fails loudly — never silently — when a platform's markup moved.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'test-anywhere';

import { createFakeCommander } from './helpers/fake-commander.js';
import { habrCareerCvPlatform } from '../src/cv/platforms/habr-career.js';
import {
  assignPath,
  createCvRunner,
  dryRunPlan,
  hasUnresolved,
  mergeCv,
  resolveTemplate,
  selectorCandidates,
  valueAtPath,
} from '../src/cv/runner.js';
import { emptyCv } from '../src/cv/model.js';
import { createMemorySink } from '../src/cv/telemetry.js';

const stateJson = readFileSync(
  fileURLToPath(
    new URL('./fixtures/habr-career-profile-state.json', import.meta.url)
  ),
  'utf8'
);

const SSR = 'script[type="application/json"][data-ssr-state="true"]';

const habrPages = () => ({
  'https://career.habr.com/anna': {
    nodes: {
      [SSR]: [{ text: stateJson }],
      '.page-title__title': [{ text: 'Анна Буянова' }],
      '.skills-list-show-item--profile': [
        { text: 'Ruby' },
        { text: 'Kubernetes' },
      ],
      body: [{ text: '', html: '<body><div data-qa="resume">cv</div></body>' }],
    },
  },
});

describe('runner helpers', () => {
  it('splits selector candidates without breaking attribute selectors', () => {
    expect(selectorCandidates('#a, [data-qa="x,y"], .b')).toEqual([
      '#a',
      '[data-qa="x,y"]',
      '.b',
    ]);
    expect(selectorCandidates('button:has-text("Save, now")')).toEqual([
      'button:has-text("Save, now")',
    ]);
  });

  it('resolves templates and reports what it could not resolve', () => {
    const vars = { login: 'anna', editTargets: { about: '/edit/about' } };
    expect(resolveTemplate('{{login}}/{{editTargets.about}}', vars)).toBe(
      'anna//edit/about'
    );
    expect(hasUnresolved(resolveTemplate('{{missing}}', vars))).toBe(true);
    expect(hasUnresolved(resolveTemplate('{{login}}', vars))).toBe(false);
  });

  it('assigns scalars, lists and records at canonical paths', () => {
    const cv = emptyCv();
    assignPath(cv, 'basics.name', '  Anna  ');
    assignPath(cv, 'preferences.remote', 'yes');
    assignPath(cv, 'skills', ['Ruby', 'ruby', 'Go']);
    assignPath(cv, 'languages', ['English — Fluent']);
    assignPath(
      cv,
      'experience',
      [{ company: 'Acme', title: 'Dev', period: 'Jan 2019 — Present' }],
      { durationField: 'period' }
    );
    expect(cv.basics.name).toBe('Anna');
    expect(cv.preferences.remote).toBe(true);
    expect(cv.skills).toEqual(['Ruby', 'Go']);
    expect(cv.languages[0]).toEqual({ name: 'English', level: 'Fluent' });
    expect(cv.experience[0].start).toBe('2019-01');
    expect(cv.experience[0].current).toBe(true);
    expect(valueAtPath(cv, 'basics.name')).toBe('Anna');
  });

  it('refuses to assign a path the model does not know', () => {
    let message = '';
    try {
      assignPath(emptyCv(), 'nonsense.field', 'x');
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('unknown CV path');
  });

  it('merges only the sections a mapper claims to provide', () => {
    const cv = emptyCv();
    cv.basics.name = 'Kept';
    mergeCv(cv, { basics: { name: '', headline: 'Lead' }, skills: ['Go'] }, [
      'basics',
      'skills',
    ]);
    expect(cv.basics.name).toBe('Kept');
    expect(cv.basics.headline).toBe('Lead');
    expect(cv.skills).toEqual(['Go']);
  });
});

describe('runner read plans', () => {
  it('reads a CV through the real habr plan against a fake page', async () => {
    const commander = createFakeCommander({ pages: habrPages() });
    const sink = createMemorySink();
    const runner = createCvRunner({
      platform: habrCareerCvPlatform,
      commander,
      vars: { login: 'anna' },
      sink,
    });
    const result = await runner.read();

    expect(result.platform).toBe('habr-career');
    expect(result.cv.basics.name).toBe('Анна Буянова');
    expect(result.cv.experience[0].start).toBe('2025-01');
    // The DOM skill list merges on top of the JSON mapper's skills.
    expect(result.cv.skills).toContain('Kubernetes');
    expect(result.cv.skills).toContain('Ruby on Rails');
    expect(result.url).toBe('https://career.habr.com/anna');
    expect(commander.calls.goto[0]).toBe('https://career.habr.com/anna');
    expect(commander.calls.screenshot).toBe(1);

    const types = sink.events.map((event) => event.type);
    expect(types[0]).toBe('run.start');
    expect(types).toContain('markup.fingerprint');
    expect(types[types.length - 1]).toBe('run.finish');
    expect(result.report.counts['step.error']).toBeUndefined();
  });

  it('tolerates optional misses and lists them as warnings', async () => {
    const pages = habrPages();
    delete pages['https://career.habr.com/anna'].nodes[
      '.skills-list-show-item--profile'
    ];
    const sink = createMemorySink();
    const runner = createCvRunner({
      platform: habrCareerCvPlatform,
      commander: createFakeCommander({ pages }),
      vars: { login: 'anna' },
      sink,
    });
    const result = await runner.read();
    expect(result.warnings.join(' ')).toContain('skills');
    expect(sink.filter('step.miss').length).toBeGreaterThan(0);
    // The JSON mapper still filled the CV, so the run is usable.
    expect(result.cv.basics.name).toBe('Анна Буянова');
  });

  it('fails a required step instead of returning an empty CV', async () => {
    const pages = habrPages();
    pages['https://career.habr.com/anna'].nodes[SSR] = [];
    const runner = createCvRunner({
      platform: habrCareerCvPlatform,
      commander: createFakeCommander({ pages }),
      vars: { login: 'anna' },
    });
    let code = '';
    try {
      await runner.read();
    } catch (error) {
      code = error.code;
    }
    expect(code).toBe('step-missed');
  });

  it('detects an expired session from the redirect to login', async () => {
    const pages = habrPages();
    pages['https://career.habr.com/anna'].redirectTo =
      'https://career.habr.com/users/sign_in';
    pages['https://career.habr.com/users/sign_in'] = { nodes: {} };
    const runner = createCvRunner({
      platform: {
        ...habrCareerCvPlatform,
        read: habrCareerCvPlatform.read
          .slice(0, 2)
          .map((step) =>
            step.action === 'requireUrl'
              ? { ...step, pattern: 'career\\.habr\\.com/anna' }
              : step
          ),
      },
      commander: createFakeCommander({ pages }),
      vars: { login: 'anna' },
    });
    let code = '';
    try {
      await runner.read();
    } catch (error) {
      code = error.code;
    }
    expect(code).toBe('login-required');
  });
});

describe('runner update plans', () => {
  const editablePages = () => {
    const pages = habrPages();
    pages['https://career.habr.com/anna'].nodes[SSR] = [
      {
        text: JSON.stringify({
          resume: {
            about: { edit: 'https://career.habr.com/resume/edit/about' },
            companies: { edit: null },
            education: { edit: null },
            additionalEducation: { edit: null },
          },
          user: { contacts: { edit: null } },
        }),
      },
    ];
    pages['https://career.habr.com/resume/edit/about'] = {
      nodes: {
        '#resume_about': [{ text: '' }],
        'button[type="submit"]': [{ text: 'Save' }],
        form: [{ text: '', html: '<form><textarea></textarea></form>' }],
      },
    };
    return pages;
  };

  it('fills only the group guarding the requested path', async () => {
    const commander = createFakeCommander({ pages: editablePages() });
    const sink = createMemorySink();
    const runner = createCvRunner({
      platform: habrCareerCvPlatform,
      commander,
      vars: { login: 'anna' },
      sink,
    });
    const result = await runner.update(
      { basics: { summary: 'New summary' } },
      { paths: ['basics.summary'] }
    );

    expect(result.applied).toEqual(['about']);
    expect(commander.calls.fill[0].text).toBe('New summary');
    expect(commander.calls.click[0]).toContain('submit');
    expect(sink.filter('value.write')[0].path).toBe('basics.summary');
    expect(result.report.counts['step.error']).toBeUndefined();
  });

  it('skips a fill when the CV has nothing for that path', async () => {
    const commander = createFakeCommander({ pages: editablePages() });
    const sink = createMemorySink();
    const runner = createCvRunner({
      platform: habrCareerCvPlatform,
      commander,
      vars: { login: 'anna' },
      sink,
    });
    await runner.update({ basics: { name: 'Anna' } }, { groups: ['about'] });
    expect(commander.calls.fill.length).toBe(0);
    expect(sink.filter('step.skip')[0].reason).toContain('basics.summary');
  });

  it('warns when a field was written but could not be verified', async () => {
    const pages = editablePages();
    pages['https://career.habr.com/resume/edit/about'].unverifiedFills = [
      '#resume_about',
    ];
    const runner = createCvRunner({
      platform: habrCareerCvPlatform,
      commander: createFakeCommander({ pages }),
      vars: { login: 'anna' },
    });
    const result = await runner.update(
      { basics: { summary: 'New summary' } },
      { groups: ['about'] }
    );
    expect(result.warnings.join(' ')).toContain('written but not verified');
  });
});

describe('dry runs', () => {
  it('describes a plan without a browser', () => {
    const plan = dryRunPlan(habrCareerCvPlatform);
    expect(plan.platform).toBe('habr-career');
    expect(plan.read[0].action).toBe('goto');
    expect(plan.read.every((step) => typeof step.confidence === 'string')).toBe(
      true
    );
    expect(plan.update[0].paths).toContain('basics.summary');
    expect(plan.evidence.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(plan)).draftCount).toBe(
      habrCareerCvPlatform.draftCount
    );
  });
});
