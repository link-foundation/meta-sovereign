import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitWaitFixture } from '../../experiments/issue-56/application-limit-wait-fixture.mjs';
import { deferralStorageFault } from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationResult } from '../src/jobs/application-result.js';

const begin = async (fixture) =>
  fixture.begin(await fixture.limited(await fixture.answered()), {
    restoreDraft: true,
  });
const expire = (fixture, receipt) =>
  fixture.pulse(Date.parse(receipt.limitWait.until));
const noDispatch = (fixture) => assert.equal(fixture.state.submitted, 0);

test(
  'confirmed wait restoration preserves later answers and letters exactly once without sending',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    let receipt = await begin(fixture);
    assert.equal(
      receipt.limitWait.restoreDraft,
      true,
      'Confirmed expiry restoration is missing.'
    );
    fixture.state.fields[1].value = 'Later owner answer for restoration.';
    fixture.state.fields[2].value = 'Later owner letter for restoration.';
    receipt = await expire(fixture, receipt);
    assert.equal(receipt.limitWait.phase, 'review');
    assert.equal(receipt.restoration.state, 'restored');
    assert.deepEqual(
      fixture.state.fields.slice(1).map((field) => field.value),
      [
        'Later owner answer for restoration.',
        'Later owner letter for restoration.',
      ]
    );
    const writes = fixture.state.writes.length;
    const repeated = await fixture.begin(receipt, { restoreDraft: false });
    assert.equal(repeated.limitWait.restoreDraft, true);
    assert.equal(fixture.state.writes.length, writes);
    assert.equal(fixture.state.refreshes, 1);
    assert.equal(fixture.pendingWaits.length, 0);
    applicationResult(receipt, receipt);
    noDispatch(fixture);
  }
);

for (const change of ['owner', 'structure', 'challenge', 'dismissed']) {
  test(
    `expiry restoration preserves ${change} changes without writing`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationLimitWaitFixture(t);
      let receipt = await begin(fixture);
      if (change === 'dismissed') {
        fixture.state.page.dailyLimit = false;
      } else {
        fixture.hooks.refreshed = () => {
          if (change === 'owner') {
            fixture.state.fields[1].value = 'Owner entered a different answer.';
          }
          if (change === 'structure') {
            fixture.state.fields[1].label = 'A changed employer question';
          }
          if (change === 'challenge') {
            fixture.state.page.challenge = true;
          }
        };
      }
      receipt = await expire(fixture, receipt);
      assert.equal(
        receipt.limitWait.phase,
        change === 'dismissed' ? 'review' : 'refused'
      );
      assert.equal(fixture.state.writes.length, 0);
      assert.equal(
        fixture.state.fields[1].value,
        change === 'owner'
          ? 'Owner entered a different answer.'
          : change === 'dismissed'
            ? 'Owner recent storage work.'
            : ''
      );
      noDispatch(fixture);
    }
  );
}

for (const change of ['put', 'flush', 'policy', 'stop']) {
  test(
    `restoration acknowledgement ${change} refuses native writes`,
    { timeout: 5000 },
    async (t) => {
      const fault = deferralStorageFault();
      const fixture = applicationLimitWaitFixture(t, { store: fault.store });
      let receipt = await begin(fixture);
      let stopping;
      if (['put', 'flush'].includes(change)) {
        Object.assign(fault.state, {
          stage: change,
          kind: 'draft',
          when: (row) => row.restoration?.state === 'restoring',
        });
      } else {
        fault.state.hook = async (row) => {
          if (row.restoration?.state === 'restoring') {
            fault.state.hook = null;
            if (change === 'policy') {
              await fixture.service['application-signal-mode'](
                identity(receipt, { noQuestionnaires: true })
              );
            } else {
              stopping = fixture.stopWait(receipt);
            }
          }
        };
      }
      receipt = await expire(fixture, receipt);
      await stopping;
      assert.equal(
        receipt.limitWait.phase,
        change === 'stop' ? 'stopped' : 'refused'
      );
      assert.equal(fixture.state.writes.length, 0);
      assert.equal(fixture.state.fields[1].value, '');
      noDispatch(fixture);
    }
  );
}

test(
  'restoration policy rejects malformed consent and cannot be escalated by repeating a wait ID',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    let receipt = await fixture.limited(await fixture.answered());
    await assert.rejects(fixture.begin(receipt, { restoreDraft: 'yes' }), {
      code: 'jobs-application-input',
    });
    receipt = await fixture.begin(receipt);
    receipt = await fixture.begin(receipt, { restoreDraft: true });
    assert.equal(receipt.limitWait.restoreDraft, false);
    receipt = await expire(fixture, receipt);
    assert.equal(receipt.restoration, null);
    assert.equal(fixture.state.fields[1].value, '');
    assert.throws(() =>
      applicationResult(
        {
          ...receipt,
          limitWait: { ...receipt.limitWait, restoreDraft: 'yes' },
        },
        receipt
      )
    );
    noDispatch(fixture);
  }
);
