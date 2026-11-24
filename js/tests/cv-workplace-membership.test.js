import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplaceFieldsFixture } from '../../experiments/issue-56/cv-workplace-fields-fixture.mjs';
import { cvWorkplaceMembership } from '../src/jobs/cv-workplace-membership.js';
import {
  confirmedCvWorkplacePlan,
  fingerprintCvWorkplacePlan,
} from '../src/jobs/cv-workplace-plan.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import {
  encodeWire,
  decodeWire,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { CvWorkplaceReview } from '../src/web/cv-workplace-panel.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

const fixture = async () => {
  const f = await cvWorkplaceFieldsFixture();
  const hash = f.proposal.hash;
  const other = f.sources.find((row) => row.identity.hash !== hash).identity
    .hash;
  const resumes = [
    { hash, checked: true },
    { hash: other, checked: true },
    { hash: 'thirdcv', checked: false },
  ];
  return {
    ...f,
    resumes,
    detach: { ...f.proposal, operation: 'detach', fields: {}, resumes },
  };
};
const reviewed = async (f) => {
  const draft = await f.service['cv-workplace-plan'](f.detach);
  const approved = await f.service['cv-workplace-review']({
    browserSlot: 'jobs',
    fingerprint: draft.plan.fingerprint,
  });
  return { draft, approved };
};

test('membership-only review binds every selection and preserves every field', async () => {
  const f = await fixture();
  try {
    const { draft, approved } = await reviewed(f);
    assert.equal(draft.plan.status, 'draft');
    assert.equal(approved.plan.status, 'reviewed');
    assert.deepEqual(approved.plan.baseline, approved.plan.desired);
    assert.deepEqual(approved.plan.changes, [
      { field: 'resumes', ...cvWorkplaceMembership(f.resumes, f.detach.hash) },
    ]);
    assert.deepEqual(
      approved.plan.membership.after.filter(
        (row) => row.hash !== f.detach.hash
      ),
      approved.plan.membership.before.filter(
        (row) => row.hash !== f.detach.hash
      )
    );
    assert.equal(f.calls.attached, 0);
    assert.deepEqual(
      await f.service['cv-workplace-plan-stored']({
        fingerprint: draft.plan.fingerprint,
      }),
      draft
    );
  } finally {
    await f.close();
  }
});

test('deselection refuses orphaning, duplicate, unselected, missing and coerced memberships', () => {
  const invalid = [
    [],
    [{ hash: 'targetcv', checked: true }],
    [
      { hash: 'targetcv', checked: false },
      { hash: 'othercv', checked: true },
    ],
    [
      { hash: 'targetcv', checked: true },
      { hash: 'othercv', checked: false },
    ],
    [
      { hash: 'targetcv', checked: true },
      { hash: 'targetcv', checked: true },
    ],
    [
      { hash: 'targetcv', checked: true },
      { hash: 'othercv', checked: 1 },
    ],
    [
      { hash: 'targetcv', checked: true, extra: false },
      { hash: 'othercv', checked: true },
    ],
  ];
  for (const rows of invalid) {
    assert.throws(() => cvWorkplaceMembership(rows, 'targetcv'));
  }
});

test('re-signed selection reviews cannot change another CV, fields or target bindings', async () => {
  const f = await fixture();
  try {
    const { draft } = await reviewed(f);
    for (const mutate of [
      (plan) => {
        plan.membership.after.find(
          (row) => row.hash !== f.detach.hash
        ).checked = false;
      },
      (plan) => {
        plan.desired.company = 'Unexpected edit';
      },
      (plan) => {
        plan.changes[0].after = [];
      },
      (plan) => {
        plan.operation = 'delete';
      },
    ]) {
      const { fingerprint: _, ...content } = globalThis.structuredClone(
        draft.plan
      );
      mutate(content);
      await assert.rejects(
        confirmedCvWorkplacePlan({
          plan: await fingerprintCvWorkplacePlan(content),
        })
      );
    }
    await assert.rejects(
      confirmedCvWorkplacePlan(draft, { operation: 'update' })
    );
    await assert.rejects(
      confirmedCvWorkplacePlan(draft, {
        resumes: [{ hash: f.detach.hash, checked: true }],
      })
    );
    await assert.rejects(
      f.service['cv-workplace-plan']({
        ...f.detach,
        fields: { company: 'Changed' },
      })
    );
  } finally {
    await f.close();
  }
});

