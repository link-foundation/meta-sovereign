import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContext,
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';
import * as supervised from '../src/storage/migrations/0014-supervised-applications.js';
import * as popup from '../src/storage/migrations/0015-popup-application-recovery.js';
import * as resume from '../src/storage/migrations/0016-application-resume-preference.js';
import { readApplicationJournal } from '../src/jobs/application-journal.js';
import { applicationKey } from '../src/jobs/application-options.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';

for (const [migration, option, keyName, code] of [
  [supervised, true, 'supervised', 'APPLICATION_SUPERVISED_COLLISION'],
  [popup, false, 'popupReview', 'APPLICATION_POPUP_COLLISION'],
  [
    resume,
    false,
    'resumePreference',
    'APPLICATION_RESUME_PREFERENCE_COLLISION',
  ],
]) {
  test(
    `${migration.id} preserves acknowledged legacy options, signatures and dispatch history byte for byte`,
    { timeout: 4000 },
    async (t) => {
      const fixture = applicationFixture();
      t.after(() => fixture.close());
      await fixture.enter();
      await fixture.service.stop();
      await fixture.store.put(schemaLink({ version: migration.from }));
      const key = applicationKey(applicationInput);
      const before = await fixture.store.get(key.id);
      delete (option ? before.options : before)[keyName];
      await fixture.store.put(before);
      assert.equal(Object.hasOwn(before.options, 'supervised'), false);
      const dry = createContext(fixture.store, migration, { dryRun: true });
      await migration.up(dry);
      assert.equal(dry.stats.changed, 0);
      assert.equal(
        (await fixture.store.get(SCHEMA_ID)).version,
        migration.from
      );
      await runMigrations(fixture.store, { migrations: [migration] });
      assert.equal((await fixture.store.get(SCHEMA_ID)).version, migration.to);
      assert.deepEqual(await fixture.store.get(key.id), before);
      assert.equal(readApplicationJournal(before, key).attempted.enter, true);
      const again = createContext(fixture.store, migration);
      await migration.up(again);
      assert.equal(again.stats.changed, 0);
      assert.deepEqual(await fixture.store.get(key.id), before);
    }
  );

  test(
    `${migration.id} refuses an unexpected pre-existing field without changing legacy intent or schema`,
    { timeout: 4000 },
    async (t) => {
      const fixture = applicationFixture();
      t.after(() => fixture.close());
      const old = {
        id: 'secret:jobs-application:jobs:123',
        ...(option
          ? { options: { [keyName]: 'owner-data' } }
          : { [keyName]: 'owner-data' }),
      };
      await fixture.store.putMany([
        schemaLink({ version: migration.from }),
        old,
      ]);
      await assert.rejects(
        runMigrations(fixture.store, { migrations: [migration] }),
        (error) => error.cause?.code === code
      );
      assert.equal(
        (await fixture.store.get(SCHEMA_ID)).version,
        migration.from
      );
      assert.deepEqual(await fixture.store.get(old.id), old);
    }
  );
}
