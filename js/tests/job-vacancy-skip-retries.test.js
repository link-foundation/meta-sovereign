import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createVacancyService } from '../src/jobs/service.js';
import {
  transientVacancySkipReasons,
  vacancySkipBlocks,
  vacancySkipRecovery,
} from '../src/jobs/vacancy-skip-policy.js';
import {
  vacancySkipEntry,
  vacancySkipId,
} from '../src/jobs/vacancy-skip-data.js';
import { observeVacancySkip } from '../src/jobs/vacancy-skip-service.js';
import { reviewVacancySearch } from '../src/jobs/vacancy-selection-service.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { skipSnapshot } from '../../experiments/issue-56/vacancy-skip-fixture.mjs';
import { discoveryFixture } from '../../experiments/issue-56/discovery-fixture.mjs';
import { applicationBatchFixture } from '../../experiments/issue-56/application-batch-fixture.mjs';
import { searchFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';

const transientEntry = (reason = 'button_disabled', more = {}) => ({
  ...skipSnapshot().entries[0],
  reason,
  externalUrl: null,
  runId: 'run-first',
  ...more,
});
const readSkips = (f) => f.service['skips-stored']({});
const identity = (receipt) => ({
  ...applicationInput,
  revision: receipt.revision,
});

for (const reason of transientVacancySkipReasons) {
  test(`${reason} permits exactly one later-run retry and conservative offline reads`, () => {
    const entry = vacancySkipEntry(transientEntry(reason));
    assert.equal(vacancySkipBlocks(entry, { runId: entry.runId }), true);
    assert.equal(vacancySkipBlocks(entry, { runId: 'run-later' }), false);
    assert.equal(vacancySkipBlocks(entry), true);
    assert.equal(vacancySkipRecovery(entry), 'next-run');
    const exhausted = { ...entry, attempts: 2 };
    assert.equal(vacancySkipBlocks(exhausted, { runId: 'run-third' }), true);
    assert.equal(vacancySkipRecovery(exhausted), 'retry-exhausted');
    for (const runId of [undefined, '', '../run', 'x'.repeat(101)]) {
      assert.throws(() => vacancySkipEntry({ ...entry, runId }));
    }
  });
}

test('permanent native refusals remain blocked across runs with their original wire shape', () => {
  for (const reason of [
    'external_site',
    'resume_not_visible',
    'vacancy_unavailable',
  ]) {
    const entry = vacancySkipEntry({ ...skipSnapshot().entries[0], reason });
    assert.equal(Object.hasOwn(entry, 'runId'), false);
    assert.equal(vacancySkipBlocks(entry, { runId: 'run-later' }), true);
    assert.equal(vacancySkipRecovery(entry), 'until-cleared');
  }
});

test(
  'a disabled Apply control is recorded once per run, persists through restart and exhausts its retry',
  { timeout: 5000 },
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    f.state.page.enter.disabled = true;
    let receipt = await f.service['application-open'](applicationInput);
    const first = await readSkips(f);
    assert.equal(first.entries[0]?.reason, 'apply_button_disabled');
    assert.equal(first.entries[0].attempts, 1);
    receipt = await f.service['application-read'](identity(receipt));
    assert.deepEqual(await readSkips(f), first);
    await f.service['application-close'](identity(receipt));
    await assert.rejects(f.service['application-open'](applicationInput), {
      code: 'jobs-application-skipped',
    });
    await f.service.stop();
    const restarted = createVacancyService(f.serviceOptions);
    t.after(() => restarted.stop());
    receipt = await restarted['application-open']({
      ...applicationInput,
      recover: true,
    });
    const second = await restarted['skips-stored']({});
    assert.equal(second.entries[0].attempts, 2);
    assert.notEqual(second.entries[0].runId, first.entries[0].runId);
    await restarted['application-close'](identity(receipt));
    await restarted.stop();
    const third = createVacancyService(f.serviceOptions);
    t.after(() => third.stop());
    await assert.rejects(
      third['application-open']({ ...applicationInput, recover: true }),
      { code: 'jobs-application-skipped' }
    );
    assert.equal(f.state.opened, 2);
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'disabled Send is observed without changing private answers; confirmed delivery clears it',
  { timeout: 5000 },
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    let receipt = await f.enter();
    f.state.fields[1].value = 'Owner experience';
    f.state.page.submit.disabled = true;
    receipt = await f.service['application-read'](identity(receipt));
    assert.equal((await readSkips(f)).entries[0]?.reason, 'button_disabled');
    assert.equal(f.state.fields[1].value, 'Owner experience');
    f.state.page.submit.disabled = false;
    receipt = await f.service['application-read'](identity(receipt));
    receipt = await f.service['application-advance']({
      ...identity(receipt),
      action: 'submit',
      confirm: true,
    });
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.deepEqual((await readSkips(f)).entries, []);
    assert.equal(f.state.submitted, 1);
  }
);

