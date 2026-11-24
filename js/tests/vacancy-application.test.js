import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { vacancyContent } from '../src/assignments/vacancy-content.js';
import { observeVacancyApplication } from '../src/assignments/vacancy-application.js';
import { createVacancyService } from '../src/jobs/service.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { refusedSnapshot } from './helpers/refused-snapshot.mjs';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import {
  legacyNotation,
  legacyVacancy,
  withLegacyVacancies,
} from '../../experiments/issue-56/vacancy-legacy-fixture.mjs';

const appliedAt = '2026-11-18T09:00:00.000Z';
const now = () => Date.parse(appliedAt);
const record = () => ({
  url: applicationInput.url,
  options: { testMode: false },
  state: 'delivered',
  delivery: 'provider-confirmed',
  page: { bound: true, delivered: true },
});
const saved = async (store) => {
  const service = createVacancyService({
    store,
    readVacancy: async () => vacancySnapshotFixture(),
  });
  try {
    return await service.collect({ url: applicationInput.url });
  } finally {
    await service.stop();
  }
};
const deliver = async (fixture) => {
  const receipt = await fixture.enter();
  return fixture.service['application-advance']({
    ...applicationInput,
    revision: receipt.revision,
    action: 'submit',
    confirm: true,
  });
};

test('marking a collected vacancy keeps exact private markup and observations; repeated receipts retain the first time', async () => {
  const store = createMemoryStore();
  const initial = await saved(store);
  const before = {
    ...initial,
    descriptionHtml: ' <p>Private &amp; exact.</p> ',
  };
  await store.put(before);
  await observeVacancyApplication(store, record(), now);
  const after = await store.get(before.id);
  assert.deepEqual(after, { ...before, status: 'applied', appliedAt });
  await observeVacancyApplication(store, record(), () => now() + 1000);
  assert.deepEqual(await store.get(before.id), after);
});

test(
  'migration preserves acknowledged application evidence and its original Lino before refresh',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      const original = legacyNotation(
        legacyVacancy({ status: 'applied', appliedAt })
      );
      await write('123.lino', original);
      const { service } = await open({
        readVacancy: async () => vacancySnapshotFixture(),
      });
      const migrated = (await service.stored()).entries[0];
      assert.equal(migrated.status, 'applied');
      assert.equal(migrated.appliedAt, appliedAt);
      assert.equal(
        (await service.collect({ url: migrated.url, refresh: true })).appliedAt,
        appliedAt
      );
    });
  }
);

test(
  'confirmed native delivery updates only its cached vacancy and survives restart, CLI and offline reads',
  { timeout: 5000 },
  async () => {
    const driver = createInMemoryDriver();
    const store = await createBrowserStore({ driver });
    const fixture = applicationFixture({ store, application: { now } });
    let recovered;
    try {
      const result = await deliver(fixture);
      assert.equal(result.delivery, 'provider-confirmed');
      assert.equal(fixture.state.submitted, 1);
      const entry = (await fixture.service.stored()).entries[0];
      assert.equal(entry.status, 'applied');
      assert.equal(entry.appliedAt, appliedAt);
      assert.equal(entry.lastSeenAt, entry.capturedAt);
      await fixture.service['application-read']({
        ...applicationInput,
        revision: result.revision,
      });
      assert.deepEqual((await fixture.service.stored()).entries[0], entry);
      await fixture.close();
      recovered = await createBrowserStore({ driver });
      const api = createVacancyApi({
        get: async () => null,
        local: async () => recovered,
      });
      assert.deepEqual((await api.vacancyStored()).entries[0], entry);
      const lines = [];
      const commands = createVacancyCommands({
        openStore: async () => recovered,
      });
      assert.equal(
        await commands['vacancies-stored']({}, (line) => lines.push(line)),
        0
      );
      assert.deepEqual(decodeWire(lines[0]).entries[0], entry);
    } finally {
      await fixture.close();
      await recovered?.close();
    }
  }
);

test('refresh preserves the first delivery evidence and does not trust provider-supplied application metadata', async () => {
  const store = createMemoryStore();
  const before = await saved(store);
  assert.equal(before.status, 'encountered');
  await observeVacancyApplication(store, record(), now);
  const service = createVacancyService({
    store,
    readVacancy: async () => ({
      ...vacancySnapshotFixture(),
      capturedAt: '2026-11-19T00:00:00Z',
      description: 'New full description.',
      status: 'applied',
      appliedAt: '2026-12-01T00:00:00Z',
    }),
  });
  try {
    const updated = await service.collect({ url: before.url, refresh: true });
    assert.equal(updated.status, 'applied');
    assert.equal(updated.appliedAt, appliedAt);
    assert.equal(updated.description, 'New full description.');
    assert.equal(updated.firstSeenAt, before.firstSeenAt);
    assert.equal(updated.lastSeenAt, updated.capturedAt);
    await observeVacancyApplication(store, record(), () => now() + 86400000);
    assert.deepEqual((await service.stored()).entries[0], {
      id: updated.id,
      ...vacancyContent(updated),
    });
  } finally {
    await service.stop();
  }
  const fresh = createVacancyService({
    store: createMemoryStore(),
    readVacancy: async () => ({
      ...vacancySnapshotFixture(),
      status: 'applied',
      appliedAt,
    }),
  });
  try {
    const read = await fresh.collect({ url: before.url });
    assert.equal(read.status, 'encountered');
    assert.equal(read.appliedAt, undefined);
  } finally {
    await fresh.stop();
  }
});

