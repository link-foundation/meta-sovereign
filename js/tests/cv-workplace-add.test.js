import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplaceFieldsFixture } from '../../experiments/issue-56/cv-workplace-fields-fixture.mjs';
import {
  confirmedCvWorkplacePlan,
  fingerprintCvWorkplacePlan,
} from '../src/jobs/cv-workplace-plan.js';
import {
  LINO_BINARY,
  LINO_TEXT,
  decodeWire,
  encodeWire,
} from '../src/transport/lino.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';

const fixture = async () => {
  const f = await cvWorkplaceFieldsFixture({ emptyWorkplaces: 'en' });
  const { exportId, hash, fields } = f.proposal;
  return { ...f, add: { operation: 'add', exportId, hash, fields } };
};
const request = (plan) => ({
  fingerprint: plan.fingerprint,
  operation: 'add',
  reviewKind: 'workplace',
  changeId: 'en:workplace',
  requestId: randomUUID(),
});

test('independent Add reviews an empty CV and prepares once without a native record ID', async () => {
  const f = await fixture();
  try {
    const { fields, ...sourceInput } = f.add;
    const source = await f.service['cv-workplace-source'](sourceInput);
    assert.deepEqual(source.jobs, []);
    assert.equal(source.source.jobIndex, null);
    assert.equal(source.source.job, null);
    const { plan: draft } = await f.service['cv-workplace-plan'](f.add);
    assert.equal(draft.recordId, null);
    assert.deepEqual(draft.source, source.source);
    assert.deepEqual(draft.desired, fields);
    assert.deepEqual(draft.changes[0], {
      field: 'resumes',
      before: [],
      after: [{ hash: f.add.hash, checked: true }],
    });
    const unapproved = await f.service['cv-prepare'](request(draft));
    assert.equal(unapproved.preparation.state, 'failed');
    assert.equal(unapproved.preparation.code, 'jobs-cv-conflict');
    assert.equal(f.calls.attached, 0);

    const { plan } = await f.service['cv-workplace-review']({
      fingerprint: draft.fingerprint,
    });
    f.prepare(async ({ change, phase }) => {
      assert.deepEqual(change.workplace, { recordId: null, job: null });
      assert.deepEqual(change.plan, plan);
      await phase('preparing');
    });
    const input = request(plan);
    await assert.rejects(
      f.service['cv-prepare']({
        ...input,
        operation: 'copy',
        recordId: '123',
      }),
      { code: 'jobs-cv-options' }
    );
    const result = await f.service['cv-prepare'](input);
    assert.equal(result.preparation.state, 'prepared');
    assert.equal(result.preparation.operation, 'add');
    assert.equal(result.preparation.providerSaved, false);
    assert.equal(Object.hasOwn(result.preparation, 'recordId'), false);
    assert.deepEqual(await f.service['cv-prepare'](input), result);
    assert.deepEqual(
      await f.service['cv-prepare-status']({ requestId: input.requestId }),
      result
    );
    await assert.rejects(
      f.service['cv-prepare']({
        ...input,
        operation: undefined,
        recordId: '123',
      }),
      { code: 'jobs-cv-conflict' }
    );
    assert.equal(f.calls.attached, 1);
    assert.equal(f.calls.detached, 1);
  } finally {
    await f.close();
  }
});

test('Add refuses source IDs, incomplete fields, forged destinations and changed export bytes', async () => {
  const f = await fixture();
  try {
    for (const override of [
      { recordId: '123' },
      { jobIndex: 0 },
      { resumes: [] },
      { fields: { company: 'Only a company' } },
    ]) {
      await assert.rejects(
        f.service['cv-workplace-plan']({ ...f.add, ...override })
      );
    }
    const { plan } = await f.service['cv-workplace-plan'](f.add);
    const { fingerprint, ...content } = globalThis.structuredClone(plan);
    content.changes[0].after.push({ hash: 'othercv', checked: true });
    await assert.rejects(
      confirmedCvWorkplacePlan({
        plan: await fingerprintCvWorkplacePlan(content),
      })
    );
    const { plan: reviewed } = await f.service['cv-workplace-review']({
      fingerprint,
    });
    await appendFile(
      join(f.artifactRoot, f.add.exportId, f.add.hash, 'resume.json'),
      ' '
    );
    const { preparation } = await f.service['cv-prepare'](request(reviewed));
    assert.equal(preparation.state, 'failed');
    assert.equal(f.calls.attached, 0);
  } finally {
    await f.close();
  }
});

test('CLI and both Lino encodings expose the same independent Add review', async () => {
  const f = await fixture();
  try {
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      artifactRoot: f.artifactRoot,
      cvPrepare: f.cvPrepare,
    });
    const args = {
      operation: 'add',
      'export-id': f.add.exportId,
      resume: f.add.hash,
    };
    let review;
    for (const [extension, encoded] of [
      ['json', JSON.stringify(f.add.fields)],
      ['lino', encodeWire(f.add.fields, LINO_TEXT)],
      ['bin', encodeWire(f.add.fields, LINO_BINARY)],
    ]) {
      const file = join(f.artifactRoot, `new-workplace.${extension}`);
      await writeFile(file, encoded);
      const code = await commands['vacancies-cv-workplace-plan'](
        { ...args, file },
        (output) => {
          review = decodeWire(output);
        }
      );
      assert.equal(code, 0);
      await confirmedCvWorkplacePlan(review, f.add);
    }
    const { plan } = await f.service['cv-workplace-review']({
      fingerprint: review.plan.fingerprint,
    });
    let receipt;
    assert.equal(
      await commands['vacancies-cv-prepare'](
        {
          operation: 'add',
          fingerprint: plan.fingerprint,
          'change-id': 'en:workplace',
          'review-kind': 'workplace',
        },
        (output) => {
          receipt = decodeWire(output);
        }
      ),
      0
    );
    assert.equal(receipt.preparation.operation, 'add');
    assert.equal(receipt.preparation.state, 'prepared');
    await withRoutes(async (base) => {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const answer = await wirePost(base, 'cv-workplace-plan', f.add, type);
        assert.equal(answer.status, 200);
        await confirmedCvWorkplacePlan(answer.value, f.add);
        const approval = await wirePost(
          base,
          'cv-workplace-review',
          { fingerprint: answer.value.plan.fingerprint },
          type
        );
        assert.equal(approval.status, 200);
        const reply = await wirePost(
          base,
          'cv-prepare',
          request(approval.value.plan),
          type
        );
        assert.equal(reply.status, 200);
        assert.equal(reply.value.preparation.operation, 'add');
        assert.equal(reply.value.preparation.providerSaved, false);
      }
    }, f.routeOptions);
  } finally {
    await f.close();
  }
});
