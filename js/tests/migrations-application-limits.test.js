import test from 'node:test';
import * as migration from '../src/storage/migrations/0018-application-limits.js';
import { applicationLimitId } from '../src/jobs/application-limit-data.js';
import { assertApplicationMigration } from './helpers/application-migration.mjs';

test(
  'limit schema reserves its private namespace without rewriting existing application intent',
  { timeout: 4000 },
  async () => {
    await assertApplicationMigration(
      migration,
      {
        id: 'secret:jobs-application:jobs:123',
        signature: 'untouched',
        attempted: { enter: true, submit: true },
      },
      [{ id: applicationLimitId, value: 'existing-owner-record' }],
      'APPLICATION_LIMIT_COLLISION'
    );
  }
);
