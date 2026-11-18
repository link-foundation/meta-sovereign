import test from 'node:test';
import assert from 'node:assert/strict';
import { readLoadedVacancy } from '../src/assignments/vacancy-loading.js';
import {
  vacancySnapshotFixture,
  vacancyUrl,
} from '../../experiments/issue-56/vacancy-fixture.mjs';

const fixture = (observations) => {
  let time = 0;
  const calls = { reads: 0, waits: [], trace: [] };
  const session = {
    commander: {
      evaluate: async () =>
        observations[Math.min(calls.reads++, observations.length - 1)],
    },
  };
  const options = {
    url: vacancyUrl,
    now: () => time,
    wait: async (ms) => {
      calls.waits.push(ms);
      time += ms;
    },
    trace: (event) => calls.trace.push(event),
  };
  return {
    calls,
    session,
    options,
    read: (extra = {}) =>
      readLoadedVacancy(session, () => {}, { ...options, ...extra }),
  };
};

test('unhydrated vacancy content expires after exactly twenty seconds of finite reads', async () => {
  const f = fixture([{ ...vacancySnapshotFixture(), description: '' }]);
  await assert.rejects(f.read(), { code: 'assignment-vacancy-timeout' });
  assert.equal(f.calls.reads, 80);
  assert.equal(f.calls.waits.length, 80);
  assert.equal(
    f.calls.waits.reduce((a, b) => a + b),
    20000
  );
  assert.deepEqual(f.calls.trace, [
    { event: 'vacancy-content-wait-started' },
    { event: 'vacancy-content-wait-expired', reads: 80 },
  ]);
});

test('ambiguous or oversized native content is refused without hydration retries', async () => {
  for (const changed of [
    { title: null },
    { description: null },
    { company: null },
    { skills: null },
    { descriptionHtml: null },
  ]) {
    const value = { ...vacancySnapshotFixture(), title: '', ...changed };
    const f = fixture([value, vacancySnapshotFixture()]);
    assert.deepEqual(await f.read(), value);
    assert.equal(f.calls.reads, 1);
    assert.deepEqual(f.calls.waits, []);
  }
});

test('a changed vacancy or a challenge terminates a pending content wait', async () => {
  for (const changed of [
    { challenge: true },
    { url: 'https://hh.ru/vacancy/456' },
  ]) {
    const value = { ...vacancySnapshotFixture(), ...changed };
    const f = fixture([
      { ...vacancySnapshotFixture(), description: '' },
      value,
      vacancySnapshotFixture(),
    ]);
    assert.deepEqual(await f.read(), value);
    assert.equal(f.calls.reads, 2);
    assert.deepEqual(f.calls.waits, [250]);
    assert.deepEqual(f.calls.trace.at(-1), {
      event: 'vacancy-content-wait-finished',
      reads: 2,
    });
  }
});

test('cancellation during a hydration wait refuses further reads', async () => {
  const f = fixture([
    { ...vacancySnapshotFixture(), description: '' },
    vacancySnapshotFixture(),
  ]);
  const controller = new AbortController();
  await assert.rejects(
    f.read({ signal: controller.signal, wait: async () => controller.abort() }),
    { name: 'AbortError' }
  );
  assert.equal(f.calls.reads, 1);
});

test(
  'native cancellable hydration delay drains immediately on owner Stop',
  { timeout: 1000 },
  async () => {
    const f = fixture([{ ...vacancySnapshotFixture(), description: '' }]);
    const controller = new AbortController();
    const promise = readLoadedVacancy(f.session, () => {}, {
      url: vacancyUrl,
      signal: controller.signal,
      trace: () => globalThis.queueMicrotask(() => controller.abort()),
    });
    await assert.rejects(promise, { name: 'AbortError' });
    assert.equal(f.calls.reads, 1);
  }
);

test('a slow hydration read cannot turn an expired wait into accepted content', async () => {
  const f = fixture([
    { ...vacancySnapshotFixture(), description: '' },
    vacancySnapshotFixture(),
  ]);
  const evaluate = f.session.commander.evaluate;
  f.session.commander.evaluate = async () => {
    if (f.calls.reads === 1) {
      await f.options.wait(19751);
    }
    return evaluate();
  };
  await assert.rejects(f.read(), {
    code: 'assignment-vacancy-timeout',
  });
  assert.equal(f.calls.reads, 2);
});

test('hydration diagnostics contain only state and counts', async () => {
  const f = fixture([
    { ...vacancySnapshotFixture(), description: '' },
    vacancySnapshotFixture(),
  ]);
  await f.read();
  assert.deepEqual(f.calls.trace, [
    { event: 'vacancy-content-wait-started' },
    { event: 'vacancy-content-wait-finished', reads: 2 },
  ]);
});
