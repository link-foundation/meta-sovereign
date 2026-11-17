import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';

for (const operation of [
  'search',
  'resumes',
  'collect',
  'resume-export',
  'application-open',
]) {
  test(
    `HH ${operation} uses the workspace's shared named browser profile`,
    { timeout: 5000 },
    async (t) => {
      const storeDir = await mkdtemp(
        path.join(os.tmpdir(), 'ms-jobs-profile-')
      );
      const store = createMemoryStore();
      const launched = Promise.withResolvers();
      const calls = [];
      const service = createVacancyService({
        store,
        storeDir,
        openSession: async (options) => {
          calls.push(options);
          launched.resolve();
          throw Object.assign(new Error('Synthetic launch refusal'), {
            code: 'jobs-fixture',
          });
        },
      });
      t.after(async () => {
        await service.stop();
        await store.close?.();
        await rm(storeDir, { recursive: true, force: true });
      });
      const result = service[operation]({
        browserSlot: 'account-two',
        headless: true,
        url: 'https://hh.ru/vacancy/123',
        requestId: 'shared-profile',
        autoSelectResumeLanguage: false,
      });
      const settled = Promise.allSettled([result]);
      await launched.promise;
      await settled;
      await service.stop();
      assert.equal(calls.length, 1);
      assert.equal(
        calls[0].profileDir,
        path.join(storeDir, 'browser-profiles', 'hh', 'slots', 'account-two')
      );
      assert.equal(calls[0].platform, 'hh');
      assert.equal(calls[0].useCase, 'jobs');
      assert.equal(calls[0].headless, true);
    }
  );
}
