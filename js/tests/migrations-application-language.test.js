import test from 'node:test';
import * as migration from '../src/storage/migrations/0017-application-language-policy.js';
import { assertApplicationMigration } from './helpers/application-migration.mjs';

test(
  'language schema reserves each new private field and preserves legacy signatures and reservations unchanged',
  { timeout: 5000 },
  async () => {
    const row = {
      id: 'secret:jobs-application:jobs:123',
      signature: 'unchanged',
      attempted: { enter: true, submit: false },
      options: {},
    };
    const collisions = [
      {
        ...row,
        options: { autoSelectResumeLanguage: 'unexpected-owner-value' },
      },
      { ...row, options: { standardLetters: 'unexpected-owner-value' } },
      { ...row, letterTemplate: 'unexpected-owner-value' },
    ];
    await assertApplicationMigration(
      migration,
      row,
      collisions,
      'APPLICATION_LANGUAGE_POLICY_COLLISION'
    );
  }
);
