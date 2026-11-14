import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationPacingFixture } from '../../experiments/issue-56/application-pacing-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  applicationPacingId,
  readApplicationPacingRow,
  applicationPacingData,
} from '../src/jobs/application-pacing-data.js';
import { applicationSettings } from '../src/jobs/application-options.js';
import {
  applicationLimitId,
  applicationLimitMs,
} from '../src/jobs/application-limit-data.js';

const read = (f, receipt) => f.service['application-read'](identity(receipt));

test(
  'paced reviews persist their deadline and refuse another vacancy before opening its browser',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    const receipt = await f.open();
    const pacing = (await f.queue()).pacing;
    assert(pacing, 'A paced review did not save its admission interval.');
    assert.equal(pacing.intervalMs, 120000);
    assert.equal(pacing.saved, true);
    assert.equal(pacing.waiting, true);
    await f.release(receipt);
    f.clock.value += 119999;
    await assert.rejects(f.open(456), { code: 'jobs-application-pace-wait' });
    assert.equal(f.state.opened, 1);
    assert.equal(await f.store.get('secret:jobs-application:jobs:456'), null);
    f.clock.value++;
    await f.open(456);
    assert.equal(f.state.opened, 2);
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'fixed pacing spans slots and omission cannot bypass an active window; long manual work counts',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    let receipt = await f.open(123, { applicationIntervalSeconds: 17 });
    await f.release(receipt);
    await assert.rejects(
      f.open(456, {
        browserSlot: 'other',
        applicationIntervalSeconds: undefined,
      }),
      { code: 'jobs-application-pace-wait' }
    );
    assert.equal((await f.queue()).pacing.intervalMs, 17000);
    f.clock.value += 18000;
    receipt = await f.open(456, { applicationIntervalSeconds: 17 });
    f.clock.value += 30000;
    await f.release(receipt);
    await f.open(789, { applicationIntervalSeconds: 17 });
    assert.equal(f.state.opened, 3);
  }
);

test(
  'restart and same-review recovery preserve the saved interval without a timer or replay',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    const receipt = await f.open();
    const before = (await f.queue()).pacing;
    await f.service.stop();
    const service = f.worker();
    t.after(() => service.stop());
    f.clock.value += 20000;
    const recovered = await service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    assert.equal(recovered.active, true);
    assert.deepEqual((await service['application-queue']({})).pacing, before);
    await service['application-close'](identity(recovered));
    await assert.rejects(f.open(456, {}, service), {
      code: 'jobs-application-pace-wait',
    });
    assert.equal(f.state.opened, 2);
    assert.deepEqual(f.state.writes, []);
  }
);

test(
  'delivery adjusts adaptive pacing once, including a native manual send, but a click alone does not',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    let receipt = await f.open();
    receipt = await f.service['application-advance'](
      identity(receipt, { action: 'enter', confirm: true })
    );
    assert.equal((await f.queue()).pacing.deliveries, 0);
    f.state.page.delivered = true;
    receipt = await read(f, receipt);
    const pacing = (await f.queue()).pacing;
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(pacing.deliveries, 1);
    assert.equal(pacing.baseMs, 110000);
    assert.equal(pacing.intervalMs, 110000);
    await read(f, receipt);
    assert.deepEqual((await f.queue()).pacing, pacing);
  }
);

test(
  'native CAPTCHA observations deduplicate per document, cap cooldown at fifteen minutes and never inspect answers',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    let receipt = await f.open();
    f.state.page.challenge = true;
    receipt = await read(f, receipt);
    const first = (await f.queue()).pacing;
    assert.equal(first.challenges, 1);
    assert.equal(first.baseMs, 130000);
    receipt = await read(f, receipt);
    assert.equal((await f.queue()).pacing.challenges, 1);
    for (let i = 1; i <= 6; i++) {
      f.clock.value += 120000;
      f.state.page.documentKey = `challenge-${i}`;
      receipt = await read(f, receipt);
    }
    const capped = (await f.queue()).pacing;
    assert.equal(
      Date.parse(capped.holdUntil) - Date.parse(first.startedAt),
      900000
    );
    f.state.page.challenge = false;
    f.state.page.delivered = true;
    await read(f, receipt);
    assert.equal(
      (await f.queue()).pacing.baseMs,
      capped.baseMs,
      'delivery during CAPTCHA cooldown must not speed up'
    );
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.submitted, 0);
    assert.deepEqual(f.state.writes, []);
  }
);

test(
  'cooldown expiry permits speed-up; random variation stays stable and adaptive/fixed limits hold',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t, { pacingRandom: () => 0.999999 });
    let receipt = await f.open();
    assert.equal((await f.queue()).pacing.intervalMs, 149999);
    f.state.page.challenge = true;
    receipt = await read(f, receipt);
    assert.equal((await f.queue()).pacing.baseMs, 140000);
    f.clock.value = Date.parse((await f.queue()).pacing.holdUntil);
    f.state.page.challenge = false;
    f.state.page.delivered = true;
    await read(f, receipt);
    assert.equal((await f.queue()).pacing.baseMs, 120000);
    assert.equal((await f.queue()).pacing.intervalMs, 149999);
  }
);

