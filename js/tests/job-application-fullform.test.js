import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationFullFormFixture } from '../../experiments/issue-56/application-fullform-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';

test(
  'unconfirmed navigation requires a fresh read without replaying effects',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationFullFormFixture(t);
    fixture.state.navigationFailure = new Error(
      'Synthetic navigation acknowledgement lost'
    );
    await assert.rejects(fixture.form(), fixture.state.navigationFailure);
    assert.equal(fixture.state.navigated, 1);
    await assert.rejects(fixture.form(), { code: 'jobs-application-changed' });
    const fresh = await fixture.service['application-read'](
      identity(fixture.opened)
    );
    assert.equal(fresh.state, 'review');
    assert.deepEqual(fresh.attempted, { enter: false, submit: false });
    assert.equal(fixture.state.navigated, 1);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'confirmed full-form navigation reaches review without entry, filling or sending',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationFullFormFixture(t);
    const receipt = await fixture.form();
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.page.url, fixture.state.page.url);
    assert.deepEqual(receipt.attempted, { enter: false, submit: false });
    assert.equal(receipt.delivery, 'none');
    assert.deepEqual(receipt.vacancy, fixture.opened.vacancy);
    assert.equal(fixture.state.navigated, 1);
    assert.equal(fixture.state.navigationReady, true);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(fixture.state.writes, []);
    await assert.rejects(fixture.form(receipt), {
      code: 'jobs-application-state',
    });
    const saved = await fixture.store.get('secret:jobs-application:jobs:123');
    assert.equal(saved.resumeUrl, receipt.page.url);
    assert.deepEqual(saved.attempted, receipt.attempted);
  }
);

test(
  'full-form navigation refuses missing confirmation, automatic requests and stale revisions',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationFullFormFixture(t);
    for (const extra of [
      { confirm: false },
      { automatic: true },
      { automatic: 'false' },
    ]) {
      await assert.rejects(fixture.form(undefined, extra), {
        code: 'jobs-application-confirmation',
      });
    }
    await assert.rejects(fixture.form(undefined, { revision: 'old' }), {
      code: 'jobs-application-changed',
    });
    assert.equal(fixture.state.navigated, undefined);
    assert.equal(fixture.state.entered, 0);
  }
);

test(
  'preview and paused review preserve zero navigation and dispatch effects',
  { timeout: 5000 },
  async (t) => {
    const preview = await applicationFullFormFixture(t, {
      input: { testMode: true },
    });
    assert.equal((await preview.form()).state, 'test-preview');
    assert.equal(preview.state.navigated, undefined);
    const paused = await applicationFullFormFixture(t);
    const receipt = await paused.service['application-mode'](
      identity(paused.opened, { paused: true })
    );
    await assert.rejects(paused.form(receipt), {
      code: 'jobs-application-state',
    });
    assert.equal(paused.state.navigated, undefined);
  }
);

test(
  'a changed, disabled or questionnaire-bearing native page cannot be navigated away',
  { timeout: 5000 },
  async (t) => {
    for (const change of [
      { documentKey: 'owner-replaced' },
      { enter: { qa: 'vacancy-response-link-top', disabled: true } },
      { questions: true },
    ]) {
      const fixture = await applicationFullFormFixture(t);
      Object.assign(fixture.state.page, change);
      await assert.rejects(fixture.form(), {
        code: 'jobs-application-changed',
      });
      assert.equal(fixture.state.navigated, undefined);
    }
  }
);

test(
  'fresh inspection refuses an owner form and recovers a dropped public response',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationFullFormFixture(t);
    fixture.state.page.questions = true;
    const read = await fixture.service['application-read'](
      identity(fixture.opened)
    );
    await assert.rejects(fixture.form(read), {
      code: 'jobs-application-state',
    });
    fixture.state.page.questions = false;
    const fresh = await fixture.service['application-read'](identity(read));
    await fixture.form(fresh);
    // A dropped public response is recovered by read/status, without another navigation.
    const recovered =
      await fixture.service['application-status'](applicationInput);
    assert.equal(recovered.state, 'review');
    assert.equal(fixture.state.navigated, 1);
    await assert.rejects(fixture.form(fresh), {
      code: 'jobs-application-changed',
    });
  }
);

test(
  'worker restart preserves full-form location and frozen context without entry replay',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationFullFormFixture(t);
    const receipt = await fixture.form();
    await fixture.service.stop();
    const recovered = createVacancyService(fixture.serviceOptions);
    t.after(() => recovered.stop());
    const status = await recovered['application-status'](applicationInput);
    assert.equal(status.active, false);
    assert.equal(status.state, 'interrupted');
    const reopened = await recovered['application-open']({
      ...applicationInput,
      recover: true,
    });
    assert.equal(reopened.state, 'review');
    assert.deepEqual(reopened.vacancy, receipt.vacancy);
    assert.equal(fixture.state.navigated, 1);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);