for (const action of ['enter', 'submit']) {
  test(
    `a definitive ${action} refusal records its transient reason after releasing only that dispatch`,
    { timeout: 5000 },
    async (t) => {
      const f = applicationFixture({
        application: {
          dispatch: async (_handle, _record, nextAction) => {
            if (nextAction === action) {
              return { dispatched: false };
            }
            f.state.page.enter = null;
            f.state.page.scope = true;
            f.state.page.questions = true;
            f.state.page.fieldIndices = [1];
            f.state.page.submit = {
              qa: 'vacancy-response-submit-popup',
              tag: 'BUTTON',
              text: 'Send',
              href: null,
              disabled: false,
            };
            return { dispatched: true };
          },
        },
      });
      t.after(() => f.close());
      let receipt = await f.service['application-open'](applicationInput);
      if (action === 'submit') {
        receipt = await f.service['application-advance']({
          ...identity(receipt),
          action: 'enter',
          confirm: true,
        });
      }
      receipt = await f.service['application-advance']({
        ...identity(receipt),
        action,
        confirm: true,
      });
      const first = await readSkips(f);
      assert.equal(
        first.entries[0]?.reason,
        action === 'enter' ? 'apply_click_failed' : 'click_failed'
      );
      assert.equal(first.entries[0].attempts, 1);
      assert.equal(receipt.attempted[action], false);
      assert.equal(receipt.delivery, 'none');
      await f.service['application-read'](identity(receipt));
      assert.deepEqual(await readSkips(f), first);
      assert.equal(f.state.submitted, 0);
    }
  );
}

for (const dispatch of [
  () => {
    throw new Error('lost acknowledgement');
  },
  () => ({}),
]) {
  test(
    'an uncertain dispatch stays reserved, even when its native control later becomes disabled',
    { timeout: 5000 },
    async (t) => {
      const f = applicationFixture({ application: { dispatch } });
      t.after(() => f.close());
      let receipt = await f.service['application-open'](applicationInput);
      await assert.rejects(
        f.service['application-advance']({
          ...identity(receipt),
          action: 'enter',
          confirm: true,
        })
      );
      receipt = await f.service['application-status'](applicationInput);
      assert.equal(receipt.delivery, 'unknown');
      assert.equal(receipt.attempted.enter, true);
      f.state.page.enter.disabled = true;
      await f.service['application-read'](identity(receipt));
      assert.deepEqual((await readSkips(f)).entries, []);
      assert.equal(f.state.submitted, 0);
    }
  );
}

