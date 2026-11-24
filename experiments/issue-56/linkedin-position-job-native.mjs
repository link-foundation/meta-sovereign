import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { openBrowserSession } from '../../js/src/cv/browser.js';
import {
  createLinkedinPositionJobs,
  linkedinPositionRunning,
  readLinkedinPositionJob,
} from '../../js/src/cv/linkedin-position-job.js';
import { createLinkedinPositionReviews } from '../../js/src/cv/linkedin-position-review.js';
import { linkedinPositionFixtureUrl } from './linkedin-experience-fixture.mjs';
import { linkedinPositionFormHtml } from './linkedin-position-form-fixture.mjs';
import { linkedinPositionExperienceHtml } from './linkedin-position-native.mjs';
import {
  linkedinPositionReference,
  linkedinPositionReviewFixture,
} from './linkedin-position-review-fixture.mjs';

export const waitForLinkedinPositionPhase = async (
  jobs,
  input,
  expected,
  trace
) => {
  const deadline = Date.now() + 12000;
  let last;
  while (Date.now() < deadline) {
    const row = await jobs.status(input);
    last = row.phase;
    if (row.phase === expected || !linkedinPositionRunning(row)) {
      assert.equal(row.phase, expected, JSON.stringify(row));
      return row;
    }
    await delay(30);
  }
  throw new Error(
    `LinkedIn position job did not reach ${expected}. ${JSON.stringify({ last, trace })}`
  );
};

const until = waitForLinkedinPositionPhase;

