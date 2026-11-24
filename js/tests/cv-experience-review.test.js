import test from 'node:test';
import assert from 'node:assert/strict';
import { finished } from 'node:stream/promises';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { foregroundExperienceReview } from '../src/cli/cv-experience-review-command.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { createExperienceReviewService } from '../src/cv/experience-review-service.js';
import {
  newExperienceReview,
  experienceReviewKey,
  reviewChildId,
} from '../src/cv/experience-review-record.js';
import { createExperienceAutoService } from '../src/cv/experience-auto-service.js';
import { experienceAutoOptions } from '../src/cv/experience-auto-record.js';
import { createHhExperienceAcquisition } from '../src/cv/experience-hh-acquisition.js';
import { createExperiencePlanningService } from '../src/cv/experience-plan-service.js';
import { createLinkedinExperienceService } from '../src/cv/linkedin-experience-service.js';
import {
  experienceReviewFixture,
  saveFreshReviewExport,
} from '../../experiments/issue-56/experience-review-fixture.mjs';
import {
  cvFixtureRequest,
  startCvFixtureServer,
} from '../../experiments/issue-56/cv-fixture-server.mjs';
import {
  completeWorkplaceExperience,
  seedWorkplaceExperience,
} from '../../experiments/issue-56/cv-workplace-experience-fixture.mjs';

const until = async (read, check) => {
  let row;
  for (let attempt = 0; attempt < 200; attempt++) {
    row = await read();
    if (check(row)) {
      return row;
    }
    await delay(20);
  }
  assert.fail(
    `Review did not reach the expected state: ${JSON.stringify(row)}`
  );
};
const phaseIs = (name) => (row) => row.phase === name;
const requestFor = (row, decision) => ({
  requestId: row.requestId,
  key: row.current.key,
  nativeRequestId: row.current.input.requestId,
  decision,
});
const wait = (signal) => delay(15, null, { signal });

const runNative = (calls) => async (change, signal, update, decision) => {
  calls.push('open');
  await update({ phase: 'prepared' });
  while (!decision()) {
    await wait(signal);
  }
  calls.push(decision());
  if (decision() === 'skip') {
    return { phase: 'skipped' };
  }
  await update({ phase: 'saving', initiator: 'cli-or-api' });
  return {
    phase: 'saved',
    save: {
      evidence: 'verified-hh-about-export',
      exports: [{ hash: change.hash, sha256: 'f'.repeat(64) }],
    },
  };
};