test('same-run reason changes preserve the count; reads and ineligible evidence cannot spend retries', async () => {
  const store = createMemoryStore();
  const events = [];
  const context = { runId: 'run-first', trace: (event) => events.push(event) };
  const record = {
    ...applicationInput,
    browserSlot: 'jobs',
    delivery: 'none',
    attempted: {},
    page: { bound: true, enter: { disabled: true } },
  };
  try {
    for (const change of [
      { options: { testMode: true } },
      { page: { ...record.page, bound: false } },
      { page: { ...record.page, challenge: true } },
      { page: { ...record.page, dailyLimit: true } },
      { page: { ...record.page, error: 'unknown' } },
      { hold: 'unknown' },
      { paused: true },
      { attempted: { submit: true } },
    ]) {
      await observeVacancySkip(
        store,
        { ...record, ...change },
        () => 0,
        context
      );
      assert.equal(await store.get(vacancySkipId('jobs')), null);
    }
    await observeVacancySkip(store, record, () => 0, context);
    await observeVacancySkip(store, record, () => 1000, {
      ...context,
      clickRefusal: 'apply_click_failed',
    });
    const saved = await store.get(vacancySkipId('jobs'));
    assert.equal(saved.entries[0].attempts, 1);
    assert.equal(saved.entries[0].reason, 'apply_click_failed');
    assert.deepEqual(
      events.map((row) => Object.keys(row).sort()),
      Array(2).fill(['attempts', 'event', 'reason'])
    );
    await assert.rejects(
      observeVacancySkip(store, { ...record, delivery: 'unknown' }, () => 0, {
        ...context,
        clickRefusal: 'apply_click_failed',
      })
    );
    assert.deepEqual(await store.get(vacancySkipId('jobs')), saved);
  } finally {
    await store.close?.();
  }
});

test(
  'search and discovery apply the same later-run allowance before collecting descriptions',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    const entry = transientEntry();
    const snapshot = skipSnapshot({ entries: [entry] });
    await f.store.put({ id: vacancySkipId('jobs'), ...snapshot });
    const result = searchFixture('https://hh.ru/search/vacancy?text=Python');
    for (const [runId, expected] of [
      ['run-first', 'native-skip'],
      ['run-later', 'review'],
    ]) {
      const reviewed = await reviewVacancySearch(
        f.store,
        result,
        {},
        () => false,
        () => ({ runId })
      );
      assert.equal(
        reviewed.selection.decisions.find((row) => row.url === entry.url)
          .reason,
        expected
      );
    }
    await f.start();
    const receipt = await f.drain();
    assert.equal(
      receipt.discovery.entries.find((row) => row.card.url === entry.url)
        .decision.reason,
      'review'
    );
    assert(f.descriptions.some((row) => row.url === entry.url));
  }
);

test(
  'each explicitly started real batch counts as a later run and exhausts the second disabled Apply',
  { timeout: 5000 },
  async (t) => {
    const f = applicationBatchFixture(t, {
      application: {
        readPage: async () => ({
          ...globalThis.structuredClone(f.state.page),
          enter: { ...f.state.page.enter, disabled: true },
        }),
      },
    });
    const runs = [];
    for (let index = 0; index < 3; index++) {
      const requestId = `skip-run-${index}`;
      await f.start({ requestId, urls: [applicationInput.url] });
      for (let poll = 0; poll < 100; poll++) {
        const status = await f.service['application-batch-status']({
          requestId,
        });
        if (!status.batch.active) {
          break;
        }
        await delay(5);
      }
      await f.service['application-batch-drain']({});
      const snapshot = await readSkips(f);
      assert.equal(snapshot.entries[0]?.attempts, Math.min(index + 1, 2));
      runs.push(snapshot.entries[0].runId);
      if (index < 2) {
        const receipt = await f.service['application-status']({
          ...applicationInput,
          requestId,
        });
        assert.equal(receipt.attempted.enter, false);
        await f.service['application-close']({
          ...identity(receipt),
          requestId,
        });
      }
    }
    assert.notEqual(runs[0], runs[1]);
    assert.equal(runs[1], runs[2]);
    assert.equal(f.state.opened, 2);
    assert.equal(f.state.submitted, 0);
  }
);