test('explicit approval and durable preparation reuse the same shared selection plan without replay', async () => {
  const f = await fixture();
  try {
    const { draft, approved } = await reviewed(f);
    const request = (plan) => ({
      browserSlot: 'jobs',
      fingerprint: plan.fingerprint,
      recordId: '123',
      reviewKind: 'workplace',
      changeId: 'en:workplace',
      requestId: randomUUID(),
    });
    assert.equal(
      (await f.service['cv-prepare'](request(draft.plan))).preparation.state,
      'failed'
    );
    let selected;
    f.prepare(async ({ change, phase }) => {
      selected = change.plan.membership;
      await phase('preparing');
    });
    const input = request(approved.plan);
    const result = await f.service['cv-prepare'](input);
    assert.equal(result.preparation.state, 'prepared');
    assert.equal(result.preparation.providerSaved, false);
    assert.deepEqual(selected, approved.plan.membership);
    assert.deepEqual(await f.service['cv-prepare'](input), result);
    assert.equal(f.calls.attached, 1);
    assert.equal(f.calls.detached, 1);
  } finally {
    await f.close();
  }
});

test('CLI accepts complete selection files in both Lino encodings', async () => {
  const f = await fixture();
  try {
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      artifactRoot: f.artifactRoot,
      cvPrepare: f.cvPrepare,
    });
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const file = join(
        f.artifactRoot,
        type === LINO_TEXT ? 'membership.lino' : 'membership.bin'
      );
      await writeFile(file, encodeWire(f.resumes, type));
      let result;
      const code = await commands['vacancies-cv-workplace-plan'](
        {
          operation: 'detach',
          file,
          'export-id': f.detach.exportId,
          resume: f.detach.hash,
          'job-index': '0',
          'record-id': '123',
        },
        (value) => {
          result = decodeWire(value);
        }
      );
      assert.equal(code, 0);
      assert.equal(result.plan.operation, 'detach');
    }
  } finally {
    await f.close();
  }
});

test('trusted server accepts membership reviews over text and binary Lino', async () => {
  const f = await fixture();
  try {
    await withRoutes(async (base) => {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const answer = await wirePost(
          base,
          'cv-workplace-plan',
          f.detach,
          type
        );
        assert.equal(answer.status, 200);
        assert.equal(answer.value.plan.operation, 'detach');
        await confirmedCvWorkplacePlan(answer.value, f.detach);
      }
    }, f.routeOptions);
  } finally {
    await f.close();
  }
});

test('membership API validates every native identity before displaying selections', async () => {
  const f = await fixture();
  try {
    const { plan } = await f.service['cv-workplace-plan'](f.detach);
    let answer = {
      membership: {
        recordId: '123',
        source: plan.source,
        resumes: plan.membership.before,
        observedAt: new Date().toISOString(),
      },
    };
    const api = createVacancyApi({
      get: async () => null,
      report: async () => answer,
    });
    const input = {
      browserSlot: 'jobs',
      exportId: f.detach.exportId,
      hash: f.detach.hash,
      jobIndex: 0,
      recordId: '123',
    };
    assert.deepEqual(await api.vacancyCvWorkplaceMembership(input), answer);
    answer = { membership: { ...answer.membership, recordId: '456' } };
    await assert.rejects(api.vacancyCvWorkplaceMembership(input));
  } finally {
    await f.close();
  }
});

test('all four locales disclose separate deselection, unchanged other CVs and owner Save', async () => {
  const f = await fixture();
  try {
    const { approved } = await reviewed(f);
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const html = renderInLocale(
        locale,
        React.createElement(CvWorkplaceReview, {
          state: {
            cvWorkplace: {
              plan: approved.plan,
              operation: 'detach',
              membership: { resumes: approved.plan.membership.before },
              recordId: '123',
              choice: '',
            },
            cvTechnology: { preparation: { ready: true } },
            resumeExports: { exports: f.receipts },
            values: { browserSlot: 'jobs' },
            capabilities: { cvSaveWatch: true },
          },
          t: (key) => translate(locale, key),
        })
      );
      assert.ok(html.includes(translate(locale, 'cvWorkplace.detachHint')));
      assert.ok(!html.includes('cvWorkplace.'));
      assert.match(html, /data-cv-workplace-change="resumes"/u);
      assert.ok(html.includes(f.detach.hash));
    }
  } finally {
    await f.close();
  }
});
