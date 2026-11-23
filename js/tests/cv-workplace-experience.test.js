import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  completeWorkplaceExperience,
  cvWorkplaceExperienceFixture,
  workplaceExperienceInput,
} from '../../experiments/issue-56/cv-workplace-experience-fixture.mjs';
import { saveExperienceDocument } from '../src/cv/experience-store.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { confirmedCvWorkplacePlan } from '../src/jobs/cv-workplace-plan.js';
import { LINO_BINARY, LINO_TEXT, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';

test('a completed comparison stages an exact private workplace edit and requires a separate approval', async () => {
  const f = await cvWorkplaceExperienceFixture();
  try {
    assert.equal(f.row.phase, 'completed');
    const input = workplaceExperienceInput(f.row, 'update');
    const manual = await f.service['cv-workplace-plan'](f.proposal);
    const draft = await f.service['cv-workplace-plan'](input);
    const { plan } = await confirmedCvWorkplacePlan(draft, input);
    assert.equal(plan.status, 'draft');
    assert.equal(plan.recordId, '123');
    assert.deepEqual(plan.source.job, f.original.native);
    assert.equal(plan.desired.description, f.matched.description);
    assert.equal(plan.desired.end, '2024-08');
    assert.equal(plan.desired.current, false);
    assert.equal(plan.desired.areaId, '2');
    assert.equal(plan.desired.website, plan.baseline.website);
    assert.deepEqual(plan.desired.industryIds, plan.baseline.industryIds);
    assert.deepEqual(plan.experience, {
      ...input.experience,
      unapplied: ['media', 'skills'],
    });
    assert.deepEqual(await f.service['cv-workplace-plan'](input), draft);
    assert.equal(
      await f.store.get(`jobs-cv-workplace-plan:${plan.fingerprint}`),
      null
    );
    assert.deepEqual(
      (await f.store.get(`secret:jobs-cv-workplace-plan:${plan.fingerprint}`))
        .plan,
      plan
    );
    assert.deepEqual(await f.service['cv-workplace-plan-stored']({}), manual);
    const prepare = {
      requestId: randomUUID(),
      recordId: plan.recordId,
      changeId: 'en:workplace',
      reviewKind: 'workplace',
      fingerprint: plan.fingerprint,
    };
    assert.equal(
      (await f.service['cv-prepare'](prepare)).preparation.state,
      'failed'
    );
    assert.equal(f.calls.attached, 0);
    const review = await f.service['cv-workplace-review']({
      fingerprint: plan.fingerprint,
    });
    assert.equal(review.plan.status, 'reviewed');
    assert.equal(review.plan.previousFingerprint, plan.fingerprint);
    assert.deepEqual(
      await f.service['cv-workplace-review']({ fingerprint: plan.fingerprint }),
      review
    );
    const { preparation } = await f.service['cv-prepare']({
      ...prepare,
      requestId: randomUUID(),
      fingerprint: review.plan.fingerprint,
    });
    assert.equal(preparation.state, 'prepared');
    assert.equal(preparation.providerSaved, false);
    assert.deepEqual(f.calls, { attached: 1, detached: 1, prepared: 1 });
    const { cv, identity } = f.sources.find(
      ({ identity }) => identity.language === 'en'
    );
    await f.store.put({
      id: 'jobs-cv-snapshots:jobs',
      version: 1,
      browserSlot: 'jobs',
      snapshots: [
        {
          hash: identity.hash,
          cv: {
            ...cv,
            jobs: [{ ...cv.jobs[0], description: f.matched.description }],
          },
          savedAt: new Date().toISOString(),
          attemptId: randomUUID(),
          sha256: 'a'.repeat(64),
          evidence: 'verified-owner-save-native-export',
        },
      ],
    });
    await assert.rejects(f.service['cv-workplace-plan'](input), {
      code: 'jobs-cv-conflict',
    });
    assert.equal(
      (
        await f.service['cv-prepare']({
          ...prepare,
          requestId: randomUUID(),
          fingerprint: review.plan.fingerprint,
        })
      ).preparation.state,
      'failed'
    );
    assert.equal(f.calls.attached, 1);
  } finally {
    await f.close();
  }
});

test('the HeadHunter handoff refuses changed evidence, note-only rows and imported targets', async () => {
  const f = await cvWorkplaceExperienceFixture();
  try {
    const update = workplaceExperienceInput(f.row, 'update');
    await assert.rejects(
      f.service['cv-workplace-plan']({ ...update, fields: {} }),
      { code: 'jobs-cv-options' }
    );
    await assert.rejects(
      f.service['cv-workplace-plan']({ ...update, browserSlot: 'other' }),
      { code: 'jobs-cv-conflict' }
    );
    await assert.rejects(
      f.service['cv-workplace-plan']({
        ...update,
        experience: { ...update.experience, fingerprint: 'b'.repeat(64) },
      }),
      { code: 'jobs-cv-conflict' }
    );
    const { company, title, start, end, current } = f.original;
    f.linkedin.jobs = [
      { company, title, start, end, current, location: 'An unknown city' },
    ];
    const noteOnly = await completeWorkplaceExperience(
      f.store,
      f.hh,
      f.linkedin
    );
    await assert.rejects(
      f.service['cv-workplace-plan'](
        workplaceExperienceInput(noteOnly, 'update')
      ),
      { code: 'jobs-cv-experience-note' }
    );
    const imported = await saveExperienceDocument(f.store, f.hh.document);
    const unbound = await completeWorkplaceExperience(
      f.store,
      imported,
      f.linkedin
    );
    await assert.rejects(
      f.service['cv-workplace-plan'](
        workplaceExperienceInput(unbound, 'update')
      ),
      { code: 'jobs-cv-conflict' }
    );
    await appendFile(
      join(f.artifactRoot, f.proposal.exportId, f.proposal.hash, 'resume.json'),
      ' '
    );
    await assert.rejects(f.service['cv-workplace-plan'](update));
    assert.equal(f.calls.attached, 0);
    assert.deepEqual(await f.service['cv-workplace-plan-stored']({}), {
      plan: null,
    });
  } finally {
    await f.close();
  }
});

test('CLI and both Lino encodings stage the same independent target-only Add', async () => {
  const f = await cvWorkplaceExperienceFixture();
  try {
    const input = workplaceExperienceInput(f.row, 'add');
    const { requestId, fingerprint, jobIndex } = input.experience;
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      artifactRoot: f.artifactRoot,
    });
    let draft;
    assert.equal(
      await commands['vacancies-cv-workplace-plan'](
        {
          'experience-request-id': requestId,
          'experience-fingerprint': fingerprint,
          'experience-job-index': String(jobIndex),
        },
        (output) => {
          draft = decodeWire(output);
        }
      ),
      0
    );
    await confirmedCvWorkplacePlan(draft, input);
    assert.equal(draft.plan.recordId, null);
    assert.equal(draft.plan.source.job, null);
    assert.equal(draft.plan.operation, 'add');
    assert.equal(draft.plan.desired.company, f.added.company);
    assert.deepEqual(draft.plan.changes[0].after, [
      { hash: f.proposal.hash, checked: true },
    ]);
    await withRoutes(async (base) => {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const answer = await wirePost(base, 'cv-workplace-plan', input, type);
        assert.equal(answer.status, 200);
        assert.deepEqual(
          await confirmedCvWorkplacePlan(answer.value, input),
          draft
        );
      }
    }, f.routeOptions);
    assert.equal(f.calls.attached, 0);
  } finally {
    await f.close();
  }
});