test('preview, unbound, challenged, limited, external, unknown and stale receipts never mark applied or invent a snapshot', async () => {
  const store = createMemoryStore();
  await observeVacancyApplication(store, record(), now);
  assert.deepEqual(await store.query(), []);
  const before = await saved(store);
  for (const changes of [
    { options: { testMode: true } },
    { state: 'review' },
    { delivery: 'unknown' },
    { page: { bound: false, delivered: true } },
    { page: { bound: true, delivered: false } },
    ...['challenge', 'dailyLimit', 'external'].map((key) => ({
      page: { bound: true, delivered: true, [key]: true },
    })),
  ]) {
    await observeVacancyApplication(store, { ...record(), ...changes }, now);
    assert.deepEqual(await store.get(before.id), before);
  }
  await store.put({ ...before, url: 'https://hh.ru/vacancy/456' });
  await assert.rejects(observeVacancyApplication(store, record(), now), {
    code: 'assignment-vacancy-invalid',
  });
});

test(
  'a rejected applied-cache save restores acknowledged data, keeps provider delivery reserved and can recover without resubmission',
  { timeout: 5000 },
  async () => {
    const refused = await refusedSnapshot();
    const fixture = applicationFixture({
      store: refused.store,
      application: { now },
    });
    let rejection, waiting;
    try {
      const review = await fixture.enter();
      const before = (await fixture.service.stored()).entries[0];
      // Reserve dispatch and acknowledge delivery first; fail only the cache receipt.
      const put = refused.store.put.bind(refused.store);
      refused.store.put = async (row) => {
        if (row.id === before.id && row.status === 'applied') {
          refused.failNext();
        }
        return put(row);
      };
      rejection = assert.rejects(
        fixture.service['application-advance']({
          ...applicationInput,
          revision: review.revision,
          action: 'submit',
          confirm: true,
        }),
        (error) => error === refused.failure
      );
      await refused.entered.promise;
      waiting = fixture.service.stored();
      refused.store.put = put;
      refused.release.resolve();
      await rejection;
      assert.deepEqual((await waiting).entries[0], before);
      assert.equal(fixture.state.submitted, 1);
      const delivery =
        await fixture.service['application-status'](applicationInput);
      assert.equal(delivery.delivery, 'provider-confirmed');
      await fixture.service['application-read']({
        ...applicationInput,
        revision: delivery.revision,
      });
      assert.equal(
        (await fixture.service.stored()).entries[0].appliedAt,
        appliedAt
      );
      assert.equal(fixture.state.submitted, 1);
      const durable = (await refused.driver.load()).links.find(
        (row) => row.id === before.id
      );
      assert.equal(durable.status, 'applied');
    } finally {
      refused.release.resolve();
      await Promise.allSettled([rejection, waiting]);
      await fixture.close();
    }
  }
);

test('application metadata rejects malformed and contradictory states while historical snapshots remain compatible', () => {
  const original = vacancySnapshotFixture();
  assert.equal(vacancyContent(original).status, undefined);
  assert.equal(
    vacancyContent({ ...original, status: 'encountered' }).status,
    'encountered'
  );
  for (const extra of [
    { status: null },
    { status: 'sent' },
    { status: 'applied' },
    { appliedAt },
    { status: 'encountered', appliedAt },
    ...[null, 1, '', 'not-a-date', 'x'.repeat(41)].map((value) => ({
      status: 'applied',
      appliedAt: value,
    })),
  ]) {
    assert.throws(() => vacancyContent({ ...original, ...extra }), {
      code: 'assignment-vacancy-invalid',
    });
  }
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `confirmed application cache evidence survives native operations and refresh over ${type}`,
    { timeout: 5000 },
    async () => {
      const fixture = applicationFixture({ application: { now } });
      try {
        await withRoutes(
          async (base) => {
            const opened = await wirePost(
              base,
              'application-open',
              applicationInput,
              type
            );
            const entered = await wirePost(
              base,
              'application-advance',
              {
                ...applicationInput,
                revision: opened.value.revision,
                action: 'enter',
                confirm: true,
              },
              type
            );
            const receipt = await wirePost(
              base,
              'application-advance',
              {
                ...applicationInput,
                revision: entered.value.revision,
                action: 'submit',
                confirm: true,
              },
              type
            );
            assert.equal(receipt.status, 200);
            assert.equal(receipt.value.delivery, 'provider-confirmed');
            const closed = await wirePost(
              base,
              'application-close',
              { ...applicationInput, revision: receipt.value.revision },
              type
            );
            assert.equal(closed.status, 200);
            const refreshed = await wirePost(
              base,
              'collect',
              { url: applicationInput.url, refresh: true },
              type
            );
            assert.equal(refreshed.status, 200);
            assert.equal(refreshed.value.status, 'applied');
            assert.equal(refreshed.value.appliedAt, appliedAt);
            const response = await fetch(`${base}/api/vacancies/stored`, {
              headers: { accept: type },
            });
            const value = decodeWire(
              await response.arrayBuffer(),
              response.headers.get('content-type')
            );
            assert.equal(value.entries[0].appliedAt, appliedAt);
            assert.equal(fixture.state.submitted, 1);
          },
          { store: fixture.store, service: fixture.serviceOptions }
        );
      } finally {
        await fixture.close();
      }
    }
  );
}
