import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import React from 'react';
import { cvWorkplaceFieldsFixture } from '../../experiments/issue-56/cv-workplace-fields-fixture.mjs';
import {
  confirmedCvWorkplacePlan,
  fingerprintCvWorkplacePlan,
  cvWorkplaceValues,
} from '../src/jobs/cv-workplace-plan.js';
import {
  loadCvWorkplaceDictionaries,
  cvAreaIdentity,
  cvLocalizedEntry,
  cvAreaDirectory,
} from '../src/jobs/cv-workplace-dictionaries.js';
import { cvPrepareOptions } from '../src/jobs/cv-prepare-record.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import {
  encodeWire,
  decodeWire,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { CvWorkplaceReview } from '../src/web/cv-workplace-panel.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

const approve = async (f) => {
  const draft = await f.service['cv-workplace-plan'](f.proposal);
  return f.service['cv-workplace-review']({
    browserSlot: 'jobs',
    fingerprint: draft.plan.fingerprint,
  });
};
const preparation = (plan) => ({
  browserSlot: 'jobs',
  fingerprint: plan.fingerprint,
  recordId: plan.recordId,
  reviewKind: 'workplace',
  changeId: 'en:workplace',
  requestId: randomUUID(),
});

test('full workplace plan binds all proposed fields to an immutable saved job and explicit approval', async () => {
  const f = await cvWorkplaceFieldsFixture();
  try {
    const source = await f.service['cv-workplace-source'](f.proposal);
    assert.equal(source.jobs.length, 1);
    assert.equal(source.source.jobIndex, 0);
    const draft = await f.service['cv-workplace-plan'](f.proposal);
    assert.equal(draft.plan.status, 'draft');
    assert.equal(draft.plan.changes.length, 9);
    assert.equal(
      draft.plan.metadata.areas.find((row) => row.id === '2').ru.name,
      'Москва'
    );
    assert.equal(
      draft.plan.metadata.industries.find((row) => row.id === '7.541').en.name,
      'Automation'
    );
    const refused = await f.service['cv-prepare'](preparation(draft.plan));
    assert.equal(refused.preparation.state, 'failed');
    assert.equal(f.calls.attached, 0);
    const reviewed = await f.service['cv-workplace-review']({
      browserSlot: 'jobs',
      fingerprint: draft.plan.fingerprint,
    });
    assert.equal(reviewed.plan.status, 'reviewed');
    assert.equal(reviewed.plan.previousFingerprint, draft.plan.fingerprint);
    assert.notEqual(reviewed.plan.fingerprint, draft.plan.fingerprint);
    assert.deepEqual(
      await f.service['cv-workplace-review']({
        browserSlot: 'jobs',
        fingerprint: draft.plan.fingerprint,
      }),
      reviewed
    );
    assert.deepEqual(
      await f.service['cv-workplace-plan-stored']({
        fingerprint: draft.plan.fingerprint,
      }),
      draft
    );
    const input = preparation(reviewed.plan);
    const answer = await f.service['cv-prepare'](input);
    assert.equal(answer.preparation.state, 'prepared');
    assert.equal(answer.preparation.providerSaved, false);
    assert.equal(answer.preparation.reviewKind, 'workplace');
    assert.deepEqual(await f.service['cv-prepare'](input), answer);
    assert.equal(f.calls.prepared, 1);
    assert.equal(f.calls.attached, f.calls.detached);
    assert.equal(JSON.stringify(answer).includes('Revised Labs'), false);
    const fields = { industryIds: ['7.541', '7.540'] };
    const unordered = await f.service['cv-workplace-plan']({
      ...f.proposal,
      fields,
    });
    assert.deepEqual(
      (await confirmedCvWorkplacePlan(unordered, { fields })).plan.desired
        .industryIds,
      ['7.540', '7.541']
    );
    await assert.rejects(
      confirmedCvWorkplacePlan(unordered, {
        fields: { industryIds: ['7.540', '7.540'] },
      })
    );
  } finally {
    await f.close();
  }
});

test('review and preparation recheck the exact artifact bytes before browser admission', async () => {
  const f = await cvWorkplaceFieldsFixture();
  try {
    const reviewed = await approve(f);
    const draft = await f.service['cv-workplace-plan']({
      ...f.proposal,
      fields: { position: 'Other position' },
    });
    await writeFile(
      join(f.artifactRoot, f.proposal.exportId, f.proposal.hash, 'resume.json'),
      '{}'
    );
    await assert.rejects(
      f.service['cv-workplace-review']({ fingerprint: draft.plan.fingerprint })
    );
    const failed = await f.service['cv-prepare'](preparation(reviewed.plan));
    assert.equal(failed.preparation.state, 'failed');
    assert.equal(f.calls.attached, 0);
    assert.equal(
      (
        await f.service['cv-workplace-plan-stored']({
          fingerprint: reviewed.plan.fingerprint,
        })
      ).plan.status,
      'reviewed'
    );
  } finally {
    await f.close();
  }
});

