import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import {
  cvWorkplaceExperienceFixture,
  workplaceExperienceInput,
} from '../../experiments/issue-56/cv-workplace-experience-fixture.mjs';
import { createHhExperienceWorkplaceCommands } from '../src/cli/cv-hh-experience-workplace-command.js';
import {
  createHhExperienceWorkplaceJobs,
  readHhExperienceWorkplaceJob,
} from '../src/cv/experience-hh-workplace-job.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import {
  cvFixtureRequest,
  startCvFixtureServer,
} from '../../experiments/issue-56/cv-fixture-server.mjs';
import {
  cvWorkplacePreparationSource,
  hhExperienceWorkplacePreparationSource,
} from '../src/jobs/cv-workplace-review-service.js';
import { cvWorkplacePlanJob } from '../src/jobs/cv-workplace-plan.js';
import { resolveHhExperienceWorkplace } from '../src/jobs/cv-experience-workplace-resolve.js';

const ready = async (status, accepts) => {
  for (let i = 0; i < 200; i++) {
    const row = await status();
    if (accepts.includes(row.phase)) {
      return row;
    }
    await delay(5);
  }
  throw new Error('The workplace review did not reach the expected status.');
};
const approval = async (fixture, bindRecord = true) => {
  const input = workplaceExperienceInput(fixture.row, 'update');
  if (!bindRecord) {
    delete input.recordId;
  }
  const { plan } = await fixture.service['cv-workplace-plan'](input);
  const reviewed = await fixture.service['cv-workplace-review']({
    fingerprint: plan.fingerprint,
  });
  return { draft: plan, plan: reviewed.plan };
};

test(
  'a directed review without a record ID binds only an exact and unique native baseline',
  { timeout: 5000 },
  async () => {
    const fixture = await cvWorkplaceExperienceFixture();
    try {
      const { plan } = await approval(fixture, false);
      assert.equal(plan.recordId, null);
      assert.equal(plan.operation, undefined);
      const input = { fingerprint: plan.fingerprint };
      await assert.rejects(cvWorkplacePreparationSource(fixture, input), {
        code: 'jobs-cv-conflict',
      });
      const change = await hhExperienceWorkplacePreparationSource(
        fixture,
        input
      );
      const job = cvWorkplacePlanJob(change.plan, 'baseline', 'en');
      const baseline = {
        ...job,
        metadataEditable: true,
        locale: 'en',
        industryText: job.industries.map(({ name }) => name).join(', '),
      };
      const target = { hash: change.hash, checked: true };
      const other = { hash: 'another-cv', checked: true };
      const page = { url: () => `https://hh.ru/resume/${change.hash}` };
      const resolve = (records) =>
        resolveHhExperienceWorkplace({
          session: { page },
          change,
          check: () => {},
          readIds: async () => Object.keys(records),
          readWorkplace: async ({ attempt, check }) => {
            check();
            return { ...baseline, ...records[attempt.recordId] };
          },
        });
      const exact = { resumes: [target] };
      const match = await resolve({
        123: exact,
        234: { resumes: [other] },
        345: { ...exact, description: 'Edited by owner' },
      });
      assert.equal(match.workplace.recordId, '123');
      assert.equal(match.plan.fingerprint, plan.fingerprint);
      assert.equal(match.plan.recordId, null);
      await assert.rejects(resolve({ 123: exact, 234: exact }), {
        code: 'jobs-cv-experience-record-ambiguous',
      });
      await assert.rejects(resolve({ 123: { resumes: [target, other] } }), {
        code: 'jobs-cv-shared',
      });
      await assert.rejects(resolve({ 123: { resumes: [other] } }), {
        code: 'jobs-cv-baseline',
      });
    } finally {
      await fixture.close();
    }
  }
);
const stubBrowser =
  (events, outcome = 'saved') =>
  async (change, signal, update, selection) => {
    events.push(['open', change.workplace.recordId, change.plan.browserSlot]);
    try {
      await update({ phase: 'prepared' });
      while (!selection()) {
        await delay(5, undefined, { signal });
      }
      events.push(selection());
      if (selection() === 'skip') {
        return { phase: 'skipped' };
      }
      await update({ phase: 'saving', initiator: 'cli-or-api' });
      await update({ phase: 'verifying' });
      if (outcome === 'unconfirmed') {
        return { phase: 'unconfirmed' };
      }
      return {
        phase: 'saved',
        save: {
          evidence: 'verified-hh-workplace-export',
          exports: [
            {
              hash: change.hash,
              sha256: 'e'.repeat(64),
              workplace: {
                recordId: '123',
                sha256: 'a'.repeat(64),
                checked: true,
              },
            },
          ],
        },
      };
    } finally {
      events.push('detach');
    }
  };

