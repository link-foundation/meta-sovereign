import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitWaitFixture } from '../../experiments/issue-56/application-limit-wait-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { deferralStorageFault } from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationLimitId } from '../src/jobs/application-limit-data.js';

for (const laterPause of [false, true]) {
  test(
    `deadline crossing during backup rechecks the saved pause (newer=${laterPause})`,
    { timeout: 5000 },
    async (t) => {
      let crossDeadline = false;
      let crossed = 0;
      const fixture = applicationLimitWaitFixture(t, {
        application: {
          trace: (event) => {
            if (
              crossDeadline &&
              event.event === 'application-limit-draft-saved'
            ) {
              crossDeadline = false;
              crossed++;
              fixture.clock.value = until;
            }
          },
        },
      });
      let receipt = await fixture.waiting();
      const until = Date.parse(receipt.limitWait.until);
      fixture.state.fields[1].value = 'Latest answer before expiry.';
      if (laterPause) {
        const limit = await fixture.store.get(applicationLimitId);
        await fixture.store.put({
          ...limit,
          observedAt: limit.until,
          until: new Date(until + 2 * 60 * 60 * 1000).toISOString(),
          documentKey: 'newer-pause-from-another-slot',
        });
      }
      crossDeadline = true;
      receipt = await fixture.pulse(until - 1);
      assert.equal(crossed, 1);
      assert.equal(receipt.limitWait.phase, laterPause ? 'refused' : 'review');
      assert.equal(fixture.state.refreshes, laterPause ? 0 : 1);
      assert.equal(
        receipt.draft.fields[0].value,
        'Latest answer before expiry.'
      );
      assert.equal(receipt.limitWait.until, new Date(until).toISOString());
      assert.equal(fixture.state.submitted, 0);
      assert.equal(fixture.pendingWaits.length, 0);
    }
  );
}

test(
  'confirmed daily waiting backs later edits and refreshes exactly once at the original deadline',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    let receipt = await fixture.limited(await fixture.answered());
    assert.equal(
      typeof fixture.service['application-wait'],
      'function',
      'Confirmed daily-limit waiting is missing.'
    );
    const start = identity(receipt, {
      action: 'start',
      waitId: 'finite-limit-wait',
      confirm: true,
    });
    receipt = await fixture.service['application-wait'](start);
    assert.equal(receipt.limitWait.phase, 'waiting');
    const originalDraft = receipt.draft.id;
    const until = receipt.applicationLimit.until;
    fixture.state.fields[1].value = 'Later owner edit while waiting.';
    await fixture.pulse();
    receipt = await fixture.status(receipt);
    assert.notEqual(receipt.draft.id, originalDraft);
    assert.equal(
      receipt.draft.fields[0].value,
      'Later owner edit while waiting.'
    );
    assert.equal(receipt.applicationLimit.until, until);
    assert.equal(fixture.state.refreshes, 0);
    receipt = await fixture.pulse(Date.parse(until));
    assert.equal(receipt.limitWait.phase, 'review');
    assert.equal(fixture.state.refreshes, 1);
    assert.equal(
      receipt.draft.fields[0].value,
      'Later owner edit while waiting.'
    );
    assert.equal(fixture.state.fields[1].value, '');
    assert.equal(fixture.state.submitted, 0);
    receipt = await fixture.service['application-wait'](start);
    assert.equal(fixture.state.refreshes, 1);
    assert.equal(fixture.pendingWaits.length, 0);
    receipt = await fixture.service['application-restore'](
      identity(receipt, { confirm: true })
    );
    assert.equal(receipt.restoration.state, 'restored');
    assert.equal(
      fixture.state.fields[1].value,
      'Later owner edit while waiting.'
    );
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a busy writer after expiry waits a finite second before retrying the same deadline',
  { timeout: 5000 },
  async (t) => {
    let busy = false;
    const fixture = applicationLimitWaitFixture(t, {
      application: {
        run: (operation) =>
          busy
            ? Promise.reject(
                Object.assign(new Error('Synthetic occupied writer'), {
                  code: 'jobs-busy',
                })
              )
            : operation(new AbortController().signal),
      },
    });
    let receipt = await fixture.waiting();
    const until = receipt.limitWait.until;
    busy = true;
    await fixture.pulse(Date.parse(until));
    assert.equal(fixture.pendingWaits[0].ms, 1000);
    assert.equal(fixture.state.refreshes, 0);
    busy = false;
    receipt = await fixture.pulse();
    assert.equal(receipt.limitWait.until, until);
    assert.equal(receipt.limitWait.phase, 'review');
    assert.equal(fixture.state.refreshes, 1);
  }
);

test(
  'waiting releases the workspace writer and Stop drains without closing or extending the limit',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    let receipt = await fixture.waiting();
    assert.equal(
      (await fixture.service['application-queue']({})).applicationLimit.until,
      receipt.limitWait.until
    );
    receipt = await fixture.read(receipt);
    receipt = await fixture.stopWait(receipt);
    assert.equal(receipt.limitWait.phase, 'stopped');
    assert.equal(fixture.pendingWaits.length, 0);
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.refreshes, 0);
    assert.equal(receipt.applicationLimit.active, true);
  }
);

