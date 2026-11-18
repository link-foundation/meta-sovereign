import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssignmentVacancyReader } from '../src/assignments/vacancy-reader.js';
import { ApplicationReview } from '../src/jobs/application-review.js';
import {
  vacancySnapshotFixture,
  vacancyUrl,
} from '../../experiments/issue-56/vacancy-fixture.mjs';

const loaded = () => ({
  ...vacancySnapshotFixture(),
  descriptionHtml: '<p>Complete employer description.</p>',
});
const browser = (observations) => {
  const calls = { reads: 0, closed: 0 };
  return {
    calls,
    commander: {
      goto: async () => ({ navigated: true, verified: true, status: 'ready' }),
      evaluate: async () =>
        observations[Math.min(calls.reads++, observations.length - 1)],
    },
    close: async () => calls.closed++,
  };
};
const collect = (session) =>
  createAssignmentVacancyReader({
    store: {},
    openSession: async () => session,
  })(vacancyUrl);

test(
  'vacancy collection waits for a description hydrated after DOMContentLoaded',
  { timeout: 3000 },
  async () => {
    const session = browser([
      { ...loaded(), description: '', descriptionHtml: '' },
      loaded(),
    ]);
    assert.equal((await collect(session)).description, loaded().description);
    assert.equal(session.calls.reads, 2);
    assert.equal(session.calls.closed, 1);
  }
);

test(
  'vacancy collection waits for the intended title without losing full description HTML',
  { timeout: 3000 },
  async () => {
    const session = browser([{ ...loaded(), title: '' }, loaded()]);
    const result = await collect(session);
    assert.equal(result.title, loaded().title);
    assert.equal(result.descriptionHtml, loaded().descriptionHtml);
    assert.equal(session.calls.closed, 1);
  }
);

test(
  'application vacancy context waits for the same delayed native description',
  { timeout: 3000 },
  async () => {
    const session = browser([{ ...loaded(), description: '' }, loaded()]);
    const record = {
      browser: session,
      url: vacancyUrl,
      options: { testMode: true },
      page: { scope: false },
    };
    const review = new ApplicationReview({ trace: () => {} });
    await review.vacancy(record, new AbortController().signal);
    assert.equal(record.vacancy.description, loaded().description);
    assert.equal(session.calls.reads, 2);
    assert.equal(
      session.calls.closed,
      0,
      'the held application owns its browser'
    );
  }
);

test('already loaded vacancy collection reads once and closes without a timer wait', async () => {
  const session = browser([loaded()]);
  assert.equal((await collect(session)).title, loaded().title);
  assert.deepEqual(session.calls, { reads: 1, closed: 1 });
});

test('a challenge or changed vacancy during hydration is refused without another read', async () => {
  for (const changed of [
    { challenge: true },
    { url: 'https://hh.ru/vacancy/456' },
  ]) {
    const session = browser([
      { ...loaded(), description: '', ...changed },
      loaded(),
    ]);
    await assert.rejects(collect(session));
    assert.deepEqual(session.calls, { reads: 1, closed: 1 });
  }
});
