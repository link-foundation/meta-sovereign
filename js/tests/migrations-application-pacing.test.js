import test from 'node:test';
import * as migration from '../src/storage/migrations/0020-application-pacing.js';
import { applicationPacingId } from '../src/jobs/application-pacing-data.js';
import { assertApplicationMigration } from './helpers/application-migration.mjs';

test(
  'pacing schema reserves its private namespace without changing existing intent',
  { timeout: 4000 },
  async () => {
    await assertApplicationMigration(
      migration,
      {
        id: 'secret:jobs-application:jobs:123',
        signature: 'unchanged',
        attempted: { enter: true, submit: false },
      },
      [{ id: applicationPacingId, value: 'owner-data' }],
      'APPLICATION_PACING_COLLISION'
    );
  }
);