test('invalid dates, identities, unknown fields and unreviewed changes never reach a browser', async () => {
  const f = await cvWorkplaceFieldsFixture();
  try {
    const { plan } = await approve(f);
    for (const fields of [
      { start: '2020' },
      { end: '2018-01' },
      { current: true },
      { areaId: 'unknown' },
      { industryIds: ['7.541', '7.541'] },
      { save: true },
      { description: 'Contact me at private@example.test' },
    ]) {
      await assert.rejects(
        f.service['cv-workplace-plan']({ ...f.proposal, fields })
      );
    }
    for (const patch of [
      { recordId: 123 },
      { jobIndex: '0' },
      { jobIndex: 200 },
      { browserSlot: 'other' },
    ]) {
      await assert.rejects(
        f.service['cv-workplace-plan']({ ...f.proposal, ...patch })
      );
    }
    const { fingerprint: _old, ...content } = plan;
    for (const changed of [
      { desired: { ...plan.desired, position: 'Forged role' } },
      { changes: [] },
      { browserSlot: 'other' },
    ]) {
      await assert.rejects(
        confirmedCvWorkplacePlan({
          plan: await fingerprintCvWorkplacePlan({ ...content, ...changed }),
        })
      );
    }
    await assert.rejects(
      confirmedCvWorkplacePlan({ plan }, { ...f.proposal, recordId: '456' })
    );
    await assert.rejects(
      confirmedCvWorkplacePlan({ plan }, { exportId: randomUUID() })
    );
    assert.throws(() =>
      cvPrepareOptions({ ...preparation(plan), reviewKind: undefined })
    );
    assert.throws(() =>
      cvPrepareOptions({ ...preparation(plan), changeId: 'en:about' })
    );
    assert.equal(f.calls.attached, 0);
  } finally {
    await f.close();
  }
});

