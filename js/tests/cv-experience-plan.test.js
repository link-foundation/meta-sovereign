import test from 'node:test';
import assert from 'node:assert/strict';
import * as cv from '../src/cv/index.js';
import { privateSyncId } from '../src/sync/reconcile-records.js';
import { modelFingerprint } from '../src/automation/answer-model-context.js';
import { saveExperienceDocument } from '../src/cv/experience-store.js';
import {
  createExperiencePlanningService,
  readExperiencePlan,
} from '../src/cv/experience-plan-service.js';
import {
  createExperiencePlan,
  experienceTranslationTexts,
} from '../src/cv/experience-plan.js';
import { experienceTranslationBatches } from '../src/cv/experience-plan-translation.js';
import {
  experiencePlanFixture,
  settledExperiencePlan,
  experiencePlanModels,
} from '../../experiments/issue-56/experience-plan-fixture.mjs';

test('the public facade plans both directions from exact snapshots and preserves target-only jobs and all metadata', async () => {
  assert.equal(typeof cv.createExperiencePlan, 'function');
  const fixture = await experiencePlanFixture();
  for (const to of ['hh', 'linkedin']) {
    const input = fixture.input(`direction-${to}`, to);
    const plan = cv.createExperiencePlan(fixture.hh, fixture.linkedin, input);
    assert.equal(plan.source.platform, to === 'hh' ? 'linkedin' : 'hh');
    assert.equal(plan.target.platform, to);
    assert.equal(plan.providerSaved, false);
    assert.equal(plan.requiresReview, true);
    assert.equal(plan.jobs.filter((item) => item.kind === 'add').length, 1);
    assert.equal(plan.jobs.filter((item) => item.kind === 'keep').length, 1);
    const paired = plan.jobs.find((item) => item.kind === 'update');
    assert.deepEqual(paired.target.native, fixture[to].jobs[0].native);
    assert.ok(
      paired.notes.some(
        (note) =>
          note.field === 'skills' && note.reason === 'missing-source-kept'
      ) ||
        !paired.fields.find((field) => field.field === 'skills')?.after ||
        paired.fields
          .find((field) => field.field === 'skills')
          .after.includes('Target-only skill')
    );
    assert.ok(
      plan.profile.notes.some((note) => note.reason === 'personal-name-review')
    );
    assert.ok(plan.profile.fields.every((field) => field.field === 'about'));
    assert.deepEqual(plan.jobs.find((item) => item.kind === 'keep').fields, []);
  }
  assert.equal(
    fixture.hh.jobs[0].native.website,
    'https://example.test/archived/path/'
  );
});

test('unknown periods, overlapping roles, missing source metadata and oversized descriptions never become guessed or truncated writes', async () => {
  const { hh, linkedin, input } = await experiencePlanFixture();
  const original = globalThis.structuredClone(hh);
  delete hh.jobs[0].location;
  hh.jobs[0].description = 'Ж'.repeat(12001);
  hh.jobs[0].native.unknownFuture.extra = true;
  let plan = createExperiencePlan(hh, linkedin, input());
  const paired = plan.jobs.find((job) => job.targetIndex === 0);
  assert.equal(
    paired.fields.find((field) => field.field === 'description').reason,
    'translation-limit'
  );
  assert.equal(paired.source.description.length, 12001);
  assert.ok(!experienceTranslationTexts(plan).includes(hh.jobs[0].description));
  assert.ok(
    paired.notes.some(
      (note) =>
        note.field === 'location' && note.reason === 'missing-source-kept'
    )
  );
  assert.ok(
    paired.notes.some(
      (note) => note.field === 'native' && note.reason === 'unsupported-field'
    )
  );
  delete hh.jobs[0].start;
  plan = createExperiencePlan(hh, linkedin, input());
  assert.ok(
    plan.jobs
      .filter((job) =>
        job.notes.some((note) => note.reason === 'unknown-period')
      )
      .every((job) => job.fields.length === 0)
  );
  original.jobs.push(globalThis.structuredClone(original.jobs[0]));
  plan = createExperiencePlan(original, linkedin, input());
  assert.ok(
    plan.jobs.some((job) =>
      job.notes.some((note) => note.reason === 'ambiguous')
    )
  );
});

