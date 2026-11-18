import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveDeferredQuestions,
  storedDeferredQuestions,
} from '../src/jobs/deferred-questions.js';
import { discoveryFixture } from '../../experiments/issue-56/discovery-fixture.mjs';
import {
  applicationBatchFixture,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';

const seed = async (store, vacancies) =>
  saveDeferredQuestions(store, await storedDeferredQuestions(store), [
    {
      id: globalThis.crypto.randomUUID(),
      question: 'Private question fragment',
      mode: 'always',
      vacancies,
      createdAt: new Date().toISOString(),
    },
  ]);

test(
  'search exposes the policy revision without leaking private question wording',
  { timeout: 4000 },
  async (t) => {
    const f = discoveryFixture(t);
    const saved = await seed(f.store, ['https://hh.ru/vacancy/123']);
    const result = await f.service.search({ query: 'Python' });
    assert.equal(result.selection.questionRevision, saved.revision);
    assert.equal(result.selection.decisions[0].reason, 'question-deferred');
    assert.equal(result.selection.decisions[1].reason, 'responded');
    assert.doesNotMatch(JSON.stringify(result), /Private question fragment/u);
    assert.equal(f.descriptions.length, 0);
  }
);

test(
  'discovery does not read a description for a durably associated pending vacancy',
  { timeout: 4000 },
  async (t) => {
    const f = discoveryFixture(t);
    const saved = await seed(f.store, ['https://hh.ru/vacancy/123']);
    await f.start();
    const { discovery } = await f.drain();
    assert.equal(discovery.phase, 'completed');
    assert.equal(discovery.entries[0].decision.reason, 'question-deferred');
    assert.equal(discovery.entries[0].questionRevision, saved.revision);
    assert.deepEqual(
      f.descriptions.map((row) => row.url),
      ['https://hh.ru/vacancy/125']
    );
  }
);

test(
  'batch admission skips durable question associations before opening any provider browser',
  { timeout: 5000 },
  async (t) => {
    const f = applicationBatchFixture(t);
    await seed(f.store, batchUrls);
    await f.start();
    await f.service['application-batch-drain']();
    const { batch } = await f.status();
    assert.equal(
      batch.phase,
      'completed',
      JSON.stringify({
        batch,
        opened: f.state.opened,
        closed: f.state.closed,
        submitted: f.state.submitted,
      })
    );
    assert.equal(batch.skipped, batchUrls.length);
    assert.equal(batch.delivered, 0);
    assert.equal(f.state.opened, 0);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'a batch encountering a new always-deferred question preserves the form before any send',
  { timeout: 5000 },
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.service['question-change']({
      action: 'save',
      question: 'Recent experience',
      mode: 'always',
      revision: 'empty',
    });
    await f.start({ urls: [batchUrls[0]] });
    await f.service['application-batch-drain']();
    const { batch } = await f.status();
    assert.equal(
      batch.phase,
      'completed',
      JSON.stringify({
        batch,
        opened: f.state.opened,
        closed: f.state.closed,
        submitted: f.state.submitted,
      })
    );
    assert.equal(batch.delivered, 0);
    assert.equal(batch.skipped, 1);
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.closed, 1);
    assert.deepEqual(
      (await storedDeferredQuestions(f.store)).entries[0].vacancies,
      [batchUrls[0]]
    );
    assert.deepEqual((await f.service['application-queue']({})).entries, []);
  }
);
