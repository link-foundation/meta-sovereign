import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
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
  const f = await cvWorkplaceFieldsFixture();
  const hash = f.proposal.hash;
  const other = f.sources.find((row) => row.identity.hash !== hash).identity
    .hash;
  return {
    ...f,
    copy: {
      ...f.proposal,
      operation: 'copy',
      resumes: [
        { hash, checked: true },
        { hash: other, checked: true },
        { hash: 'thirdcv', checked: false },
      ],
    },
  };
};

test('reviewed shared workplace copy binds the original and prepares only once', async () => {
  const f = await fixture();
  try {
    const { plan: draft } = await f.service['cv-workplace-plan'](f.copy);
    const { plan: reviewed } = await f.service['cv-workplace-review']({
      fingerprint: draft.fingerprint,
    });
    assert.equal(reviewed.operation, 'copy');
    assert.equal(reviewed.recordId, f.copy.recordId);
    assert.deepEqual(reviewed.desired, f.copy.fields);
    assert.equal(
      reviewed.membership.before.filter((row) => row.checked).length,
      2
    );
    assert.deepEqual(
      reviewed.membership.after.filter((row) => row.checked),
      [{ hash: f.copy.hash, checked: true }]
    );
    assert.equal(reviewed.changes[0].field, 'resumes');
    await confirmedCvWorkplacePlan({ plan: draft }, f.copy);
    const request = (plan) => ({
      fingerprint: plan.fingerprint,
      recordId: f.copy.recordId,
      reviewKind: 'workplace',
      changeId: 'en:workplace',
      requestId: randomUUID(),
    });
    assert.equal(
      (await f.service['cv-prepare'](request(draft))).preparation.state,
      'failed'
    );
    assert.equal(f.calls.attached, 0);
    f.prepare(async ({ change, phase }) => {
      assert.equal(change.workplace.recordId, f.copy.recordId);
      assert.deepEqual(change.plan, reviewed);
      await phase('preparing');
    });
    const input = request(reviewed);
    const receipt = await f.service['cv-prepare'](input);
    assert.equal(receipt.preparation.state, 'prepared');
    assert.equal(receipt.preparation.operation, 'copy');
    assert.equal(receipt.preparation.recordId, f.copy.recordId);
    assert.equal(receipt.preparation.providerSaved, false);
    assert.deepEqual(await f.service['cv-prepare'](input), receipt);
    assert.equal(f.calls.attached, 1);
    assert.equal(f.calls.detached, 1);
  } finally {
    await f.close();
  }
});

test('CLI preserves approved copy source membership and edited fields in JSON and Lino files', async () => {
  const f = await fixture();
  try {
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      artifactRoot: f.artifactRoot,
      cvPrepare: f.cvPrepare,
    });
    const content = { fields: f.copy.fields, resumes: f.copy.resumes };
    for (const [extension, encoded] of [
      ['json', JSON.stringify(content)],
      ['lino', encodeWire(content, LINO_TEXT)],
      ['bin', encodeWire(content, LINO_BINARY)],
    ]) {
      const file = join(f.artifactRoot, `copy.${extension}`);
      await writeFile(file, encoded);
      let draft;
      const code = await commands['vacancies-cv-workplace-plan'](
        {
          operation: 'copy',
          file,
          'export-id': f.copy.exportId,
          resume: f.copy.hash,
          'job-index': '0',
          'record-id': f.copy.recordId,
        },
        (output) => {
          draft = decodeWire(output);
        }
      );
      assert.equal(code, 0);
      await confirmedCvWorkplacePlan(draft, f.copy);
    }
  } finally {
    await f.close();
  }
});

test('a copy of unchanged fields still needs source membership and a target-only plan', async () => {
  const f = await fixture();
  try {
    const { plan } = await f.service['cv-workplace-plan']({
      ...f.copy,
      fields: {},
    });
    assert.deepEqual(plan.baseline, plan.desired);
    assert.deepEqual(plan.changes, [{ field: 'resumes', ...plan.membership }]);
    const { fingerprint: _old, ...content } = globalThis.structuredClone(plan);
    content.membership.after.find((row) => row.hash !== f.copy.hash).checked =
      true;
    await assert.rejects(
      confirmedCvWorkplacePlan({
        plan: await fingerprintCvWorkplacePlan(content),
      })
    );
    await assert.rejects(
      f.service['cv-workplace-plan']({
        ...f.copy,
        resumes: f.copy.resumes.slice(0, 1),
      }),
      { code: 'jobs-cv-membership' }
    );
  } finally {
    await f.close();
  }
});

test('trusted server accepts shared copy reviews through both Lino encodings', async () => {
  const f = await fixture();
  try {
    await withRoutes(async (base) => {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const answer = await wirePost(base, 'cv-workplace-plan', f.copy, type);
        assert.equal(answer.status, 200);
        await confirmedCvWorkplacePlan(answer.value, f.copy);
      }
    }, f.routeOptions);
  } finally {
    await f.close();
  }
});
