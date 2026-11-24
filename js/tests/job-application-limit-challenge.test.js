import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitChallengeFixture } from '../../experiments/issue-56/application-limit-challenge-fixture.mjs';
import { deferralStorageFault } from '../../experiments/issue-56/application-deferral-fixture.mjs';

const retained = (fixture) => {
  assert.equal(fixture.capture.closes, 0);
  assert.equal(fixture.state.page.challenge, true);
  assert.equal(fixture.state.submitted, 0);
  assert.deepEqual(fixture.state.writes, []);
};

test(
  'daily-limit close follows acknowledged actual draft, private answers and Q&A; remount retains deadline',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLimitChallengeFixture(t);
    fixture.capture.beforeClose = async () => {
      const rows = await fixture.store.query();
      assert(
        rows.some(
          (row) =>
            row.id.startsWith('secret:jobs-application:') &&
            row.draft?.fields.some(
              (field) => field.value === 'Owner recent storage work.'
            )
        )
      );
      assert(
        rows.some(
          (row) =>
            row.id.startsWith('secret:jobs-application-answers:') &&
            row.pairs.some((pair) => pair.text === 'Owner recent storage work.')
        )
      );
      assert(rows.some((row) => row.id.startsWith('qa-rule:')));
    };
    let receipt = await fixture.read(fixture.receipt);
    assert(
      receipt.draft,
      'Coexisting CAPTCHA prevented the acknowledged daily-limit draft.'
    );
    assert.equal(fixture.capture.closes, 1);
    const deadline = receipt.applicationLimit.until;
    fixture.state.page.challenge = true;
    fixture.state.page.scope = false;
    fixture.state.page.dailyLimit = false;
    fixture.state.fields[1].value = 'Later owner answer';
    fixture.capture.beforeClose = null;
    receipt = await fixture.read(receipt);
    assert.equal(fixture.capture.closes, 2);
    assert.equal(receipt.applicationLimit.until, deadline);
    assert(
      receipt.draft.fields.some((field) => field.value === 'Later owner answer')
    );
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(fixture.state.writes, []);
    assert.equal(fixture.capture.disposed, 2);
  }
);

for (const kind of ['draft', 'answers', 'learning']) {
  for (const stage of ['put', 'flush']) {
    test(
      `failed ${kind} ${stage} keeps the challenge and native answers`,
      { timeout: 5000 },
      async (t) => {
        const fault = deferralStorageFault();
        const fixture = await applicationLimitChallengeFixture(t, {
          store: fault.store,
        });
        fault.state.kind = kind;
        fault.state.stage = stage;
        if (kind === 'draft') {
          fault.state.when = (row) => Boolean(row.draft);
        }
        await assert.rejects(fixture.read(fixture.receipt), {
          code: 'fixture-deferral-save',
        });
        assert.equal(fault.state.hits, 1);
        retained(fixture);
        assert.equal(
          fixture.state.fields[1].value,
          'Owner recent storage work.'
        );
      }
    );
  }
}

test(
  'a changed actual answer during acknowledged backup refuses close',
  { timeout: 5000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = await applicationLimitChallengeFixture(t, {
      store: fault.store,
    });
    fault.state.hook = (row) => {
      if (row.id.startsWith('secret:jobs-application-answers:')) {
        fixture.state.fields[1].value = 'New owner edit';
      }
    };
    await assert.rejects(fixture.read(fixture.receipt), {
      code: 'jobs-application-changed',
    });
    retained(fixture);
    assert.equal(fixture.state.fields[1].value, 'New owner edit');
  }
);

for (const reason of ['missing-proof', 'foreign', 'paused', 'unobserved']) {
  test(
    `${reason} never closes a native challenge`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationLimitChallengeFixture(t);
      let receipt = fixture.receipt;
      if (reason === 'missing-proof') {
        fixture.capture.valid = false;
      }
      if (reason === 'foreign') {
        fixture.state.page.external = true;
      }
      if (reason === 'paused') {
        receipt = await fixture.service['application-mode']({
          ...fixture.receipt,
          paused: true,
        });
      }
      if (reason === 'unobserved') {
        fixture.state.page.dailyLimit = false;
      }
      await fixture.read(receipt);
      retained(fixture);
    }
  );
}

test(
  'an expired saved pause does not dismiss a remounted gate',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLimitChallengeFixture(t);
    fixture.state.page.challenge = false;
    fixture.state.page.scope = true;
    const receipt = await fixture.read(fixture.receipt);
    fixture.state.page.challenge = true;
    fixture.state.page.scope = false;
    fixture.state.page.dailyLimit = false;
    fixture.clock.value = Date.parse(receipt.applicationLimit.until);
    const expired = await fixture.read(receipt);
    assert.equal(expired.applicationLimit.active, false);
    retained(fixture);
  }
);

test(
  'pause expiry during acknowledged Q&A saving leaves the gate and full draft intact',
  { timeout: 5000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = await applicationLimitChallengeFixture(t, {
      store: fault.store,
    });
    fault.state.hook = (row) => {
      if (row.id.startsWith('qa-rule:')) {
        fixture.clock.value += 2 * 60 * 60 * 1000;
      }
    };
    await assert.rejects(fixture.read(fixture.receipt), {
      code: 'jobs-application-changed',
    });
    retained(fixture);
    assert(
      (await fixture.store.query()).some((row) =>
        row.draft?.fields.some(
          (field) => field.value === 'Owner recent storage work.'
        )
      )
    );
  }
);

for (const stage of ['candidate', 'dismiss']) {
  test(
    `owner changes at ${stage} admission refuse close and dispose the target`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationLimitChallengeFixture(t);
      fixture.capture[stage] = () => {
        fixture.state.fields[1].value = 'Final owner change';
      };
      if (stage === 'candidate') {
        await fixture.read(fixture.receipt);
      } else {
        await assert.rejects(fixture.read(fixture.receipt), {
          code: 'jobs-application-changed',
        });
      }
      retained(fixture);
      assert.equal(fixture.capture.disposed, 1);
    }
  );
}

for (const reason of ['ambiguous', 'too-many', 'evaluation-failure']) {
  test(
    `${reason} close handles are all disposed without dismissal`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationLimitChallengeFixture(t);
      fixture.capture.targets = reason === 'too-many' ? 201 : 2;
      if (reason === 'evaluation-failure') {
        fixture.capture.candidate = (index) => {
          if (index === 1) {
            throw new Error('Finite target refusal');
          }
        };
      }
      if (reason === 'evaluation-failure') {
        await assert.rejects(
          fixture.read(fixture.receipt),
          /Finite target refusal/u
        );
      } else {
        await fixture.read(fixture.receipt);
      }
      retained(fixture);
      assert.equal(fixture.capture.disposed, fixture.capture.targets);
    }
  );
}

for (const reason of ['external-form-reference', 'incomplete', 'unsupported']) {
  test(
    `${reason} capture never closes the native gate`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationLimitChallengeFixture(t);
      fixture.capture.report = (raw) => {
        if (reason === 'external-form-reference') {
          raw.reasons.push(reason);
        }
        if (reason === 'incomplete') {
          raw.navigation.limited = true;
        }
        if (reason === 'unsupported') {
          raw.fields[0].tag = 'div';
        }
        return raw;
      };
      await assert.rejects(fixture.read(fixture.receipt), {
        code:
          reason === 'unsupported'
            ? 'jobs-application-draft'
            : 'jobs-application-changed',
      });
      retained(fixture);
    }
  );
}