test(
  'private durable planning retains three provider variants, falls back to Luna, binds fields and reuses only valid model-version caches',
  { timeout: 10000 },
  async () => {
    const fixture = await experiencePlanFixture();
    const service = createExperiencePlanningService(fixture);
    try {
      const input = fixture.input();
      assert.equal((await service.start(input)).requestId, input.requestId);
      const row = await settledExperiencePlan(service, input.requestId);
      assert.equal(row.phase, 'completed');
      await cv.confirmedExperiencePlan(row, input.requestId);
      const field = row.plan.jobs[0].fields.find(
        (item) => item.field === 'description'
      );
      assert.equal(field.after, 'Leading a team.\nTools: CI/CD, C/C++, .NET');
      assert.equal(field.ready, true);
      const comparison = row.plan.translations.find(
        (entry) => entry.input.requestId === field.translation.requestId
      );
      const translated = comparison.rows[field.translation.row];
      assert.equal(translated.source, field.source);
      assert.equal(translated.chosenBy, 'luna');
      assert.deepEqual(
        translated.variants.map((variant) => variant.provider),
        ['haiku', 'luna', 'formal-ai']
      );
      assert.equal(translated.variants[0].reason, 'translation-gap');
      assert.equal(translated.variants[2].reason, 'misrouted');
      assert.equal(
        row.plan.jobs.find((item) => item.kind === 'keep').target.company,
        'Target-only Company'
      );
      assert.ok(
        (await fixture.store.query()).every((entry) => privateSyncId(entry.id))
      );
      const count = fixture.calls.length;
      assert.deepEqual(await service.start(input), row);
      assert.deepEqual(await service.status(input), row);
      assert.equal(fixture.calls.length, count);
      await assert.rejects(service.start({ ...input, to: 'hh' }), {
        code: 'cv-experience-plan-conflict',
      });
      const second = fixture.input('second-plan');
      await service.start(second);
      const cached = await settledExperiencePlan(service, second.requestId);
      assert.equal(cached.phase, 'completed');
      const repeated = fixture.calls
        .slice(count)
        .filter((entry) => entry.kind === 'translate');
      assert.ok(
        repeated.every(
          (entry) =>
            entry.provider === 'formal-ai' ||
            (entry.provider === 'haiku' &&
              entry.input.texts.every((text) => text.includes('\n')))
        )
      );
      assert.ok(
        cached.plan.translations[0].rows.some(
          (entry) => entry.variants[1].cached
        )
      );
      const priorResolve = fixture.adapters.resolve;
      const newModels = {
        haiku: 'claude-haiku-5-6',
        luna: 'gpt-6.1-luna',
        'formal-ai': '0.355.35',
      };
      fixture.adapters.resolve = async (...args) => ({
        ...(await priorResolve(...args)),
        model: newModels[args[0]],
      });
      const beforeVersionChange = fixture.calls.length;
      const newer = fixture.input('new-model-version');
      await service.start(newer);
      const refreshed = await settledExperiencePlan(service, newer.requestId);
      assert.equal(refreshed.phase, 'completed');
      assert.ok(
        fixture.calls
          .slice(beforeVersionChange)
          .some(
            (entry) => entry.kind === 'translate' && entry.provider === 'luna'
          )
      );
      assert.ok(
        refreshed.plan.translations.every((entry) =>
          entry.rows.every((row) =>
            row.variants.every((variant) => !variant.cached)
          )
        )
      );
      await assert.rejects(
        cv.confirmedExperiencePlan(
          { ...row, providerSaved: true },
          input.requestId
        )
      );
      const wrong = globalThis.structuredClone(row);
      wrong.plan.jobs[0].fields[0].after = 'Unbound text';
      await assert.rejects(cv.confirmedExperiencePlan(wrong, input.requestId));
      const { fingerprint: _fingerprint, ...changed } = wrong;
      wrong.fingerprint = await modelFingerprint(changed);
      await assert.rejects(cv.confirmedExperiencePlan(wrong, input.requestId));
    } finally {
      await service.close();
    }
  }
);

test(
  'finite translation batches honor both item and encoded byte bounds and resolve models once per planning job',
  { timeout: 10000 },
  async () => {
    const fixture = await experiencePlanFixture();
    const texts = Array.from(
      { length: 53 },
      (_item, index) => `Текст ${index} ${'я'.repeat(11000)}`
    );
    const batches = await experienceTranslationBatches(
      { ...fixture.input(), toLanguage: 'en', models: {} },
      texts
    );
    assert.ok(batches.length > 2);
    assert.deepEqual(
      batches.flatMap((entry) => entry.texts),
      texts
    );
    assert.ok(
      batches.every(
        (entry) =>
          entry.texts.length <= 50 &&
          new TextEncoder().encode(JSON.stringify(entry.texts)).length <= 64000
      )
    );
    const hh = globalThis.structuredClone(fixture.hh);
    hh.jobs = Array.from({ length: 14 }, (_unused, index) => ({
      company: `Работодатель ${index}`,
      title: `Должность ${index}`,
      start: '2020-01',
      end: '2021-02',
      description: `Описание ${index} ${'я'.repeat(4500)}`,
    }));
    const saved = await saveExperienceDocument(fixture.store, hh);
    const service = createExperiencePlanningService(fixture);
    try {
      const input = { ...fixture.input('many-fields'), hh: saved.revision };
      await service.start(input);
      const row = await settledExperiencePlan(service, input.requestId);
      assert.equal(row.phase, 'completed');
      assert.ok(row.plan.translations.length > 1);
      assert.deepEqual(
        fixture.calls
          .filter((entry) => entry.kind === 'resolve')
          .map((entry) => entry.provider),
        Object.keys(experiencePlanModels)
      );
    } finally {
      await service.close();
    }
  }
);

