import test from 'node:test';
import * as migration from '../src/storage/migrations/0026-application-route.js';
import { assertApplicationMigration } from './helpers/application-migration.mjs';

test(
  'route schema preserves legacy signatures and reservations, is idempotent and rejects both fields in reviews and batches',
  { timeout: 5000 },
  async () => {
    const row = {
      id: 'secret:jobs-application:jobs:123',
      signature: 'acknowledged-unchanged',
      attempted: { enter: true, submit: false },
      options: {},
    };
    const collisions = ['applyFromVacancyPage', 'applicationSearchUrl'].flatMap(
      (key) => [
        { ...row, options: { [key]: 'owner-value' } },
        {
          id: 'secret:jobs-application-batch:jobs:batch',
          signature: 'batch-unchanged',
          options: { review: { [key]: false } },
        },
      ]
    );
    await assertApplicationMigration(
      migration,
      row,
      collisions,
      'APPLICATION_ROUTE_COLLISION'
    );
  }
);
