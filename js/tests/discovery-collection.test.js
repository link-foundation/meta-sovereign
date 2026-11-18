import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoveryFixture,
  discoveryCard,
} from '../../experiments/issue-56/discovery-fixture.mjs';
import { searchFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { validateVacancySearch } from '../src/jobs/search-result.js';
import { ladderSalary } from '../../experiments/issue-56/salary-ladder-fixture.mjs';
import {
  saveDeferredQuestions,
  storedDeferredQuestions,
} from '../src/jobs/deferred-questions.js';

const single = (t, card, options = {}) =>
  discoveryFixture(t, {
    readSearch: (url) =>
      validateVacancySearch({ ...searchFixture(url, [card]), next: null }, url),
    ...options,
  });
const run = async (f, input = {}) => {
  await f.start({ maxPages: 1, ...input });
  return (await f.drain()).discovery;
};

for (const field of ['title', 'company']) {
  test(
    `a selected ${field}-excluded vacancy is collected before filtering and reused`,
    { timeout: 5000 },
    async (t) => {
      const card = discoveryCard(123, { [field]: 'Excluded service' });
      const f = single(t, card);
      const input = { excludeText: 'excluded' };
      const job = await run(f, input);
      assert.equal(job.phase, 'completed');
      assert.equal(job.entries[0].decision.reason, 'configured-text');
      assert.equal(job.entries[0].decision.field, field);
      assert.ok(job.entries[0].capturedAt);
      assert.equal((await f.service.stored()).entries[0].url, card.url);
      await run(f, { ...input, requestId: 'second' });
      assert.equal(f.descriptions.length, 1);
    }
  );
}
for (const [salary, action] of [
  ['до 200000 ₽', 'exclude'],
  ['от 300000 ₽', 'defer'],
]) {
  test(
    `a salary-${action} vacancy contributes its full description without becoming eligible`,
    { timeout: 5000 },
    async (t) => {
      const card = discoveryCard(123, { salary });
      const f = single(t, card);
      const job = await run(f, {
        salary: undefined,
        salaryConfig: ladderSalary,
      });
      assert.equal(job.entries[0].pay.action, action);
      assert.ok(job.entries[0].capturedAt);
      assert.equal(f.descriptions.length, 1);
      assert.equal((await f.service.stored()).entries.length, 1);
    }
  );
}
test(
  'an unreadable excluded vacancy cannot publish complete discovery progress',
  { timeout: 5000 },
  async (t) => {
    const f = single(t, discoveryCard(123, { title: 'Excluded job' }), {
      readVacancy: async () => {
        throw Object.assign(new Error('unreadable'), {
          code: 'assignment-vacancy-unavailable',
        });
      },
    });
    const job = await run(f, { excludeText: 'Excluded' });
    assert.equal(job.phase, 'failed');
    assert.equal(job.entries.length, 0);
    assert.equal(f.descriptions.length, 1);
    assert.deepEqual((await f.service.stored()).entries, []);
  }
);
for (const hold of ['responded', 'owner-skipped', 'owner-deferred', 'retry']) {
  test(
    `collection preserves the existing ${hold} hold`,
    { timeout: 5000 },
    async (t) => {
      const card = discoveryCard(123, { responded: hold === 'responded' });
      const f = single(t, card, {
        discovery: { retryWaiting: () => hold === 'retry' },
      });
      if (hold.startsWith('owner-')) {
        await f.service['choice-save']({
          url: card.url,
          title: card.title,
          state: hold.slice(6),
          revision: 'empty',
        });
      }
      const job = await run(f);
      assert.equal(job.phase, 'completed');
      assert.equal(
        job.entries[0].decision.reason,
        hold === 'retry' ? 'retry-wait' : hold
      );
      assert.equal(f.descriptions.length, 0);
    }
  );
}

test(
  'a title-excluded vacancy with a pending question still avoids extra reads',
  { timeout: 5000 },
  async (t) => {
    const card = discoveryCard(123, { title: 'Excluded job' });
    const f = single(t, card);
    await saveDeferredQuestions(
      f.store,
      await storedDeferredQuestions(f.store),
      [
        {
          id: globalThis.crypto.randomUUID(),
          question: 'Pending owner answer',
          mode: 'always',
          vacancies: [card.url],
          createdAt: new Date().toISOString(),
        },
      ]
    );
    const job = await run(f, { excludeText: 'Excluded' });
    assert.equal(job.phase, 'completed');
    assert.equal(job.entries[0].decision.reason, 'configured-text');
    assert.equal(f.descriptions.length, 0);
  }
);