export const verifyLinkedinPositionJob = async (browser) => {
  const fixture = await linkedinPositionReviewFixture();
  const browserContext = await browser.newContext();
  let jobs;
  try {
    await browserContext.addCookies([
      {
        name: 'li_at',
        value: 'synthetic-cookie',
        domain: '.linkedin.com',
        path: '/',
      },
    ]);
    const page = await browserContext.newPage();
    const { store, row, linkedin } = fixture;
    const url = linkedin.document.source.url;
    const skillsUrl = url.replace(/experience\/$/u, 'skills/');
    const editor = linkedinPositionFixtureUrl('1101');
    const service = createLinkedinPositionReviews(fixture);
    const draft = await service.stage(linkedinPositionReference(row, 'update'));
    const approval = await service.review({ fingerprint: draft.fingerprint });
    let saved = false;
    let lags = false;
    let skillPicker = false;
    let launches = 0;
    let detaches = 0;
    const writes = [];
    const trace = [];
    page.on('pageerror', (error) => trace.push(['page-error', error.message]));
    page.on('requestfailed', (request) =>
      trace.push(['request-failed', request.failure()])
    );
    page.on('domcontentloaded', () => trace.push(['loaded', page.url()]));
    await browserContext.route('**/*', async (route) => {
      const request = route.request();
      const target = request.url();
      trace.push([request.method(), target]);
      if (target === 'https://www.linkedin.com/fixture-position-save') {
        assert.equal(request.method(), 'POST');
        writes.push(request.postData());
        saved = !lags;
        return route.fulfill({ status: 200, body: 'ok' });
      }
      if (target === skillsUrl && request.method() === 'GET') {
        return route.fulfill({
          contentType: 'text/html',
          body: `<main><h1>Skills</h1><ul><li class="pvs-list__paged-list-item"><h3>Rust</h3></li>${skillPicker ? '<li class="pvs-list__paged-list-item"><h3>PostgreSQL</h3></li>' : ''}</ul></main>`,
        });
      }
      if ((target !== url && target !== editor) || request.method() !== 'GET') {
        return route.abort();
      }
      let experience = linkedinPositionExperienceHtml;
      if (saved && skillPicker) {
        experience = experience.replace(
          'Skills: Rust</a>',
          'Skills: Rust</a><a href="https://www.linkedin.com/skill-associations-details/PostgreSQL/">Skills: PostgreSQL</a>'
        );
      } else if (saved) {
        experience = experience.replace(
          'Worked on Rust and PostgreSQL.',
          approval.desired.description
        );
      }
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body:
          target === url
            ? experience
            : linkedinPositionFormHtml({ actions: true, skillPicker }),
      });
    });
    jobs = createLinkedinPositionJobs({
      ...fixture,
      profileDir: path.join(fixture.dir, 'position-job'),
      wait: (ms, signal) => delay(Math.min(25, ms), undefined, { signal }),
      openSession: (options) =>
        openBrowserSession({
          ...options,
          launcher: async () => {
            launches++;
            return {
              page,
              detach: async () => {
                detaches++;
              },
            };
          },
        }),
    });
    const prepare = async (id) => {
      const input = {
        requestId: `position-${id}`,
        fingerprint: approval.fingerprint,
      };
      await jobs.start(input);
      const prepared = await until(jobs, input, 'prepared', trace);
      assert.equal(prepared.providerSaved, false);
      assert.deepEqual(prepared.unapplied, ['skills', 'media']);
      return input;
    };

    const skip = await prepare('skip');
    await jobs.decide({ ...skip, decision: 'skip' });
    assert.equal((await until(jobs, skip, 'skipped')).providerSaved, false);
    assert.deepEqual(writes, []);

    const leave = await prepare('leave');
    assert.equal((await jobs.stop(leave)).phase, 'stopped');
    assert.equal(await page.locator('dialog').isVisible(), true);
    assert.deepEqual(writes, []);
    await page.goto(url);

    const closed = await prepare('closed');
    await page.goto(url);
    assert.equal((await until(jobs, closed, 'closed')).providerSaved, false);
    assert.deepEqual(writes, []);

    const manual = await prepare('owner-save');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const verified = await until(jobs, manual, 'saved');
    assert.equal(verified.providerSaved, true);
    assert.equal(verified.initiator, 'browser');
    assert.equal(verified.save.editor, editor);
    assert.equal(
      verified.save.values.description,
      approval.desired.description
    );
    assert.equal((await readLinkedinPositionJob(store, manual)).phase, 'saved');
    assert.deepEqual(await jobs.start(manual), verified);
    assert.equal(launches, 4);
    assert.deepEqual(writes, [approval.desired.description]);

    saved = false;
    lags = true;
    const stale = await prepare('stale');
    await jobs.decide({ ...stale, decision: 'save' });
    const unconfirmed = await until(jobs, stale, 'unconfirmed');
    assert.equal(unconfirmed.providerSaved, false);
    assert.equal(unconfirmed.initiator, 'cli-or-api');
    assert.equal(unconfirmed.save, null);
    assert.deepEqual(await jobs.start(stale), unconfirmed);
    assert.deepEqual(writes, [
      approval.desired.description,
      approval.desired.description,
    ]);
    assert.equal(launches, 5);

    skillPicker = true;
    lags = false;
    saved = false;
    const skillsOnly = async (names, id) => {
      const source = globalThis.structuredClone(fixture.hh);
      const original = linkedin.document.jobs.find(
        ({ title }) => title === 'Lead engineer'
      );
      source.jobs = [{ ...original, native: {}, skills: names }];
      const plan = await fixture.complete({ source });
      const proposal = await service.stage(
        linkedinPositionReference(plan, 'update')
      );
      const reviewed = await service.review({
        fingerprint: proposal.fingerprint,
      });
      assert.deepEqual(reviewed.fields, {});
      return { requestId: id, fingerprint: reviewed.fingerprint };
    };
    const skill = await skillsOnly(
      ['Rust', 'PostgreSQL', 'ClickUp'],
      'position-skill'
    );
    await jobs.start(skill);
    const prepared = await until(jobs, skill, 'prepared', trace);
    assert.deepEqual(prepared.preparedSkills, ['PostgreSQL']);
    assert.deepEqual(prepared.unresolvedSkills, ['ClickUp']);
    assert.equal(prepared.canSave, true);
    assert.equal(
      await page.getByRole('checkbox', { name: 'Rust' }).isChecked(),
      true
    );
    assert.equal(
      await page
        .getByRole('checkbox', { name: 'PostgreSQL', exact: true })
        .isChecked(),
      true
    );
    assert.equal(
      await page.getByRole('checkbox', { name: 'ClickUp' }).count(),
      0
    );
    assert.equal(writes.length, 2);
    assert.equal(
      (await jobs.decide({ ...skill, decision: 'save' })).decisionPending,
      true
    );
    const skillSaved = await until(jobs, skill, 'saved', trace);
    assert.deepEqual(skillSaved.save.skills, ['PostgreSQL']);
    assert.deepEqual(JSON.parse(writes[2]).skills, ['Rust', 'PostgreSQL']);

    saved = false;
    lags = true;
    const staleSkill = { ...skill, requestId: 'position-skill-stale' };
    await jobs.start(staleSkill);
    await until(jobs, staleSkill, 'prepared', trace);
    await jobs.decide({ ...staleSkill, decision: 'save' });
    assert.equal(
      (await until(jobs, staleSkill, 'unconfirmed', trace)).providerSaved,
      false
    );
    assert.equal(writes.length, 4);

    const notOwned = await skillsOnly(
      ['Rust', 'ClickUp'],
      'position-skill-unlisted'
    );
    const editorVisits = () =>
      trace.filter(([, address]) => address === editor).length;
    const before = editorVisits();
    await jobs.start(notOwned);
    const noChanges = await until(jobs, notOwned, 'no-changes', trace);
    assert.deepEqual(noChanges.unresolvedSkills, ['ClickUp']);
    assert.equal(noChanges.providerSaved, false);
    assert.equal(editorVisits(), before);
    await jobs.close();
    assert.equal(detaches, 8);
    return {
      synthetic: true,
      observedOwnerSaves: 1,
      staleSavesUnconfirmed: 1,
      skipConfirmed: 1,
      leftOpen: 1,
      closeNotSave: 1,
      mutations: writes.length,
      verifiedSkillAdds: 1,
      unlistedSkillsClosedWithoutEditor: 1,
    };
  } finally {
    await jobs?.close();
    await browserContext.close();
    await fixture.close();
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  });
  try {
    console.log(JSON.stringify(await verifyLinkedinPositionJob(browser)));
  } finally {
    await browser.close();
  }
}
