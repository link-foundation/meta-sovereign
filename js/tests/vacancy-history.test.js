import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import { vacancyContent } from '../src/assignments/vacancy-content.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { refusedSnapshot } from './helpers/refused-snapshot.mjs';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import {
  legacyVacancy,
  withLegacyVacancies,
} from '../../experiments/issue-56/vacancy-legacy-fixture.mjs';

const first = '2026-11-01T00:00:00Z';
const later = '2026-11-18T00:00:00Z';
const snapshot = (capturedAt = first) => ({
  ...vacancySnapshotFixture(),
  capturedAt,
});
const history = (row) => [row.firstSeenAt, row.lastSeenAt, row.capturedAt];

test(
  'successful refresh retains the first observation and cached reads do not advance history',
  { timeout: 5000 },
  async () => {
    const driver = createInMemoryDriver();
    let store = await createBrowserStore({ driver });
    let reads = 0;
    let current = snapshot();
    let service = createVacancyService({
      store,
      readVacancy: async () => {
        reads++;
        return current;
      },
    });
    try {
      const saved = await service.collect({ url: current.url });
      assert.deepEqual(history(saved), [first, first, first]);
      current = {
        ...snapshot(later),
        description: 'Updated full description.',
      };
      assert.deepEqual(history(await service.collect({ url: current.url })), [
        first,
        first,
        first,
      ]);
      assert.equal(reads, 1);
      const refreshed = await service.collect({
        url: 'https://spb.hh.ru/vacancy/123?from=chat',
        refresh: true,
      });
      assert.equal(refreshed.id, saved.id);
      assert.deepEqual(history(refreshed), [first, later, later]);
      assert.equal(refreshed.description, current.description);
      assert.equal(reads, 2);
      await service.stop();
      await store.close();
      store = await createBrowserStore({ driver });
      service = createVacancyService({
        store,
        readVacancy: () =>
          assert.fail('Recovery must use acknowledged history'),
      });
      assert.deepEqual(history((await service.stored()).entries[0]), [
        first,
        later,
        later,
      ]);
      const api = createVacancyApi({
        get: async () => null,
        local: async () => store,
      });
      assert.deepEqual(history((await api.vacancyStored()).entries[0]), [
        first,
        later,
        later,
      ]);
    } finally {
      await service.stop();
      await store.close();
    }
  }
);

test('refresh of a historical snapshot uses its acknowledged capture as the first observation', async () => {
  const store = createMemoryStore();
  const service = createVacancyService({
    store,
    readVacancy: async () => snapshot(later),
  });
  try {
    const saved = await service.collect({ url: snapshot().url });
    await store.put({
      ...saved,
      capturedAt: first,
      firstSeenAt: undefined,
      lastSeenAt: undefined,
    });
    const refreshed = await service.collect({ url: saved.url, refresh: true });
    assert.deepEqual(history(refreshed), [first, later, later]);
  } finally {
    await service.stop();
  }
});

test(
  'migration retains original observation timestamps before and after a native refresh',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      await write();
      const { service } = await open({
        readVacancy: async () => snapshot(later),
      });
      const imported = (await service.stored()).entries[0];
      assert.deepEqual(history(imported), [
        legacyVacancy().firstSeenAt,
        legacyVacancy().lastSeenAt,
        legacyVacancy().lastSeenAt,
      ]);
      const refreshed = await service.collect({
        url: imported.url,
        refresh: true,
      });
      assert.deepEqual(history(refreshed), [
        legacyVacancy().firstSeenAt,
        later,
        later,
      ]);
    });
  }
);

