import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationResumeFixture } from '../../experiments/issue-56/application-resume-fixture.mjs';
import { applicationContextFixture } from '../../experiments/issue-56/application-context-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationKey } from '../src/jobs/application-options.js';
import { readApplicationJournal } from '../src/jobs/application-journal.js';
import { applicationResult } from '../src/jobs/application-result.js';

const manual = {
  hash: 'english',
  title: 'Senior Software Engineer',
  source: 'manual',
};

const assertNoResumeReplay = ({ state }) => {
  assert.deepEqual(
    { selections: state.resumeWrites, sends: state.submitted },
    { selections: 1, sends: 0 }
  );
};

test(
  'an acknowledged manual CV choice survives worker restart without replay',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    let result = await fixture.choose(await fixture.menu(fixture.entered));
    assert.deepEqual(result.resumePreference, manual);
    const key = applicationKey(result);
    assert.deepEqual(
      (await fixture.store.get(key.id)).resumePreference,
      manual
    );
    result = await fixture.service['application-read'](identity(result));
    assert.deepEqual(result.resumePreference, manual);
    await fixture.service.stop();
    const recovered = createVacancyService(fixture.serviceOptions);
    t.after(() => recovered.stop());
    result = await recovered['application-status'](identity(result));
    assert.equal(result.active, false);
    assert.deepEqual(result.resumePreference, manual);
    // A fresh DOM token does not turn this saved history into permission to select.
    fixture.state.page.documentKey = 'reopened-native-document';
    result = await recovered['application-open']({
      ...identity(result),
      recover: true,
    });
    assert.deepEqual(result.resumePreference, manual);
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.entered, 1);
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(fixture.state.writes, []);
  }
);

test(
  'contextual no-op confirmation retains its source with no repeated chooser effects',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    let result = await fixture.context(fixture.entered);
    assert.deepEqual(result.resumePreference, { ...manual, source: 'context' });
    const clicks = fixture.state.menuClicks;
    result = await fixture.context(result);
    assert.deepEqual(result.resumePreference, { ...manual, source: 'context' });
    assert.equal(fixture.state.menuClicks, clicks);
    assertNoResumeReplay(fixture);
  }
);

test(
  'a later native CV change is acknowledged across reads and inactive recovery without selecting',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    let result = await fixture.context(fixture.entered);
    fixture.state.page.resumeChooser.title = 'Owner’s other native CV';
    const expected = {
      title: 'Owner’s other native CV',
      hash: null,
      source: 'native',
    };
    result = await fixture.service['application-read'](identity(result));
    assert.deepEqual(result.resumePreference, expected);
    result = await fixture.service['application-read'](identity(result));
    assert.deepEqual(result.resumePreference, expected);
    await fixture.service.stop();
    result = await fixture.service['application-status'](identity(result));
    assert.deepEqual(result.resumePreference, expected);
    assertNoResumeReplay(fixture);
  }
);

test(
  'unsafe native observations never replace acknowledged CV history',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    let result = await fixture.choose(await fixture.menu(fixture.entered));
    const original = globalThis.structuredClone(fixture.state.page);
    for (const alter of [
      (page) => {
        page.bound = false;
      },
      (page) => {
        page.scope = false;
      },
      (page) => {
        page.challenge = true;
      },
      (page) => {
        page.resumeChooser.ambiguous = true;
      },
      (page) => {
        page.resumeChooser.disabled = true;
      },
    ]) {
      fixture.state.page = globalThis.structuredClone(original);
      fixture.state.page.resumeChooser.title = 'Unconfirmed replacement';
      alter(fixture.state.page);
      result = await fixture.service['application-read'](identity(result));
      assert.deepEqual(result.resumePreference, manual);
    }
    assertNoResumeReplay(fixture);
  }
);

test(
  'failed CV-history acknowledgement never reports a saved choice or replays the effect',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    const result = await fixture.menu(fixture.entered);
    const put = fixture.store.put.bind(fixture.store);
    fixture.store.put = async (row) => {
      if (row.resumePreference?.source === 'manual') {
        throw new Error('held preference acknowledgement');
      }
      return put(row);
    };
    await assert.rejects(
      fixture.choose(result),
      /held preference acknowledgement/u
    );
    assert.equal(
      (await fixture.store.get(applicationKey(result).id)).resumePreference,
      null
    );
    fixture.store.put = put;
    await assert.rejects(
      fixture.service['application-read'](identity(result)),
      { code: 'jobs-application-changed' }
    );
    const status = await fixture.service['application-status'](
      identity(result)
    );
    const fresh = await fixture.service['application-read'](identity(status));
    assert.equal(fresh.resumePreference, null);
    assertNoResumeReplay(fixture);
  }
);

test(
  'legacy journals stay readable while corrupt CV history and forged public sources refuse',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    const result = await fixture.choose(await fixture.menu(fixture.entered));
    const key = applicationKey(result);
    const row = await fixture.store.get(key.id);
    const legacy = { ...row };
    delete legacy.resumePreference;
    assert.equal(readApplicationJournal(legacy, key).resumePreference, null);
    for (const preference of [
      { ...manual, source: 'automatic' },
      { ...manual, hash: '../another' },
      { ...manual, title: '' },
      { ...manual, authority: 'send' },
      { ...manual, hash: undefined },
    ]) {
      assert.throws(() =>
        readApplicationJournal({ ...row, resumePreference: preference }, key)
      );
      assert.throws(
        () =>
          applicationResult(
            { ...result, resumePreference: preference },
            identity(result)
          ),
        {
          code: 'jobs-application-unconfirmed',
        }
      );
    }
  }
);

test(
  'a saved CV choice is isolated by vacancy, request and browser slot',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    const result = await fixture.choose(await fixture.menu(fixture.entered));
    for (const extra of [
      { url: 'https://hh.ru/vacancy/456' },
      { browserSlot: 'other' },
    ]) {
      const status = await fixture.service['application-status'](
        identity(result, extra)
      );
      assert.equal(status.mode, 'hh-application-missing');
      assert.equal(status.resumePreference, undefined);
    }
    await assert.rejects(
      fixture.service['application-status'](
        identity(result, { requestId: 'other' })
      ),
      {
        code: 'jobs-application-conflict',
      }
    );
  }
);