test('bounded localized dictionaries retain stable IDs and refuse duplicate names or trees', async () => {
  const f = await cvWorkplaceFieldsFixture();
  try {
    const dictionaries = await loadCvWorkplaceDictionaries({
      store: f.store,
      fetchImpl: () => {
        throw new Error('cache must avoid network');
      },
    });
    assert.equal(cvAreaIdentity('Москва', dictionaries), '2');
    assert.equal(cvAreaIdentity('Moscow', dictionaries), '2');
    const ambiguous = globalThis.structuredClone(dictionaries);
    ambiguous.areas.en.push({ id: '3', name: 'Moscow', parent: '' });
    assert.throws(() => cvAreaIdentity('Moscow', ambiguous));
    assert.throws(() => cvLocalizedEntry(ambiguous.areas, '2'));
    assert.throws(() =>
      cvAreaDirectory([
        { id: '1', name: 'a', areas: [{ id: '1', name: 'b', areas: [] }] },
      ])
    );
    let reply = dictionaries;
    const api = createVacancyApi({ report: async () => reply });
    assert.deepEqual(await api.vacancyCvWorkplaceDictionaries(), dictionaries);
    for (const entries of [
      [],
      [dictionaries.areas.en[0], dictionaries.areas.en[0]],
      [{ id: '1', name: '', parent: '' }],
      [{ id: '1', name: 'Remote', parent: null }],
    ]) {
      reply = {
        ...dictionaries,
        areas: { ...dictionaries.areas, en: entries },
      };
      await assert.rejects(api.vacancyCvWorkplaceDictionaries());
    }
    assert.throws(() =>
      cvWorkplaceValues({
        ...f.proposal.fields,
        industryIds: Array.from({ length: 6 }, (_, i) => `7.${i}`),
      })
    );
  } finally {
    await f.close();
  }
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`review, approval and preparation share identity through trusted ${type}`, async () => {
    const f = await cvWorkplaceFieldsFixture();
    try {
      await withRoutes(async (base) => {
        assert.equal(
          (
            await wirePost(base, 'cv-workplace-plan', f.proposal, type, {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        const draft = await wirePost(
          base,
          'cv-workplace-plan',
          f.proposal,
          type
        );
        assert.equal(draft.status, 200);
        const review = await wirePost(
          base,
          'cv-workplace-review',
          { fingerprint: draft.value.plan.fingerprint },
          type
        );
        assert.equal(review.status, 200);
        const answer = await wirePost(
          base,
          'cv-prepare',
          preparation(review.value.plan),
          type
        );
        assert.equal(answer.status, 200);
        assert.equal(answer.value.preparation.providerSaved, false);
        const saved = await fetch(
          `${base}/api/vacancies/cv-workplace-plan-stored?browserSlot=jobs`,
          { headers: { accept: type } }
        );
        assert.deepEqual(
          decodeWire(
            await saved.arrayBuffer(),
            saved.headers.get('content-type')
          ),
          review.value
        );
        assert.equal(f.calls.prepared, 1);
      }, f.routeOptions);
    } finally {
      await f.close();
    }
  });
}

test('CLI field files and offline UI review preserve approval and reject mismatched replies', async () => {
  const f = await cvWorkplaceFieldsFixture();
  try {
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      artifactRoot: f.artifactRoot,
      cvPrepare: f.cvPrepare,
    });
    const args = {
      'export-id': f.proposal.exportId,
      resume: f.proposal.hash,
      'job-index': '0',
      'record-id': '123',
    };
    let result;
    const log = (wire) => {
      result = decodeWire(wire);
    };
    for (const [ext, type] of [
      ['json', null],
      ['lino', LINO_TEXT],
      ['bin', LINO_BINARY],
    ]) {
      const file = join(f.artifactRoot, `fields.${ext}`);
      await writeFile(
        file,
        type
          ? encodeWire(f.proposal.fields, type)
          : JSON.stringify(f.proposal.fields)
      );
      assert.equal(
        await commands['vacancies-cv-workplace-plan']({ ...args, file }, log),
        0
      );
      assert.equal(result.plan.status, 'draft');
    }
    assert.equal(
      await commands['vacancies-cv-workplace-review'](
        { fingerprint: result.plan.fingerprint },
        log
      ),
      0
    );
    const reviewed = result;
    const api = createVacancyApi({
      get: async () => null,
      local: async () => f.store,
      report: async () => reviewed,
    });
    assert.deepEqual(
      await api.vacancyCvWorkplacePlanStored({ browserSlot: 'jobs' }),
      reviewed
    );
    await assert.rejects(
      api.vacancyCvWorkplacePlan({ ...f.proposal, hash: 'c'.repeat(32) })
    );
    assert.equal(
      await commands['vacancies-cv-prepare'](
        {
          fingerprint: reviewed.plan.fingerprint,
          'review-kind': 'workplace',
          'change-id': 'en:workplace',
          'record-id': '123',
        },
        log
      ),
      0
    );
    assert.equal(result.preparation.providerSaved, false);
  } finally {
    await f.close();
  }
});

test('four locales render approved field differences with native-draft and owner-Save guidance', async () => {
  const f = await cvWorkplaceFieldsFixture();
  try {
    const { plan } = await approve(f);
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const html = renderInLocale(
        locale,
        React.createElement(CvWorkplaceReview, {
          state: {
            cvWorkplace: { plan, recordId: '', choice: '' },
            cvTechnology: { preparation: { ready: true } },
            resumeExports: { exports: f.receipts },
            values: { browserSlot: 'jobs' },
            capabilities: { cvSaveWatch: true },
          },
          t: (key) => translate(locale, key),
        })
      );
      assert.ok(!html.includes('cvWorkplace.'));
      assert.match(html, /data-cv-workplace-plan="reviewed"/u);
      assert.ok(html.includes('Revised Labs'));
      assert.ok(html.includes('ArtBridge'));
      assert.ok(html.includes('Moscow'));
      assert.ok(html.includes(translate(locale, 'cvWorkplace.prepare')));
    }
  } finally {
    await f.close();
  }
});

test('shared workplace recovery renders cancellation without an admitted CV language', () => {
  const cancellation = {
    state: 'cancelled',
    requestId: randomUUID(),
    updatedAt: new Date().toISOString(),
    language: null,
    hash: null,
    providerSaved: false,
  };
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    const html = renderInLocale(
      locale,
      React.createElement(CvWorkplaceReview, {
        state: {
          cvWorkplace: { plan: null, recordId: '', choice: '' },
          cvTechnology: { preparation: { ready: true, cancellation } },
          resumeExports: { exports: [] },
          values: { browserSlot: 'jobs' },
        },
        t: (key) => translate(locale, key),
      })
    );
    assert.match(html, /data-cv-preparation-state="cancelled"/u);
    assert.ok(html.includes(cancellation.requestId));
    assert.ok(html.includes(translate(locale, 'cvPrepare.cancelled')));
  }
});
