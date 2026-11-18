import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { deferralStorageFault } from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationLimitRejectionFixture } from '../../experiments/issue-56/application-limit-rejection-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';

const faultyFixture = (t) => {
  const fault = deferralStorageFault();
  return {
    fault,
    fixture: applicationLimitRejectionFixture(t, { store: fault.store }),
  };
};
const assertReserved = (fixture, receipt) => {
  assert.equal(receipt.attempted.submit, true);
  assert.equal(receipt.dailyRejection, 'recorded');
  assert.equal(fixture.state.writes.length, 0);
  assert.equal(fixture.state.submitted, 1);
};

test(
  'acknowledged native daily rejection permits consented refresh and restoration, with a separate later Send',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    let receipt = await fixture.rejected();
    assert.equal(receipt.state, 'daily-limit');
    assert.equal(receipt.attempted.submit, true);
    assert.equal(receipt.delivery, 'unknown');
    assert.equal(fixture.state.submitted, 1);
    assert.equal(receipt.draft.fields[0].value, 'Owner recent storage work.');
    receipt = await fixture.begin(receipt, { restoreDraft: true });
    const until = receipt.limitWait.until;
    receipt = await fixture.pulse(Date.parse(until));
    assert.equal(receipt.limitWait.phase, 'review');
    assert.equal(receipt.restoration.state, 'restored');
    assert.equal(receipt.delivery, 'none');
    assert.equal(receipt.attempted.submit, false);
    assert.equal(
      fixture.state.submitted,
      1,
      'Waiting/restoration must not send.'
    );
    assert.equal(fixture.state.fields[1].value, 'Owner recent storage work.');
    assert.equal(fixture.state.fields[2].value, 'Owner edited cover letter.');
    await assert.rejects(
      fixture.service['application-advance'](
        identity(receipt, { action: 'submit', confirm: false })
      ),
      { code: 'jobs-application-confirmation' }
    );
    fixture.hooks.rejectSend = false;
    receipt = await fixture.reject(receipt);
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(fixture.state.submitted, 2);
    const rejections = (await fixture.store.query()).filter(
      (row) => row.reason === 'daily-limit'
    );
    assert.equal(rejections.length, 1);
    assert.equal(rejections[0].attempted.submit, true);
    assert.equal(rejections[0].delivery, 'unknown');
  }
);

for (const restoreDraft of [false, true]) {
  test(
    `later edits remain recoverable with restoration consent now=${restoreDraft}`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationLimitRejectionFixture(t);
      let receipt = await fixture.waiting(restoreDraft);
      fixture.state.fields[1].value = 'Later answer after the actual refusal.';
      await fixture.pulse();
      receipt = await fixture.status(receipt);
      receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
      if (!restoreDraft) {
        assert.equal(receipt.attempted.submit, true);
        assert.equal(receipt.delivery, 'unknown');
        assert.equal(receipt.dailyRejection, 'recorded');
        receipt = await fixture.service['application-restore'](
          identity(receipt, { confirm: true })
        );
      }
      assert.equal(receipt.attempted.submit, false);
      assert.equal(receipt.dailyRejection, 'released');
      assert.equal(receipt.restoration.state, 'restored');
      assert.equal(
        fixture.state.fields[1].value,
        'Later answer after the actual refusal.'
      );
      assert.equal(fixture.state.submitted, 1);
    }
  );
}

for (const unknown of [
  'lost-reply',
  'changed-document',
  'manual-old-marker',
  'later-unrelated-marker',
]) {
  test(
    `a daily marker cannot release ${unknown} delivery`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationLimitRejectionFixture(t);
      let receipt = await fixture.answered();
      if (unknown === 'lost-reply') {
        fixture.hooks.loseDispatchReply = true;
        await assert.rejects(
          fixture.reject(receipt),
          /Finite lost dispatch reply/u
        );
      } else if (unknown === 'changed-document') {
        fixture.hooks.rejected = () => {
          fixture.state.page.documentKey = 'unwitnessed-replacement-document';
        };
        await fixture.reject(receipt);
      } else if (unknown === 'later-unrelated-marker') {
        fixture.hooks.deferDailyLimit = true;
        receipt = await fixture.reject(receipt);
        fixture.state.page.dailyLimit = true;
      } else {
        const row = await fixture.store.get(`secret:jobs-application:jobs:123`);
        await fixture.service.stop();
        await fixture.store.put({
          ...row,
          attempted: { ...row.attempted, submit: true },
          delivery: 'unknown',
        });
        fixture.service = createVacancyService(fixture.serviceOptions);
        receipt = await fixture.service['application-open']({
          ...identity(receipt),
          recover: true,
        });
        fixture.state.page.dailyLimit = true;
      }
      receipt = await fixture.read(await fixture.status(receipt));
      assert.equal(receipt.dailyRejection, null);
      assert.equal(receipt.delivery, 'unknown');
      await assert.rejects(fixture.begin(receipt, { restoreDraft: true }), {
        code: 'jobs-application-state',
      });
      assert.equal(fixture.state.refreshes, 0);
      assert.equal(fixture.state.writes.length, 0);
    }
  );
}

