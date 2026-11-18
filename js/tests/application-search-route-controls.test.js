import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applicationSearchRouteFixture,
  originalApplicationSearch,
} from '../../experiments/issue-56/application-search-route-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import {
  applicationBatchFixture,
  batchInput,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  withApplicationRouteFixture,
  closedApplicationFixtureCommand,
  assertApplicationPanelLocales,
  assertApplicationTranslation,
} from './helpers/application-controls.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationBatchResult } from '../src/jobs/application-batch-data.js';
import { applicationSettings } from '../src/jobs/application-options.js';
import * as configuration from '../src/cli/application-configuration.js';
import { discoveredApplicationSettings } from '../src/web/application-batch-view.js';
import { hhSearchUrl } from '../src/jobs/options.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `search route is frozen and validated through ${type}`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationSearchRouteFixture(t);
      await fixture.service.stop();
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const input = {
          ...applicationInput,
          applyFromVacancyPage: false,
          applicationSearchUrl: originalApplicationSearch,
          recover: true,
        };
        const receipt = await api.vacancyApplicationOpen(input);
        assert.equal(receipt.applyFromVacancyPage, false);
        assert.equal(receipt.applicationSearchUrl, originalApplicationSearch);
        for (const change of [
          { applyFromVacancyPage: true },
          { applyFromVacancyPage: 'false' },
          { applicationSearchUrl: 'https://evil.test/search/vacancy' },
          { applicationSearchUrl: 'https://hh.ru/search/vacancy' },
        ]) {
          assert.throws(() =>
            applicationResult({ ...receipt, ...change }, input)
          );
        }
        await api.vacancyApplicationClose({
          ...input,
          revision: receipt.revision,
        });
        const status = await api.vacancyApplicationStatus(input);
        assert.equal(status.applyFromVacancyPage, false);
        assert.deepEqual(fixture.state.routes, []);
      });
    }
  );

  test(
    `batch search route stays frozen through ${type} and Stop`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationBatchFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const input = {
          ...batchInput,
          confirmations: ['send'],
          applyFromVacancyPage: false,
          applicationSearchUrl: originalApplicationSearch,
        };
        const receipt = await api.vacancyApplicationBatchStart(input);
        assert.equal(receipt.batch.settings.applyFromVacancyPage, false);
        assert.equal(
          receipt.batch.settings.applicationSearchUrl,
          originalApplicationSearch
        );
        assert.throws(() =>
          applicationBatchResult(receipt, {
            ...input,
            applyFromVacancyPage: true,
          })
        );
        assert.throws(() =>
          applicationBatchResult(receipt, {
            ...input,
            applicationSearchUrl: 'https://hh.ru/search/vacancy',
          })
        );
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(stopped.batch.settings.applyFromVacancyPage, false);
        assert.equal(fixture.state.submitted, 0);
      });
    }
  );
}

test(
  'route CLI follows explicit, environment, selected/current file and default precedence',
  { timeout: 5000 },
  async (t) => {
    assert.equal(
      typeof configuration.applicationRouteConfiguration,
      'function'
    );
    const cwd = await mkdtemp(join(tmpdir(), 'application-route-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const resolve = (args = {}, env = {}) =>
      configuration.applicationRouteConfiguration(args, { cwd, env });
    assert.equal(await resolve(), true);
    await writeFile(join(cwd, '.lenv'), 'APPLY_FROM_VACANCY_PAGE: false\n');
    assert.equal(await resolve(), false);
    await writeFile(join(cwd, 'selected.lenv'), 'applyFromVacancyPage: true\n');
    assert.equal(await resolve({ configuration: 'selected.lenv' }), true);
    assert.equal(
      await resolve(
        { configuration: 'selected.lenv' },
        { APPLY_FROM_VACANCY_PAGE: 'false' }
      ),
      false
    );
    for (const [args, expected] of [
      [{ 'no-apply-from-vacancy-page': true }, false],
      [{ 'no-apply-from-vacancy-page': 'false' }, true],
      [{ 'apply-from-vacancy-page': 'false' }, false],
    ]) {
      assert.equal(
        await resolve(args, { APPLY_FROM_VACANCY_PAGE: 'invalid-unused' }),
        expected
      );
    }
    await assert.rejects(
      resolve({
        'no-apply-from-vacancy-page': true,
        'apply-from-vacancy-page': false,
      })
    );
    await assert.rejects(resolve({ 'apply-from-vacancy-page': 'invalid' }));
    await assert.rejects(resolve({}, { APPLY_FROM_VACANCY_PAGE: 'invalid' }));
  }
);

test(
  'foreground CLI freezes the return route and original search without navigation on quit',
  { timeout: 5000 },
  async (t) => {
    const receipt = await closedApplicationFixtureCommand(t, {
      'no-apply-from-vacancy-page': true,
      'application-search-url': originalApplicationSearch,
    });
    assert.equal(receipt.applyFromVacancyPage, false);
    assert.equal(receipt.applicationSearchUrl, originalApplicationSearch);
  }
);

test('route options reject malformed flags and foreign, credentialed or ambiguous search URLs', () => {
  const credentialed = new URL('https://hh.ru/search/vacancy');
  credentialed.username = 'fixture-owner';
  credentialed.password = 'fixture-value';
  for (const value of [null, 'false', 0]) {
    assert.throws(() =>
      applicationSettings({ ...applicationInput, applyFromVacancyPage: value })
    );
  }
  for (const value of [
    null,
    '',
    'https://evil.test/search/vacancy',
    'https://hh.ru/vacancy/123',
    credentialed.href,
    'https://hh.ru/search/vacancy#fragment',
    'https://hh.ru/search/vacancy?page=0&page=1',
    'https://hh.ru/search/vacancy?token=private',
  ]) {
    assert.throws(() =>
      applicationSettings({ ...applicationInput, applicationSearchUrl: value })
    );
  }
});

test('four locales expose both routes and the original search override', () => {
  assertApplicationPanelLocales(undefined, [], (markup, locale) => {
    assert(markup.includes('data-application-option="applyFromVacancyPage"'));
    assert(markup.includes('data-application-option="applicationSearchUrl"'));
    for (const key of [
      'applyFromVacancyPage',
      'routeHint',
      'applicationSearchUrl',
      'routeVacancy',
      'routeSearch',
    ]) {
      assertApplicationTranslation(locale, key);
    }
  });
});

test('completed discovery hands its frozen filters to the application return route', () => {
  const discovery = {
    phase: 'running',
    options: { search: { query: 'Python', page: 2, region: '1' } },
  };
  const state = { receipt: { discovery } };
  assert.deepEqual(discoveredApplicationSettings(state), {});
  discovery.phase = 'completed';
  assert.equal(
    discoveredApplicationSettings(state).applicationSearchUrl,
    hhSearchUrl(discovery.options.search)
  );
});
