import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitFixture } from '../../experiments/issue-56/application-limit-fixture.mjs';
import {
  applicationInput,
  applicationFixture,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { deferralStorageFault } from '../../experiments/issue-56/application-deferral-fixture.mjs';
import {
  applicationLimitMs,
  applicationLimitId,
  applicationLimitData,
} from '../src/jobs/application-limit-data.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createVacancyService } from '../src/jobs/service.js';

const read = (fixture, receipt) =>
  fixture.service['application-read'](identity(receipt));
const queue = (fixture, browserSlot = 'jobs') =>
  fixture.service['application-queue']({ browserSlot });
const prefill = (fixture, receipt) =>
  fixture.service['application-prefill'](identity(receipt, { confirm: true }));

test(
  'visible daily refusal keeps a two-hour workspace deadline after restart and banner dismissal',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    let receipt = await fixture.limited();
    assert.equal(receipt.applicationLimit?.active, true);
    assert.equal(receipt.applicationLimit.saved, true);
    assert.equal(receipt.applicationLimit.scope, 'workspace');
    assert.equal(
      Date.parse(receipt.applicationLimit.until) - fixture.clock.value,
      applicationLimitMs
    );
    const until = receipt.applicationLimit.until;
    fixture.clock.value += 60000;
    receipt = await read(fixture, receipt);
    assert.equal(receipt.applicationLimit.until, until);
    fixture.state.page.dailyLimit = false;
    receipt = await read(fixture, receipt);
    await fixture.restart();
    const status = await fixture.service['application-status'](
      identity(receipt)
    );
    assert.equal(status.applicationLimit.until, until);
    assert.equal(status.applicationLimit.active, true);
    assert.equal(status.active, false);
    assert.equal(fixture.state.opened, 1, 'status never opens a browser');
    receipt = await fixture.service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    await assert.rejects(prefill(fixture, receipt), {
      code: 'jobs-application-limit-wait',
    });
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.writes.length, 0);
  }
);