for (const field of [
  'requestId',
  'signature',
  'documentKey',
  'reservationRevision',
  'draftId',
  'until',
  'attempted',
  'delivery',
  'missing',
]) {
  test(
    `recovery refuses altered immutable rejection evidence: ${field}`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationLimitRejectionFixture(t);
      const receipt = await fixture.rejected();
      const proof = (await fixture.store.query()).find(
        (row) => row.reason === 'daily-limit'
      );
      assert(proof);
      if (field === 'missing') {
        await fixture.store.delete(proof.id);
      } else {
        proof[field] =
          field === 'attempted'
            ? { enter: false, submit: false }
            : field === 'until'
              ? new Date(Date.parse(proof.until) + 1000).toISOString()
              : 'changed-proof-value';
        await fixture.store.put(proof);
      }
      await assert.rejects(fixture.begin(receipt, { restoreDraft: true }), {
        code: 'jobs-application-limit-rejection',
      });
      const current = await fixture.status(receipt);
      assert.equal(current.attempted.submit, true);
      assert.equal(current.delivery, 'unknown');
      assert.equal(fixture.state.refreshes, 0);
      assert.equal(fixture.state.submitted, 1);
    }
  );
}

for (const stage of ['put', 'flush']) {
  test(
    `failed ${stage} of rejection evidence keeps the form and original reservation`,
    { timeout: 5000 },
    async (t) => {
      const { fault, fixture } = faultyFixture(t);
      let receipt = await fixture.answered();
      Object.assign(fault.state, { stage, kind: 'rejection' });
      await assert.rejects(fixture.reject(receipt), {
        code: 'fixture-deferral-save',
      });
      receipt = await fixture.status(receipt);
      assert.equal(receipt.dailyRejection, null);
      assert.equal(receipt.delivery, 'unknown');
      assert.equal(receipt.attempted.submit, true);
      assert.equal(fixture.state.closed, 0);
      assert.equal(fixture.state.fields[1].value, 'Owner recent storage work.');
      receipt = await fixture.read(receipt);
      assert.equal(receipt.dailyRejection, 'recorded');
      assert.equal(fixture.state.submitted, 1);
    }
  );
  test(
    `failed ${stage} releasing a known rejection rolls back its reservation before restoration`,
    { timeout: 5000 },
    async (t) => {
      const { fault, fixture } = faultyFixture(t);
      let receipt = await fixture.waiting();
      Object.assign(fault.state, {
        stage,
        kind: 'draft',
        when: (row) => row.limitRejection?.state === 'released',
      });
      receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
      assert.equal(fault.state.hits, 1);
      assert.equal(receipt.limitWait.phase, 'refused');
      assert.equal(receipt.delivery, 'unknown');
      assertReserved(fixture, receipt);
    }
  );
}

test(
  'recovery refuses a concurrently changed acknowledged journal digest',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    const receipt = await fixture.rejected();
    const get = fixture.store.get;
    let proofRead = false;
    fixture.store.get = async (id) => {
      const row = await get(id);
      if (id.startsWith('secret:jobs-application-rejection:')) {
        proofRead = true;
      } else if (proofRead && id === 'secret:jobs-application:jobs:123') {
        proofRead = false;
        row.limitRejection.digest = '0'.repeat(64);
        await fixture.store.put(row);
      }
      return row;
    };
    await assert.rejects(fixture.begin(receipt, { restoreDraft: true }), {
      code: 'jobs-application-limit-rejection',
    });
    assertReserved(fixture, await fixture.status(receipt));
    assert.equal(fixture.state.refreshes, 0);
  }
);

