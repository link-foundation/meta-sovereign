import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationSearchRouteFixture,
  originalApplicationSearch,
} from '../../experiments/issue-56/application-search-route-fixture.mjs';
import { applicationFullFormFixture } from '../../experiments/issue-56/application-fullform-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationSettings } from '../src/jobs/application-options.js';
import { createVacancyService } from '../src/jobs/service.js';

const unsent = (fixture) => {
  assert.equal(fixture.state.entered, 0);
  assert.equal(fixture.state.submitted, 0);
  assert.deepEqual(fixture.state.writes, []);
};

test(
  'search route preserves original filters and reaches full-form review without clicking Apply',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationSearchRouteFixture(t);
    const receipt = await fixture.form();
    assert.equal(receipt.applyFromVacancyPage, false);
    assert.equal(receipt.applicationSearchUrl, originalApplicationSearch);
    assert.equal(receipt.state, 'review');
    assert.deepEqual(fixture.state.routes, [
      originalApplicationSearch,
      'full-form',
    ]);
    assert.deepEqual(receipt.attempted, { enter: false, submit: false });
    assert.equal(receipt.delivery, 'none');
    unsent(fixture);
  }
);

test('default full-form route stays direct', { timeout: 5000 }, async (t) => {
  const fixture = await applicationFullFormFixture(t);
  const receipt = await fixture.form();
  assert.equal(receipt.applyFromVacancyPage, true);
  assert.equal(receipt.applicationSearchUrl, 'https://hh.ru/search/vacancy');
  unsent(fixture);
});

test('omitted route settings preserve legacy signatures', () => {
  const options = applicationSettings(applicationInput, { legacy: true });
  assert(!Object.hasOwn(options, 'applyFromVacancyPage'));
  assert(!Object.hasOwn(options, 'applicationSearchUrl'));
});

for (const [name, change] of [
  ['challenge', { challenge: true }],
  ['daily-limit', { dailyLimit: true }],
  ['external', { external: true }],
  ['delivered', { delivered: true }],
  ['draft', { scope: true }],
  ['questionnaire', { questions: true }],
  ['error', { error: 'generic-error' }],
  ['redirect', { searchBound: false }],
  ['unready search', { searchReady: false }],
]) {
  test(
    `search route refuses ${name} before leaving the search`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationSearchRouteFixture(t);
      fixture.state.searchCheckpoint = async () =>
        Object.assign(fixture.state.page, change);
      await assert.rejects(fixture.form());
      assert.deepEqual(fixture.state.routes, [originalApplicationSearch]);
      const saved = await fixture.store.get(
        fixture.opened.url.replace(
          'https://hh.ru/vacancy/',
          'secret:jobs-application:jobs:'
        )
      );
      assert.deepEqual(saved.attempted, { enter: false, submit: false });
      assert.equal(saved.delivery, 'none');
      unsent(fixture);
    }
  );
}

test(
  'a search field or document changed during admission prevents the second navigation',
  { timeout: 5000 },
  async (t) => {
    for (const key of ['searchKey', 'documentKey']) {
      const fixture = await applicationSearchRouteFixture(t);
      fixture.state.searchCheckpoint = async (guard) => {
        if (guard !== undefined) {
          fixture.state.page[key] = 'owner-changed';
        }
      };
      await assert.rejects(fixture.form(), {
        code: 'jobs-application-changed',
      });
      assert.deepEqual(fixture.state.routes, [originalApplicationSearch]);
      unsent(fixture);
      await fixture.close();
    }
  }
);

test(
  'Stop while reading search drains the owned browser without form navigation or reservation',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationSearchRouteFixture(t);
    let release;
    let reached;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise((resolve) => {
      reached = resolve;
    });
    fixture.state.searchCheckpoint = async () => {
      reached();
      await gate;
    };
    const outcome = fixture.form().then(
      (value) => ({ value }),
      (error) => ({ error })
    );
    await Promise.race([
      entered,
      outcome.then(() => assert.fail('The search checkpoint was skipped')),
    ]);
    const stop = fixture.service.stop();
    release();
    const [result] = await Promise.all([outcome, stop]);
    assert(result.error);
    assert.deepEqual(fixture.state.routes, [originalApplicationSearch]);
    assert.equal(fixture.state.closed, 1);
    unsent(fixture);
  }
);

test(
  'preview is read only and restart status does not repeat a search route',
  { timeout: 5000 },
  async (t) => {
    const preview = await applicationSearchRouteFixture(t, { testMode: true });
    assert.equal((await preview.form()).state, 'test-preview');
    assert.deepEqual(preview.state.routes, []);
    const fixture = await applicationSearchRouteFixture(t);
    await fixture.form();
    await fixture.service.stop();
    const recovered = createVacancyService(fixture.serviceOptions);
    t.after(() => recovered.stop());
    const status = await recovered['application-status'](applicationInput);
    assert.equal(status.applyFromVacancyPage, false);
    assert.equal(status.state, 'interrupted');
    assert.deepEqual(fixture.state.routes, [
      originalApplicationSearch,
      'full-form',
    ]);
    unsent(fixture);
  }
);
