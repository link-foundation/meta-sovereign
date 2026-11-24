import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationSettings } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  applicationInput,
  applicationFixture,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  supervisedApplication,
  supervisedOptions,
} from '../../experiments/issue-56/application-supervised-fixture.mjs';

test(
  'supervised answer and letter steps never combine filling or dispatch',
  { timeout: 4000 },
  async (t) => {
    const fixture = await supervisedApplication(t);
    const answers = await fixture.fill('answers');
    assert.equal(answers.delivery, 'none');
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.page.letter, null);
    assert.deepEqual(fixture.state.writes, ['frame-1:Recent experience']);
    assert.equal(answers.supervised, true);
    assert.equal(answers.autoExact, false);
    const letter = await fixture.fill('cover-letter');
    assert.equal(letter.letter, 'verified');
    assert.equal(letter.exact, true);
    assert.equal(fixture.state.writes.length, 1);
    assert.equal(
      fixture.state.page.letter.value,
      supervisedOptions.coverLetter
    );
    for (const part of [undefined, 'all']) {
      await assert.rejects(fixture.fill(part), {
        code: 'jobs-application-confirmation',
      });
    }
    await assert.rejects(
      fixture.service['application-advance'](
        identity(letter, {
          action: 'submit',
          confirm: true,
          automatic: true,
        })
      ),
      { code: 'jobs-application-exact' }
    );
    assert.equal(fixture.state.submitted, 0);
    const sent = await fixture.service['application-advance'](
      identity(letter, {
        action: 'submit',
        confirm: true,
      })
    );
    assert.equal(sent.delivery, 'provider-confirmed');
    assert.equal(fixture.state.submitted, 1);
  }
);

test(
  'scoped fills outside the preset never invoke combined automatic sending',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    let receipt = await fixture.enter(fixture.service, {
      ...supervisedOptions,
      supervised: false,
    });
    receipt = await fixture.service['application-prefill'](
      identity(receipt, { confirm: true, part: 'cover-letter' })
    );
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(receipt.letter, 'verified');
    receipt = await fixture.service['application-prefill'](
      identity(receipt, { confirm: true, part: 'answers' })
    );
    assert.equal(receipt.exact, true);
    assert.equal(receipt.autoExact, true);
    assert.equal(fixture.state.submitted, 0);
    // Existing combined prefill still explicitly permits exact automatic delivery.
    receipt = await fixture.service['application-prefill'](
      identity(receipt, { confirm: true })
    );
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(fixture.state.submitted, 1);
  }
);

test(
  'separate steps require current confirmation and preserve native owner text',
  { timeout: 4000 },
  async (t) => {
    const fixture = await supervisedApplication(t);
    for (const part of [null, 'letters', false, {}]) {
      await assert.rejects(fixture.fill(part), {
        code: 'jobs-application-input',
      });
    }
    await assert.rejects(fixture.fill('answers', { confirm: false }), {
      code: 'jobs-application-confirmation',
    });
    const old = fixture.receipt;
    fixture.state.fields[1].value = 'Owner current answer';
    fixture.state.fields[1].answer.preserveCurrent = true;
    fixture.state.page.letter = {
      value: 'Owner current letter',
      index: 2,
      disabled: false,
    };
    fixture.receipt = await fixture.service['application-read'](identity(old));
    await assert.rejects(fixture.fill('answers', { revision: old.revision }), {
      code: 'jobs-application-changed',
    });
    await fixture.fill('answers');
    assert.equal(fixture.state.fields[1].value, 'Owner current answer');
    const result = await fixture.fill('cover-letter');
    assert.equal(result.letter, 'owner-conflict');
    assert.equal(fixture.state.page.letter.value, 'Owner current letter');
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'supervised preview retains zero entry, answer, letter and send effects',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const receipt = await fixture.service['application-open']({
      ...applicationInput,
      ...supervisedOptions,
      testMode: true,
    });
    for (const part of ['answers', 'cover-letter']) {
      const result = await fixture.service['application-prefill'](
        identity(receipt, { confirm: true, part })
      );
      assert.equal(result.state, 'test-preview');
      assert.equal(result.supervised, true);
    }
    await fixture.service['application-advance'](
      identity(receipt, { action: 'enter', confirm: true })
    );
    assert.deepEqual(
      [
        fixture.state.entered,
        fixture.state.submitted,
        fixture.state.writes.length,
      ],
      [0, 0, 0]
    );
    assert.equal(fixture.state.page.letter, null);
  }
);

test(
  'supervised intent survives worker restart and caller choices cannot turn automatic sending back on',
  { timeout: 4000 },
  async (t) => {
    const fixture = await supervisedApplication(t);
    await fixture.fill('answers');
    await fixture.service.stop();
    const service = createVacancyService(fixture.serviceOptions);
    t.after(() => service.stop());
    const receipt = await service['application-open']({
      ...applicationInput,
      supervised: false,
      autoExact: true,
      recover: true,
    });
    assert.equal(receipt.supervised, true);
    assert.equal(receipt.autoExact, false);
    assert.equal(receipt.letter, 'not-attached');
    assert.equal(fixture.state.submitted, 0);
    await assert.rejects(
      service['application-prefill'](identity(receipt, { confirm: true })),
      { code: 'jobs-application-confirmation' }
    );
  }
);

test(
  'the optional supervised receipt stays compatible with legacy receipts but refuses contradictory flags',
  { timeout: 4000 },
  async (t) => {
    const fixture = await supervisedApplication(t);
    const legacy = { ...fixture.receipt, autoExact: true };
    delete legacy.supervised;
    assert.equal(applicationResult(legacy, applicationInput), legacy);
    for (const supervised of [null, 'true', 1]) {
      assert.throws(
        () =>
          applicationResult(
            { ...fixture.receipt, supervised },
            applicationInput
          ),
        { code: 'jobs-application-unconfirmed' }
      );
      assert.throws(
        () => applicationSettings({ ...applicationInput, supervised }),
        { code: 'jobs-application-input' }
      );
    }
    assert.throws(
      () =>
        applicationResult(
          { ...fixture.receipt, autoExact: true },
          applicationInput
        ),
      { code: 'jobs-application-unconfirmed' }
    );
    const normal = applicationSettings(applicationInput);
    assert.equal(Object.hasOwn(normal, 'supervised'), false);
    assert.deepEqual(
      applicationSettings({ ...applicationInput, supervised: false }),
      normal
    );
  }
);