test(
  'only an approved directed workplace can own a dedicated request; one uncertain Save is never replayed',
  { timeout: 5000 },
  async () => {
    const fixture = await cvWorkplaceExperienceFixture();
    const events = [];
    const jobs = createHhExperienceWorkplaceJobs({
      ...fixture,
      prepareJob: stubBrowser(events, 'unconfirmed'),
    });
    try {
      const { draft, plan } = await approval(fixture);
      const input = {
        requestId: 'existing-review',
        fingerprint: plan.fingerprint,
      };
      const draftInput = { requestId: 'draft', fingerprint: draft.fingerprint };
      await jobs.start(draftInput);
      assert.equal(
        (await ready(() => jobs.status(draftInput), ['failed'])).code,
        'jobs-cv-conflict'
      );
      assert.deepEqual(events, []);
      const generic = await fixture.service['cv-workplace-plan'](
        fixture.proposal
      );
      const genericReviewed = await fixture.service['cv-workplace-review']({
        fingerprint: generic.plan.fingerprint,
      });
      const genericInput = {
        requestId: 'generic',
        fingerprint: genericReviewed.plan.fingerprint,
      };
      await jobs.start(genericInput);
      assert.equal(
        (await ready(() => jobs.status(genericInput), ['failed'])).code,
        'jobs-cv-conflict'
      );
      assert.deepEqual(events, []);
      await jobs.start(input);
      const prepared = await ready(() => jobs.status(input), ['prepared']);
      assert.equal(prepared.experienceSlot, 'hh-experience-slot');
      assert.equal(prepared.providerSaved, false);
      assert.deepEqual(await jobs.start(input), prepared);
      assert.equal(
        (await readHhExperienceWorkplaceJob(fixture.store, input)).phase,
        'unknown'
      );
      await assert.rejects(
        jobs.decide({
          ...input,
          fingerprint: draft.fingerprint,
          decision: 'save',
        }),
        { code: 'cv-hh-workplace-decision' }
      );
      await assert.rejects(
        jobs.decide({ ...input, browserSlot: 'other-jobs', decision: 'save' }),
        { code: 'cv-hh-workplace-decision' }
      );
      assert.equal(
        (await jobs.decide({ ...input, decision: 'save' })).decisionPending,
        true
      );
      await assert.rejects(jobs.decide({ ...input, decision: 'save' }), {
        code: 'cv-hh-workplace-decision',
      });
      assert.equal(
        (await ready(() => jobs.status(input), ['unconfirmed'])).providerSaved,
        false
      );
      assert.equal((await jobs.start(input)).phase, 'unconfirmed');
      const retry = { ...input, requestId: 'new-id' };
      await jobs.start(retry);
      assert.equal(
        (await ready(() => jobs.status(retry), ['failed'])).code,
        'cv-hh-workplace-attempted'
      );
      assert.deepEqual(events, [['open', '123', 'jobs'], 'save', 'detach']);
    } finally {
      await jobs.close();
      await fixture.close();
    }
  }
);

test(
  'both default Lino encodings and the foreground CLI require an explicit exact workplace choice',
  { timeout: 10000 },
  async () => {
    const fixture = await cvWorkplaceExperienceFixture();
    const { plan } = await approval(fixture);
    const events = [];
    const options = { prepareJob: stubBrowser(events) };
    const server = await startCvFixtureServer({
      store: fixture.store,
      cv: { experience: { hhWorkplace: options } },
      vacancies: { artifactRoot: fixture.artifactRoot },
    });
    const request = cvFixtureRequest(
      `http://127.0.0.1:${server.port}/api/cv/experience/hh-workplace-`,
      ['status']
    );
    try {
      for (const [type, decision] of [
        [LINO_TEXT, 'skip'],
        [LINO_BINARY, 'save'],
      ]) {
        const input = {
          requestId: `wire-${decision}`,
          fingerprint: plan.fingerprint,
        };
        assert.equal(
          (await request('start', type, input)).response.status,
          200
        );
        const status = async () =>
          (await request('status', type, { requestId: input.requestId })).row;
        await ready(status, ['prepared']);
        assert.equal(
          (
            await request(
              'decide',
              type,
              { ...input, decision },
              'https://foreign.invalid'
            )
          ).response.status,
          403
        );
        assert.equal((await status()).providerSaved, false);
        if (decision === 'save') {
          const commands = createHhExperienceWorkplaceCommands(
            {
              openStore: async () => fixture.store,
              openReadOnly: async () => fixture.store,
            },
            {
              ...options,
              artifactRoot: fixture.artifactRoot,
              stdin: Readable.from([]),
              wait: () => delay(5),
              notice: () => {},
            }
          );
          let output;
          assert.equal(
            await commands['cv-experience-hh-workplace-start'](
              {
                fingerprint: plan.fingerprint,
                'request-id': 'foreground-eof',
              },
              (text) => {
                output = JSON.parse(text);
              }
            ),
            0
          );
          assert.equal(output.phase, 'stopped');
          assert.equal(output.providerSaved, false);
        }
        assert.equal(
          (await request('decide', type, { ...input, decision })).response
            .status,
          200
        );
        const row = await ready(status, [
          decision === 'save' ? 'saved' : 'skipped',
        ]);
        assert.equal(row.providerSaved, decision === 'save');
      }
      assert.deepEqual(
        events.filter((value) => typeof value === 'string'),
        ['skip', 'detach', 'detach', 'save', 'detach']
      );
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);
