import test from 'node:test';
import * as migration from '../src/storage/migrations/0019-application-limit-drafts.js';
import { assertApplicationMigration } from './helpers/application-migration.mjs';

test(
  'daily-limit draft provenance reserves its additive field and preserves legacy delivery history',
  { timeout: 4000 },
  async () => {
    const row = {
      id: 'secret:jobs-application:jobs:123',
      signature: 'legacy',
      attempted: { enter: true, submit: true },
      delivery: 'unknown',
      draft: { id: 'existing-draft' },
    };
    await assertApplicationMigration(
      migration,
      row,
      [{ ...row, draft: { ...row.draft, limit: null } }],
      'APPLICATION_LIMIT_DRAFT_COLLISION'
    );
  }
);