test(
  'rejected refresh restores acknowledged dates for waiting readers and durable storage',
  { timeout: 5000 },
  async () => {
    const fixture = await refusedSnapshot();
    const { store, driver } = fixture;
    let current = snapshot();
    const service = createVacancyService({
      store,
      readVacancy: async () => current,
    });
    let rejected, waiting;
    try {
      await service.collect({ url: current.url });
      const before = await service.stored();
      assert.deepEqual(history(before.entries[0]), [first, first, first]);
      current = snapshot(later);
      fixture.failNext();
      rejected = assert.rejects(
        service.collect({ url: current.url, refresh: true }),
        (error) => error === fixture.failure
      );
      await fixture.entered.promise;
      waiting = service.stored();
      fixture.release.resolve();
      await rejected;
      assert.deepEqual(await waiting, before);
      assert.deepEqual(history((await driver.load()).links[0]), [
        first,
        first,
        first,
      ]);
    } finally {
      fixture.release.resolve();
      await Promise.allSettled([rejected, waiting]);
      await service.stop();
      await store.close();
    }
  }
);

test('malformed observation metadata cannot replace a successful snapshot or trigger a provider refresh', async () => {
  const store = createMemoryStore();
  let reads = 0;
  const service = createVacancyService({
    store,
    readVacancy: async () => {
      reads++;
      return snapshot(later);
    },
  });
  try {
    const saved = await service.collect({ url: snapshot().url });
    for (const key of ['firstSeenAt', 'lastSeenAt']) {
      for (const value of [null, 7, '', 'not-a-date', 'x'.repeat(41)]) {
        const corrupted = { ...saved, [key]: value };
        await store.put(corrupted);
        await assert.rejects(
          service.collect({ url: saved.url, refresh: true }),
          { code: 'assignment-vacancy-invalid' }
        );
        assert.deepEqual(await store.get(saved.id), corrupted);
        assert.equal(reads, 1);
      }
    }
  } finally {
    await service.stop();
  }
});

test('older content without history stays compatible and a cached read invents no earlier dates', async () => {
  assert.deepEqual(vacancyContent(snapshot()), snapshot());
  const store = createMemoryStore();
  const service = createVacancyService({
    store,
    readVacancy: async () => snapshot(),
  });
  try {
    const saved = await service.collect({ url: snapshot().url });
    const { firstSeenAt: _first, lastSeenAt: _last, ...old } = saved;
    await store.put(old);
    assert.deepEqual((await service.stored()).entries[0], {
      id: old.id,
      ...snapshot(),
    });
  } finally {
    await service.stop();
  }
});

test('CLI collected and saved vacancy receipts preserve observation history', async () => {
  const store = createMemoryStore();
  let current = snapshot();
  const commands = createVacancyCommands({
    openStore: async () => store,
    readVacancy: async () => current,
  });
  const lines = [];
  const print = (line) => lines.push(line);
  assert.equal(
    await commands['vacancies-collect']({ url: current.url }, print),
    0
  );
  assert.deepEqual(history(decodeWire(lines.pop())), [first, first, first]);
  current = snapshot(later);
  assert.equal(
    await commands['vacancies-collect'](
      { url: current.url, refresh: true },
      print
    ),
    0
  );
  assert.deepEqual(history(decodeWire(lines.pop())), [first, later, later]);
  assert.equal(await commands['vacancies-stored']({}, print), 0);
  assert.deepEqual(history(decodeWire(lines.pop()).entries[0]), [
    first,
    later,
    later,
  ]);
});

for (const format of [LINO_TEXT, LINO_BINARY]) {
  test(
    `vacancy observation history survives collection and cached read through ${format}`,
    { timeout: 5000 },
    async () => {
      let current = snapshot();
      await withRoutes(
        async (base) => {
          const initial = await wirePost(
            base,
            'collect',
            { url: current.url },
            format
          );
          assert.equal(initial.status, 200);
          assert.deepEqual(history(initial.value), [first, first, first]);
          current = snapshot(later);
          const refreshed = await wirePost(
            base,
            'collect',
            { url: current.url, refresh: true },
            format
          );
          assert.equal(refreshed.status, 200);
          assert.deepEqual(history(refreshed.value), [first, later, later]);
          const response = await fetch(`${base}/api/vacancies/stored`, {
            headers: { accept: format },
          });
          assert.equal(response.status, 200);
          const saved = decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          );
          assert.deepEqual(history(saved.entries[0]), [first, later, later]);
        },
        { service: { readVacancy: async () => current } }
      );
    }
  );
}