test(
  'restart reads recorded rejection without releasing or resuming it; explicit fresh restoration verifies it',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    let receipt = await fixture.rejected();
    const until = receipt.applicationLimit.until;
    receipt = await fixture.restart(receipt, Date.parse(until));
    assert.equal(receipt.state, 'interrupted');
    assert.equal(receipt.dailyRejection, 'recorded');
    assert.equal(receipt.delivery, 'unknown');
    assert.equal(fixture.pendingWaits.length, 0);
    receipt = await fixture.service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.attempted.submit, true);
    await assert.rejects(
      fixture.service['application-restore'](
        identity(receipt, { confirm: false })
      ),
      { code: 'jobs-application-confirmation' }
    );
    receipt = await fixture.service['application-restore'](
      identity(receipt, { confirm: true })
    );
    assert.equal(receipt.dailyRejection, 'released');
    assert.equal(receipt.restoration.state, 'restored');
    assert.equal(fixture.state.submitted, 1);
  }
);

test(
  'recorded rejection cannot bypass the two-hour pause or a newer workspace pause',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    let receipt = await fixture.rejected();
    await assert.rejects(
      fixture.service['application-restore'](
        identity(receipt, { confirm: true })
      ),
      { code: 'jobs-application-limit-wait' }
    );
    receipt = await fixture.begin(await fixture.status(receipt), {
      restoreDraft: true,
    });
    await fixture.extendWorkspacePause('later-other-slot-limit');
    receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
    assert.equal(receipt.limitWait.phase, 'refused');
    assert.equal(receipt.attempted.submit, true);
    assert.equal(receipt.dailyRejection, 'recorded');
    assert.equal(fixture.state.refreshes, 0);
    assert.equal(fixture.state.submitted, 1);
  }
);

test(
  'a new workspace pause refuses explicit restoration before releasing the rejected reservation',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    let receipt = await fixture.rejected();
    const until = receipt.applicationLimit.until;
    await fixture.restart(receipt, Date.parse(until));
    receipt = await fixture.service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    assert.equal(receipt.state, 'review');
    await fixture.extendWorkspacePause('new-workspace-refusal');
    await assert.rejects(
      fixture.service['application-restore'](
        identity(receipt, { confirm: true })
      ),
      { code: 'jobs-application-limit-wait' }
    );
    receipt = await fixture.status(receipt);
    assert.equal(receipt.delivery, 'unknown');
    assertReserved(fixture, receipt);
  }
);

for (const change of ['challenge', 'delivered', 'document', 'mode', 'stop']) {
  test(
    `consented rejection recovery respects later ${change}`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationLimitRejectionFixture(t);
      let receipt = await fixture.waiting();
      if (change === 'challenge') {
        fixture.state.page.challenge = true;
      }
      if (change === 'delivered') {
        fixture.state.page.dailyLimit = false;
        fixture.state.page.delivered = true;
      }
      if (change === 'document') {
        fixture.state.page.documentKey = 'owner-other-document';
      }
      if (change === 'mode') {
        await fixture.service['application-mode'](
          identity(receipt, { paused: true })
        );
      }
      if (change === 'stop') {
        receipt = await fixture.stopWait(receipt);
      } else {
        receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
      }
      assert.equal(fixture.state.refreshes, 0);
      assertReserved(fixture, receipt);
    }
  );
}

test(
  'a failed immediate entry retains its history while a fresh full form can be restored',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    fixture.hooks.rejectAction = 'enter';
    let receipt = await fixture.enter();
    assert.equal(receipt.state, 'daily-limit');
    assert.equal(receipt.dailyRejection, 'recorded');
    assert.equal(receipt.delivery, 'unknown');
    receipt = await fixture.begin(receipt, { restoreDraft: true });
    receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
    assert.equal(receipt.restoration.state, 'restored');
    assert.equal(receipt.dailyRejection, 'released');
    assert.equal(receipt.attempted.enter, true);
    assert.equal(receipt.attempted.submit, false);
    assert.equal(receipt.delivery, 'none');
    assert.equal(fixture.state.entered, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'an owner mode change during proof verification wins before reservation release',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    let receipt = await fixture.waiting();
    const get = fixture.store.get;
    let change = true;
    fixture.store.get = async (id) => {
      if (change && id.startsWith('secret:jobs-application-rejection:')) {
        change = false;
        fixture.service['application-signal-mode']({
          ...identity(receipt),
          noQuestionnaires: false,
        });
      }
      return get(id);
    };
    receipt = await fixture.pulse(Date.parse(receipt.limitWait.until));
    assert.equal(change, false);
    assert.equal(receipt.limitWait.phase, 'refused');
    assertReserved(fixture, receipt);
  }
);