for (const point of ['put', 'flush']) {
  test(
    `a ${point} acknowledgement refusal blocks browser admission and keeps the pending interval`,
    { timeout: 4000 },
    async (t) => {
      const f = applicationPacingFixture(t);
      const original = f.store[point].bind(f.store);
      let refused = true;
      f.store[point] = async (...args) => {
        if (
          refused &&
          (point === 'flush' || args[0].id === applicationPacingId)
        ) {
          throw new Error(`Finite pacing ${point} refusal`);
        }
        return original(...args);
      };
      await assert.rejects(f.open(), /Finite pacing/u);
      assert.equal(f.state.opened, 0);
      assert.equal((await f.queue()).pacing.saved, false);
      await assert.rejects(f.open(456), /Finite pacing/u);
      refused = false;
      await assert.rejects(f.open(456), { code: 'jobs-application-pace-wait' });
      assert.equal((await f.queue()).pacing.saved, true);
      await f.open();
      assert.equal(f.state.opened, 1);
    }
  );
}

test(
  'an unacknowledged native observation retries the same feedback without double counting',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    let receipt = await f.open();
    const flush = f.store.flush.bind(f.store);
    let fail = true;
    f.store.flush = async () => {
      if (fail) {
        throw new Error('Finite observation refusal');
      }
      return flush();
    };
    f.state.page.challenge = true;
    await assert.rejects(read(f, receipt), /Finite observation/u);
    assert.equal((await f.queue()).pacing.challenges, 1);
    fail = false;
    receipt = await read(f, receipt);
    assert.equal((await f.queue()).pacing.challenges, 1);
    assert.equal((await f.queue()).pacing.saved, true);
    assert.equal(receipt.hold, 'verification');
  }
);

test(
  'preview is zero-effect, ordinary reviews keep legacy signatures, and a daily pause wins admission',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    let receipt = await f.open(123, { testMode: true });
    assert.equal((await f.queue()).pacing, null);
    await f.release(receipt);
    receipt = await f.open(456, { applicationIntervalSeconds: undefined });
    assert.equal((await f.queue()).pacing, null);
    const saved = await f.store.get('secret:jobs-application:jobs:456');
    assert.equal(
      Object.hasOwn(saved.options, 'applicationIntervalSeconds'),
      false
    );
    await f.release(receipt);
    await f.store.put({
      id: applicationLimitId,
      version: 1,
      scope: 'workspace',
      documentKey: 'daily-document',
      observedAt: new Date(f.clock.value).toISOString(),
      until: new Date(f.clock.value + applicationLimitMs).toISOString(),
    });
    await assert.rejects(f.open(789), { code: 'jobs-application-limit-wait' });
    assert.equal(f.state.opened, 2);
    assert.equal((await f.queue()).pacing, null);
  }
);

test(
  'pacing inputs and stored/public schedule metadata refuse malformed values',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    for (const applicationIntervalSeconds of [
      -1,
      1.5,
      86401,
      '0',
      null,
      Infinity,
    ]) {
      assert.throws(() =>
        applicationSettings({
          url: 'https://hh.ru/vacancy/123',
          requestId: 'input',
          applicationIntervalSeconds,
        })
      );
    }
    await f.open();
    const row = await f.store.get(applicationPacingId);
    const view = (await f.queue()).pacing;
    for (const extra of [
      { nextAt: row.startedAt },
      { baseMs: 0 },
      { delivered: 'yes' },
      { documents: ['a', 'a'] },
      { applicationId: 'foreign' },
      { holdUntil: row.nextAt },
    ]) {
      assert.throws(() => readApplicationPacingRow({ ...row, ...extra }));
    }
    for (const extra of [
      { saved: 1 },
      { intervalMs: 0 },
      { mode: 'fast' },
      { deliveries: -1 },
      { nextAt: view.startedAt },
    ]) {
      assert.throws(() => applicationPacingData({ ...view, ...extra }));
    }
  }
);

test(
  'adaptive feedback clamps at one and four minutes; fixed timing ignores feedback',
  { timeout: 5000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    let receipt;
    for (let i = 0; i < 10; i++) {
      f.state.page.delivered = false;
      receipt = await f.open(123 + i);
      f.state.page.delivered = true;
      receipt = await read(f, receipt);
      await f.release(receipt);
      f.clock.value = Date.parse((await f.queue()).pacing.nextAt);
    }
    assert.equal((await f.queue()).pacing.baseMs, 60000);
    f.state.page.delivered = false;
    receipt = await f.open(999, { applicationIntervalSeconds: 17 });
    f.state.page.challenge = true;
    for (let i = 0; i < 20; i++) {
      f.state.page.documentKey = `finite-bound-${i}`;
      receipt = await read(f, receipt);
    }
    const final = (await f.queue()).pacing;
    assert.equal(final.baseMs, 240000);
    assert.equal(final.challenges, 20);
    assert.equal(final.deliveries, 10);
    assert.equal(final.intervalMs, 17000);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'an active saved window permits zero-effect preview without replacing its schedule',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    const first = await f.open();
    await f.release(first);
    const before = (await f.queue()).pacing;
    const preview = await f.open(456, { testMode: true });
    assert.equal(preview.testMode, true);
    assert.deepEqual((await f.queue()).pacing, before);
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.submitted, 0);
    await f.release(preview);
    await f.store.put({
      id: applicationLimitId,
      version: 1,
      scope: 'workspace',
      documentKey: 'priority-document',
      observedAt: new Date(f.clock.value).toISOString(),
      until: new Date(f.clock.value + applicationLimitMs).toISOString(),
    });
    await assert.rejects(f.open(789), { code: 'jobs-application-limit-wait' });
    assert.deepEqual((await f.queue()).pacing, before);
  }
);