test(
  'Stop aborts and drains the owned translator; independent status never launches it and stopped IDs never replay',
  { timeout: 10000 },
  async () => {
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let drained = false;
    const fixture = await experiencePlanFixture({
      translate: (_provider, _descriptor, _input, signal) =>
        new Promise((_resolve, reject) => {
          entered();
          signal.addEventListener(
            'abort',
            () => {
              drained = true;
              reject(signal.reason);
            },
            { once: true }
          );
        }),
    });
    const service = createExperiencePlanningService(fixture);
    try {
      const input = fixture.input('abort-owned');
      await service.start(input);
      await started;
      const before = fixture.calls.length;
      assert.equal(
        (await readExperiencePlan(fixture.store, input)).phase,
        'unknown'
      );
      assert.equal(fixture.calls.length, before);
      assert.equal((await service.stop(input)).phase, 'stopped');
      assert.equal(drained, true);
      assert.equal((await service.start(input)).phase, 'stopped');
      assert.equal(fixture.calls.length, before);
      const cancel = fixture.input('cancel-before-start');
      await service.stop(cancel);
      assert.equal((await service.start(cancel)).phase, 'stopped');
      assert.equal(fixture.calls.length, before);
    } finally {
      await service.close();
    }
  }
);

test('admission flush failure starts nothing; reversed snapshots are refused before any receipt or provider process', async () => {
  const fixture = await experiencePlanFixture();
  const before = await fixture.store.query();
  fixture.store.flush = async () => {
    throw new Error('Synthetic disk failure');
  };
  const service = createExperiencePlanningService(fixture);
  try {
    const input = fixture.input('flush-refused');
    await assert.rejects(service.start(input));
    assert.deepEqual(await fixture.store.query(), before);
    assert.equal(fixture.calls.length, 0);
    await assert.rejects(
      service.start({ ...input, hh: input.linkedin, linkedin: input.hh })
    );
    assert.deepEqual(await fixture.store.query(), before);
  } finally {
    await service.close();
  }
});

test(
  'shutdown drains owned work and preserves earlier variants; a restarted owner never replays an interrupted record',
  { timeout: 10000 },
  async () => {
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let drained = false;
    const fixture = await experiencePlanFixture({
      translate: (provider, descriptor, input, signal) => {
        if (provider === 'haiku') {
          return {
            model: descriptor.model,
            outputs: input.texts.map(() => 'Reviewed English text.'),
          };
        }
        return new Promise((_resolve, reject) => {
          signal.throwIfAborted();
          entered();
          signal.addEventListener(
            'abort',
            () => {
              drained = true;
              reject(signal.reason);
            },
            { once: true }
          );
        });
      },
    });
    const service = createExperiencePlanningService(fixture);
    const input = fixture.input('shutdown');
    try {
      await service.start(input);
      await started;
      await service.close();
      assert.equal(drained, true);
      const stopped = await service.status(input);
      assert.equal(stopped.phase, 'stopped');
      assert.equal(stopped.plan.translations.length, 1);
      assert.equal(stopped.plan.translations[0].state, 'stopped');
      assert.ok(
        stopped.plan.translations[0].rows.every((row) => row.variants[0].text)
      );
      assert.ok(
        stopped.plan.jobs[0].fields
          .filter((field) => field.from)
          .every((field) => !field.ready)
      );
      const rows = await fixture.store.query();
      const restart = await experiencePlanFixture();
      for (const row of rows) {
        await restart.store.put(row);
      }
      const saved = await restart.store.get(
        `secret:cv-experience-plan:${input.requestId}`
      );
      await restart.store.put({ ...saved, phase: 'translating' });
      const other = createExperiencePlanningService(restart);
      try {
        assert.equal((await other.status(input)).phase, 'interrupted');
        assert.equal((await other.start(input)).phase, 'interrupted');
        assert.equal(restart.calls.length, 0);
      } finally {
        await other.close();
      }
    } finally {
      await service.close();
    }
  }
);