for (const change of [
  'dismissed',
  'navigation',
  'document',
  'challenge',
  'delivered',
  'paused',
  'mode',
]) {
  test(
    `expiry respects owner ${change} without refreshing`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationLimitWaitFixture(t);
      let receipt = await fixture.waiting();
      if (change === 'dismissed') {
        fixture.state.page.dailyLimit = false;
      } else if (change === 'navigation') {
        fixture.state.page.url = 'https://hh.ru/vacancy/456';
        fixture.state.page.bound = false;
      } else if (change === 'document') {
        fixture.state.page.documentKey = 'owner-replaced-document';
      } else if (change === 'challenge') {
        fixture.state.page.challenge = true;
      } else if (change === 'delivered') {
        fixture.state.page.dailyLimit = false;
        fixture.state.page.delivered = true;
      } else {
        receipt = await fixture.service['application-mode'](
          identity(
            receipt,
            change === 'paused' ? { paused: true } : { noQuestionnaires: false }
          )
        );
      }
      receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
      assert.equal(fixture.state.refreshes, 0);
      assert.equal(fixture.state.closed, 0);
      assert.equal(fixture.state.submitted, 0);
      assert.equal(
        receipt.limitWait.phase,
        ['dismissed', 'delivered'].includes(change) ? 'review' : 'refused'
      );
      assert.equal(fixture.pendingWaits.length, 0);
    }
  );
}

for (const stage of ['put', 'flush']) {
  test(
    `failed ${stage} while waiting keeps the latest native values and stops refresh`,
    { timeout: 5000 },
    async (t) => {
      const fault = deferralStorageFault();
      const fixture = applicationLimitWaitFixture(t, { store: fault.store });
      let receipt = await fixture.waiting();
      fixture.state.fields[1].value = 'Unacknowledged latest owner answer.';
      Object.assign(fault.state, { stage, kind: 'draft' });
      receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
      assert.equal(receipt.limitWait.phase, 'refused');
      assert.equal(
        fixture.state.fields[1].value,
        'Unacknowledged latest owner answer.'
      );
      assert.equal(fixture.state.refreshes, 0);
      assert.equal(fixture.state.closed, 0);
    }
  );
}

test(
  'a synchronous native refresh refusal preserves the draft and has no automatic retry',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    let receipt = await fixture.waiting();
    fixture.hooks.refuseRefresh = true;
    receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
    assert.equal(receipt.limitWait.phase, 'refused');
    assert.equal(fixture.state.fields[1].value, 'Owner recent storage work.');
    assert.equal(fixture.state.refreshes, 0);
    assert.equal(fixture.pendingWaits.length, 0);
  }
);

test(
  'expiry refresh retains every unknown delivery reservation and never restores or sends automatically',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    let receipt = await fixture.limited(await fixture.answered());
    const row = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application:')
    );
    await fixture.service.stop();
    row.attempted.submit = true;
    row.delivery = 'unknown';
    await fixture.store.put(row);
    fixture.service = createVacancyService(fixture.serviceOptions);
    receipt = await fixture.service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    fixture.state.fields[1].value = 'Owner retains unknown application.';
    receipt = await fixture.limited(receipt);
    await assert.rejects(fixture.begin(receipt, { restoreDraft: true }), {
      code: 'jobs-application-state',
    });
    receipt = await fixture.status(receipt);
    receipt = await fixture.begin(receipt);
    receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
    assert.equal(receipt.delivery, 'unknown');
    assert.equal(receipt.attempted.submit, true);
    assert.equal(fixture.state.submitted, 0);
    await assert.rejects(
      fixture.service['application-restore'](
        identity(receipt, { confirm: true })
      ),
      { code: 'jobs-application-state' }
    );
  }
);

for (const restoreDraft of [false, true]) {
  test(
    `shutdown drains the wait (restore=${restoreDraft}) and recovery only reads without resuming it`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationLimitWaitFixture(t);
      let receipt = await fixture.begin(
        await fixture.limited(await fixture.answered()),
        { restoreDraft }
      );
      await fixture.service.stop();
      assert.equal(fixture.pendingWaits.length, 0);
      assert.equal(fixture.state.closed, 1);
      fixture.service = createVacancyService(fixture.serviceOptions);
      receipt = await fixture.status(receipt);
      assert.equal(receipt.limitWait, null);
      assert.equal(receipt.state, 'interrupted');
      assert.equal(fixture.state.refreshes, 0);
      assert.equal(fixture.state.writes.length, 0);
      assert.equal(fixture.state.submitted, 0);
      assert.equal(fixture.pendingWaits.length, 0);
    }
  );
}

test(
  'wait admission requires a fresh confirmation and current revision',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    const receipt = await fixture.limited(await fixture.answered());
    await assert.rejects(fixture.begin(receipt, { confirm: false }), {
      code: 'jobs-application-confirmation',
    });
    await assert.rejects(fixture.begin({ ...receipt, revision: 'stale' }), {
      code: 'jobs-application-changed',
    });
    assert.equal(fixture.pendingWaits.length, 0);
  }
);

test(
  'public wait receipts reject malformed and inactive running claims',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    const receipt = await fixture.waiting();
    applicationResult(receipt, receipt);
    for (const patch of [
      { phase: 'sent' },
      { id: '' },
      { until: 'tomorrow' },
      { code: {} },
    ]) {
      assert.throws(() =>
        applicationResult(
          { ...receipt, limitWait: { ...receipt.limitWait, ...patch } },
          receipt
        )
      );
    }
    for (const phase of ['waiting', 'refreshing', 'restoring']) {
      assert.throws(() =>
        applicationResult(
          {
            ...receipt,
            active: false,
            limitWait: { ...receipt.limitWait, phase },
          },
          receipt
        )
      );
    }
  }
);