test(
  'an acknowledged pause survives a real private Lino log close and reopen',
  { timeout: 5000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'application-limit-'));
    const resources = {};
    t.after(async () => {
      await resources.fixture?.service.stop();
      await resources.reopened?.close();
      await resources.first?.close();
      await rm(directory, { recursive: true, force: true });
    });
    const path = join(directory, 'private.lino');
    const first = await createLinoTextStore(path);
    resources.first = first;
    const fixture = applicationFixture({ store: first });
    resources.fixture = fixture;
    let receipt = await fixture.enter();
    fixture.state.page.dailyLimit = true;
    receipt = await read(fixture, receipt);
    await fixture.service.stop();
    await first.close();
    const reopened = await createLinoTextStore(path);
    resources.reopened = reopened;
    fixture.service = createVacancyService({
      ...fixture.serviceOptions,
      store: reopened,
    });
    const status = await fixture.service['application-status'](
      identity(receipt)
    );
    assert.deepEqual(status.applicationLimit, receipt.applicationLimit);
    assert.equal(status.active, false);
    assert.equal(fixture.state.opened, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a shared pause cannot release a queued application reservation or reopen its native form',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    let receipt = await fixture.enter();
    fixture.state.fields[1].value = 'Owner draft';
    receipt = await read(fixture, receipt);
    await fixture.service['application-defer'](
      identity(receipt, { confirm: true })
    );
    const entry = (await queue(fixture)).entries[0];
    const previous = await fixture.store.get(
      'secret:jobs-application:jobs:123'
    );
    fixture.state.page.dailyLimit = true;
    receipt = await fixture.service['application-open']({
      ...applicationInput,
      browserSlot: 'second',
    });
    await fixture.service['application-close'](identity(receipt));
    const opens = fixture.state.opened;
    await assert.rejects(
      fixture.service['application-retry']({
        ...identity(entry),
        queueId: entry.id,
        confirm: true,
      }),
      { code: 'jobs-application-limit-wait' }
    );
    assert.equal(fixture.state.opened, opens);
    assert.deepEqual(await fixture.store.get(previous.id), previous);
    assert.equal((await queue(fixture)).entries[0].id, entry.id);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'one refused slot gates every other workspace slot and native entry route',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    let receipt = await fixture.limited();
    const until = receipt.applicationLimit.until;
    await fixture.service['application-close'](identity(receipt));
    fixture.state.page.dailyLimit = false;
    fixture.state.page.submit = null;
    fixture.state.page.scope = false;
    fixture.state.page.questions = false;
    fixture.state.page.fieldIndices = [];
    fixture.state.page.enter = {
      qa: 'vacancy-response-link-top',
      tag: 'BUTTON',
      text: 'Apply',
      href: null,
      disabled: false,
    };
    fixture.state.page.documentKey = 'other-slot-document';
    receipt = await fixture.service['application-open']({
      ...applicationInput,
      browserSlot: 'another',
    });
    assert.equal(
      (await queue(fixture, 'another')).applicationLimit.until,
      until
    );
    assert.equal(receipt.applicationLimit.active, true);
    for (const action of ['enter', 'form']) {
      await assert.rejects(
        fixture.service['application-advance'](
          identity(receipt, { action, confirm: true })
        ),
        { code: 'jobs-application-limit-wait' }
      );
    }
    assert.equal(fixture.state.entered, 1);
    assert.equal(receipt.attempted.enter, false);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'expiry never extends an unchanged failed document; a fresh refusal starts a new pause',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    let receipt = await fixture.limited();
    const until = receipt.applicationLimit.until;
    fixture.clock.value = Date.parse(until);
    receipt = await read(fixture, receipt);
    assert.equal(receipt.applicationLimit.active, false);
    assert.equal(receipt.applicationLimit.until, until);
    assert.equal(receipt.hold, 'daily-limit');
    assert.equal(receipt.state, 'daily-limit');
    fixture.state.page.documentKey = 'fresh-server-document';
    receipt = await read(fixture, receipt);
    assert.equal(receipt.applicationLimit.active, true);
    assert.equal(
      Date.parse(receipt.applicationLimit.until),
      fixture.clock.value + applicationLimitMs
    );
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a second document seen during the same pause cannot restart it on expiry',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    let receipt = await fixture.limited();
    const until = receipt.applicationLimit.until;
    await fixture.service['application-close'](identity(receipt));
    fixture.state.page.documentKey = 'another-refused-document';
    receipt = await fixture.service['application-open']({
      ...applicationInput,
      browserSlot: 'second',
    });
    fixture.clock.value = Date.parse(until) + 1;
    receipt = await read(fixture, receipt);
    assert.equal(receipt.applicationLimit.active, false);
    assert.equal(receipt.applicationLimit.until, until);
  }
);

test(
  'only a visible bound native limit creates a pause and it takes priority over CAPTCHA',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    let receipt = await fixture.enter();
    fixture.state.page.bound = false;
    fixture.state.page.dailyLimit = true;
    receipt = await read(fixture, receipt);
    assert.equal((await queue(fixture)).applicationLimit, null);
    fixture.state.page.bound = true;
    fixture.state.page.dailyLimit = false;
    fixture.state.page.challenge = true;
    receipt = await read(fixture, receipt);
    assert.equal(receipt.state, 'verification');
    assert.equal(receipt.applicationLimit, null);
    fixture.state.page.dailyLimit = true;
    receipt = await read(fixture, receipt);
    assert.equal(receipt.state, 'daily-limit');
    assert.equal(receipt.applicationLimit.active, true);
  }
);

