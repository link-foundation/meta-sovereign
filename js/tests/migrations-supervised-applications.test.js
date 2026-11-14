import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContext,
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0014-supervised-applications.js';
import { readApplicationJournal } from '../src/jobs/application-journal.js';
import { applicationKey } from '../src/jobs/application-options.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';

test(
  '0014 preserves acknowledged legacy options, signatures and dispatch history byte for byte',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    await fixture.enter();
    await fixture.service.stop();
    await fixture.store.put(schemaLink({ version: 13 }));
    const key = applicationKey(applicationInput);
    const before = await fixture.store.get(key.id);
    assert.equal(Object.hasOwn(before.options, 'supervised'), false);
    const dry = createContext(fixture.store, migration, { dryRun: true });
    await migration.up(dry);
    assert.equal(dry.stats.changed, 0);
    assert.equal((await fixture.store.get(SCHEMA_ID)).version, 13);
    await runMigrations(fixture.store, { migrations: [migration] });
    assert.equal((await fixture.store.get(SCHEMA_ID)).version, 14);
    assert.deepEqual(await fixture.store.get(key.id), before);
    assert.equal(readApplicationJournal(before, key).attempted.enter, true);
    const again = createContext(fixture.store, migration);
    await migration.up(again);
    assert.equal(again.stats.changed, 0);
    assert.deepEqual(await fixture.store.get(key.id), before);
  }
);

test(
  '0014 refuses an unexpected pre-existing setting without changing legacy intent or schema',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const old = {
      id: 'secret:jobs-application:jobs:123',
      options: { supervised: 'owner-data' },
    };
    await fixture.store.putMany([schemaLink({ version: 13 }), old]);
    await assert.rejects(
      runMigrations(fixture.store, { migrations: [migration] }),
      (error) => error.cause?.code === 'APPLICATION_SUPERVISED_COLLISION'
    );
    assert.equal((await fixture.store.get(SCHEMA_ID)).version, 13);
    assert.deepEqual(await fixture.store.get(old.id), old);
  }
);