test(
  'experience review checks each decision and replans from a verified refresh in both Lino encodings',
  { timeout: 15000 },
  async () => {
    const fixture = await experienceReviewFixture();
    const calls = [];
    let stale = true;
    let reads = 0;
    const server = await startCvFixtureServer({
      store: fixture.store,
      cv: {
        experience: {
          read: fixture.read,
          hhWorkplace: { prepareJob: runNative(calls) },
        },
      },
      vacancies: {
        artifactRoot: fixture.artifactRoot,
        readResumeExports: async ({ resume, signal }, progress) => {
          assert.equal(resume, fixture.input.hash);
          signal.throwIfAborted();
          reads++;
          const receipt = await saveFreshReviewExport(fixture, resume, {
            ...fixture.cv,
            about: stale ? fixture.cv.about : fixture.source.profile.about,
          });
          await progress({ total: 1, result: receipt });
        },
      },
    });
    const send = cvFixtureRequest(
      `http://127.0.0.1:${server.port}/api/cv/experience/`,
      ['review-status', 'plan-status']
    );
    try {
      for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
        const request = { requestId: `review-${index}` };
        const input = { ...fixture.input, ...request };
        const status = async () =>
          (await send('review-status', type, request)).row;
        assert.equal(
          (await send('review-start', type, input, 'https://untrusted.example'))
            .response.status,
          403
        );
        const start = await send('review-start', type, input);
        assert.equal(start.response.status, 200);
        assert.equal(
          start.response.headers.get('cache-control'),
          'private, no-store'
        );
        const first = await until(status, phaseIs('prepared'));
        assert.equal(first.current.key, 'about');
        assert.deepEqual(
          calls,
          index === 0 ? ['open'] : ['open', 'save', 'open']
        );
        assert.equal(
          (
            await send('review-decide', type, {
              ...requestFor(first, 'save'),
              nativeRequestId: 'some-other-draft',
            })
          ).response.status,
          409
        );
        const decision = index === 0 ? 'save' : 'skip';
        assert.equal(
          (await send('review-decide', type, requestFor(first, decision)))
            .response.status,
          200
        );
        if (index === 0) {
          const blocked = await until(status, phaseIs('interrupted'));
          assert.equal(blocked.lastPhase, 'refreshing');
          assert.equal(blocked.history.length, 0);
          assert.equal(reads, 1);
          assert.deepEqual(calls, ['open', 'save']);
          stale = false;
          assert.equal(
            (await send('review-resume', type, request)).response.status,
            200
          );
        }
        const finished = await until(status, phaseIs('completed'));
        assert.deepEqual(
          finished.history.map(({ key, outcome }) => [key, outcome]),
          [['about', index === 0 ? 'saved' : 'skipped']]
        );
        if (index === 0) {
          assert.equal(finished.comparison.linkedin, first.comparison.linkedin);
          assert.notEqual(finished.comparison.hh, first.comparison.hh);
          assert.equal(finished.history[0].revision, finished.comparison.hh);
          const fresh = (
            await send('plan-status', type, {
              requestId: finished.comparison.requestId,
            })
          ).row;
          assert.deepEqual(fresh.plan.profile.fields, []);
          assert.deepEqual(calls, ['open', 'save']);
          // Restore the original fixture export for a separate Skip request.
          for (const record of fixture.rows.filter(({ id }) =>
            id.startsWith('jobs-resume-export:')
          )) {
            await fixture.store.put(record);
          }
        } else {
          assert.deepEqual(finished.comparison, first.comparison);
          assert.deepEqual(calls, ['open', 'save', 'open', 'skip']);
          assert.equal(reads, 2);
        }
        const saved = await fixture.store.get(
          experienceReviewKey(request.requestId)
        );
        const beforeRecovery = { calls: [...calls], reads };
        await fixture.store.put({ ...saved, phase: 'selecting' });
        assert.equal((await status()).lastPhase, 'selecting');
        assert.equal(
          (await send('review-resume', type, request)).response.status,
          200
        );
        assert.deepEqual(await until(status, phaseIs('completed')), finished);
        assert.deepEqual({ calls, reads }, beforeRecovery);
        assert.equal(
          (await send('review-decide', type, requestFor(first, 'save')))
            .response.status,
          409
        );
      }
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);

test(
  'a restarted review selects the next editor from the verified checkpoint without replaying Save',
  { timeout: 10000 },
  async () => {
    const fixture = await experienceReviewFixture();
    const requestId = 'selecting-after-save';
    const auto = experienceAutoOptions({ ...fixture.input, requestId });
    const row = newExperienceReview(requestId, auto, 'a'.repeat(32));
    const calls = [];
    const service = createExperienceReviewService({
      store: fixture.store,
      wait,
      native: {
        prepare: async (plan, key, id) => {
          calls.push(['prepare', key, id, plan.options.hh]);
          return {
            kind: 'hh-workplace',
            input: { requestId: id, fingerprint: plan.fingerprint },
          };
        },
        reviewer: () => {
          let phase = 'prepared';
          const status = () => ({ phase, providerSaved: false });
          return {
            start: async () => {
              calls.push(['open']);
              return status();
            },
            status: async () => status(),
            decide: async (decision) => {
              calls.push([decision]);
              phase = 'skipped';
              return status();
            },
            stop: async () => {
              phase = 'stopped';
              return status();
            },
            running: phaseIs('prepared'),
          };
        },
      },
    });
    try {
      const { hh, linkedin, added } = await seedWorkplaceExperience(fixture);
      linkedin.jobs = [...hh.document.jobs, added];
      const plan = await completeWorkplaceExperience(
        fixture.store,
        hh,
        linkedin
      );
      const position = plan.plan.jobs.find(({ kind }) => kind === 'add');
      const key = `position-${position.sourceIndex}`;
      const comparison = {
        requestId: plan.requestId,
        fingerprint: plan.fingerprint,
        hh: hh.revision,
        linkedin: plan.options.linkedin,
        to: 'hh',
      };
      const receipt = {
        key: 'about',
        outcome: 'saved',
        revision: hh.revision,
        evidence: 'verified-hh-about-export',
        code: null,
        notes: [],
      };
      const checkpoint = {
        ...row,
        phase: 'selecting',
        auto,
        comparison,
        pending: [key],
        history: [receipt],
      };
      const request = { requestId };
      const status = () => service.status(request);
      await fixture.store.put({
        ...checkpoint,
        current: {
          key,
          kind: 'hh-workplace',
          input: {
            requestId: reviewChildId(checkpoint, 'native'),
            fingerprint: plan.fingerprint,
          },
          decision: 'save',
        },
      });
      await assert.rejects(service.resume(request), {
        code: 'cv-experience-review-record',
      });
      await fixture.store.put(checkpoint);
      const interrupted = await status();
      assert.equal(interrupted.phase, 'interrupted');
      assert.equal(interrupted.lastPhase, 'selecting');
      assert.deepEqual(await service.start(auto), interrupted);
      assert.deepEqual(calls, []);

      await service.resume(request);
      const prepared = await until(status, phaseIs('prepared'));
      const child = reviewChildId(checkpoint, 'native');
      assert.equal(prepared.current.input.requestId, child);
      assert.deepEqual(prepared.history, [receipt]);
      assert.deepEqual(prepared.comparison, comparison);
      await assert.rejects(service.resume(request), {
        code: 'cv-experience-review-busy',
      });
      await service.decide(requestFor(prepared, 'skip'));
      const completed = await until(status, phaseIs('completed'));
      assert.deepEqual(
        completed.history.map(({ outcome }) => outcome),
        ['saved', 'skipped']
      );
      assert.deepEqual(calls, [
        ['prepare', key, child, hh.revision],
        ['open'],
        ['skip'],
      ]);
    } finally {
      await service.close();
      await fixture.close();
    }
  }
);

test(
  'the queue retains an exact fresh target before opening a second editor and EOF drains it without replay',
  { timeout: 10000 },
  async () => {
    const fixture = await experienceReviewFixture();
    fixture.source.jobs = [
      ...fixture.source.jobs,
      {
        company: 'Second native review',
        title: 'Engineer',
        start: '2022-01',
        end: '2023-01',
        current: false,
        native: {},
      },
    ];
    const hh = createHhExperienceAcquisition({
      store: fixture.store,
      artifactRoot: fixture.artifactRoot,
      getVacancies: () => ({
        'resume-export': async ({ requestId, resume }) => {
          const result = await saveFreshReviewExport(fixture, resume, {
            ...fixture.cv,
            about: fixture.source.profile.about,
          });
          return { requestId, state: 'completed', results: [result] };
        },
      }),
      wait,
    });
    const linkedin = createLinkedinExperienceService({
      store: fixture.store,
      read: fixture.read,
    });
    const plan = createExperiencePlanningService({ store: fixture.store });
    const getters = {
      store: fixture.store,
      getHh: () => hh,
      getLinkedin: () => linkedin,
      getPlan: () => plan,
      wait,
    };
    const auto = createExperienceAutoService(getters);
    const calls = [];
    const outcomes = new Map();
    let stops = 0;
    const native = {
      prepare: async (plan, key, requestId) => {
        calls.push([key, plan.options.hh]);
        return {
          kind: key === 'about' ? 'hh-about' : 'hh-workplace',
          input: {
            requestId,
            fingerprint: plan.fingerprint,
            ...(key === 'about' && { planRequestId: plan.requestId }),
          },
        };
      },
      reviewer: ({ input }) => {
        const get = () => outcomes.get(input.requestId);
        const set = (phase) => {
          const row = {
            phase,
            providerSaved: phase === 'saved',
            ...(phase === 'saved' && {
              save: { evidence: 'verified-hh-about-export' },
            }),
          };
          outcomes.set(input.requestId, row);
          return row;
        };
        return {
          start: async () => set('prepared'),
          status: async () => get(),
          stop: async () => {
            stops++;
            return set('stopped');
          },
          decide: async () => set('saved'),
          running: phaseIs('prepared'),
        };
      },
      confirmFresh: async (_item, _plan, _result, before, fresh) => {
        assert.notEqual(fresh.revision, before.revision);
        assert.equal(
          fresh.document.profile.about,
          fixture.source.profile.about
        );
      },
    };
    const service = createExperienceReviewService({
      ...getters,
      getAuto: () => auto,
      native,
    });
    const stdin = new PassThrough();
    const request = { requestId: 'review-foreground' };
    try {
      const run = foregroundExperienceReview(
        service,
        { ...fixture.input, ...request },
        {
          stdin,
          foregroundWait: () => delay(15),
          notice: (message) => {
            if (message.startsWith('Review the About')) {
              stdin.write('y\n');
            } else if (message.startsWith('Review the position')) {
              stdin.end();
            }
          },
        }
      );
      const result = await run;
      assert.equal(result.phase, 'left', JSON.stringify(result));
      assert.equal(stops, 1);
      assert.equal(result.history[0].outcome, 'saved');
      assert.deepEqual(
        calls.map(([key]) => key),
        ['about', 'position-1']
      );
      assert.notEqual(calls[0][1], calls[1][1]);
      assert.equal(calls[1][1], result.history[0].revision);
      await assert.rejects(service.resume(request), {
        code: 'cv-experience-review-conflict',
      });
      assert.deepEqual(
        await service.start({ ...fixture.input, ...request }),
        result
      );
      assert.equal(outcomes.size, 2);
      await finished(stdin);
    } finally {
      stdin.destroy();
      await service.close();
      await auto.close();
      await hh.close();
      await linkedin.close();
      await plan.close();
      await fixture.close();
    }
  }
);