test(
  'a failed second-document observation cannot extend its original pause in the same worker',
  { timeout: 4000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = applicationLimitFixture(t, { store: fault.store });
    let receipt = await fixture.limited();
    const until = receipt.applicationLimit.until;
    await fixture.service['application-close'](identity(receipt));
    fixture.state.page.documentKey = 'second-document-checkpoint-refused';
    fault.state.stage = 'flush';
    fault.state.kind = 'draft';
    fault.state.when = (row) =>
      row.id.startsWith('secret:jobs-application-limit:document:');
    await assert.rejects(
      fixture.service['application-open']({
        ...applicationInput,
        browserSlot: 'second',
      }),
      { code: 'fixture-deferral-save' }
    );
    fixture.clock.value = Date.parse(until);
    receipt = await fixture.service['application-status']({
      ...applicationInput,
      browserSlot: 'second',
    });
    receipt = await read(fixture, receipt);
    assert.equal(receipt.applicationLimit.until, until);
    assert.equal(receipt.applicationLimit.active, false);
    assert.equal(fixture.state.submitted, 0);
  }
);

for (const stage of ['put', 'flush']) {
  test(
    `failed limit ${stage} keeps the native form and an explicitly unsaved RAM pause`,
    { timeout: 4000 },
    async (t) => {
      const fault = deferralStorageFault();
      const fixture = applicationLimitFixture(t, { store: fault.store });
      let receipt = await fixture.enter();
      fault.state.stage = stage;
      fault.state.kind = 'draft';
      fault.state.when = (row) => row.id === applicationLimitId;
      fixture.state.page.dailyLimit = true;
      await assert.rejects(read(fixture, receipt), {
        code: 'fixture-deferral-save',
      });
      assert.equal(await fault.memory.get(applicationLimitId), null);
      const status = await fixture.service['application-status'](
        identity(receipt)
      );
      assert.equal(status.applicationLimit.saved, false);
      assert.equal(status.applicationLimit.active, true);
      assert.equal(fixture.state.closed, 0);
      receipt = await read(fixture, status);
      assert.equal(receipt.applicationLimit.saved, true);
      assert.equal(
        receipt.applicationLimit.until,
        status.applicationLimit.until
      );
      assert.equal(fixture.state.submitted, 0);
    }
  );
}

test(
  'a failed limit checkpoint during opening retains the refused native document until explicit closure',
  { timeout: 4000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = applicationLimitFixture(t, { store: fault.store });
    fixture.state.page.dailyLimit = true;
    fault.state.stage = 'put';
    fault.state.kind = 'draft';
    fault.state.when = (row) => row.id === applicationLimitId;
    await assert.rejects(
      fixture.service['application-open'](applicationInput),
      { code: 'fixture-deferral-save' }
    );
    const status =
      await fixture.service['application-status'](applicationInput);
    assert.equal(status.active, true);
    assert.equal(status.applicationLimit.saved, false);
    assert.equal(fixture.state.closed, 0);
    await fixture.service['application-close'](identity(status));
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'a late native refusal persists the shared pause before any dispatch reservation',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    let receipt = await fixture.enter();
    fixture.state.fields[1].value = 'Reviewed answer';
    receipt = await read(fixture, receipt);
    fixture.state.page.dailyLimit = true;
    await assert.rejects(
      fixture.service['application-advance'](
        identity(receipt, { action: 'submit', confirm: true })
      ),
      { code: 'jobs-application-changed' }
    );
    assert.equal((await queue(fixture)).applicationLimit.active, true);
    receipt = await fixture.service['application-status'](identity(receipt));
    assert.equal(receipt.attempted.submit, false);
    assert.equal(receipt.delivery, 'none');
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'malformed durable pauses and forged public deadlines refuse without browser effects',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    const receipt = await fixture.limited();
    const bad = {
      ...receipt.applicationLimit,
      until: receipt.applicationLimit.observedAt,
    };
    assert.throws(() => applicationLimitData(bad), {
      code: 'jobs-application-limit-journal',
    });
    assert.throws(
      () =>
        applicationResult(
          { ...receipt, applicationLimit: bad },
          identity(receipt)
        ),
      { code: 'jobs-application-unconfirmed' }
    );
    const saved = await fixture.store.get(applicationLimitId);
    await fixture.store.put({ ...saved, version: 99 });
    await assert.rejects(queue(fixture), {
      code: 'jobs-application-limit-journal',
    });
    assert.equal(fixture.state.submitted, 0);
  }
);
