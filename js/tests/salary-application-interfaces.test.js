import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  salaryApplicationFixture,
  applicationSalary as salary,
} from '../../experiments/issue-56/application-salary-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import {
  withApplicationRouteFixture,
  successfulApplicationFixtureCommand,
} from './helpers/application-controls.mjs';
import { LINO_TEXT, LINO_BINARY, encodeWire } from '../src/transport/lino.js';
import {
  ApplicationSalarySettings,
  ApplicationSalaryReceipt,
} from '../src/web/application-salary-view.js';
import { discoveredSalarySettings } from '../src/web/application-batch-view.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { applicationSettings } from '../src/jobs/application-options.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `salary admission retains frozen targets and explicit floor through ${type}`,
    { timeout: 6000 },
    async (t) => {
      const f = await salaryApplicationFixture(t, 'от 400000 ₽');
      await withApplicationRouteFixture(f, type, async (api) => {
        const selected = globalThis.structuredClone(salary);
        let receipt = await api.vacancyApplicationOpen({
          ...applicationInput,
          salary: selected,
          salaryFloorRub: 400000,
          salaryLadder: true,
        });
        assert.equal(receipt.salaryAdmission.action, 'apply');
        assert.equal(receipt.salaryAdmission.floorRub, 400000);
        selected.currencies[0].net = 1;
        receipt = await api.vacancyApplicationStatus(applicationInput);
        assert.equal(receipt.salary.currencies[0].net, 450000);
        assert.equal(receipt.salaryFloorRub, 400000);
        assert.equal(receipt.salaryLadder, true);
        assert.equal(f.state.entered, 0);
      });
    }
  );
}

test(
  'foreground CLI forwards salary policy and floor without entering or sending',
  { timeout: 6000 },
  async (t) => {
    const f = await salaryApplicationFixture(t);
    const output = await successfulApplicationFixtureCommand(
      f,
      async function* () {
        yield 'quit';
      },
      {
        salary: encodeWire(salary),
        'salary-floor-rub': '400000',
        'no-salary-ladder': 'true',
        'test-mode': 'true',
      }
    );
    assert.equal(output[0].salaryLadder, false);
    assert.equal(output[0].salaryFloorRub, 400000);
    assert.equal(output[0].salaryAdmission, null);
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.submitted, 0);
  }
);

test('discovery handoff carries current targets and tier without inventing a floor for disabled ladders', () => {
  const discovery = {
    phase: 'completed',
    salaryTier: 1,
    options: { salaryConfig: salary, search: { resume: 'owner_cv' } },
  };
  const settings = discoveredSalarySettings({ receipt: { discovery } });
  assert.equal(settings.salaryFloorRub, 400000);
  assert.equal(settings.salary, salary);
  assert.equal(
    applicationSettings({ ...applicationInput, ...settings }).salaryFloorRub,
    400000
  );
  discovery.options.salaryLadder = false;
  const disabled = discoveredSalarySettings({ receipt: { discovery } });
  assert.equal(disabled.salaryLadder, false);
  assert.equal(disabled.salaryFloorRub, undefined);
  assert.equal(
    applicationSettings({ ...applicationInput, ...disabled }).salaryLadder,
    false
  );
  discovery.phase = 'review';
  assert.deepEqual(discoveredSalarySettings({ receipt: { discovery } }), {});
});

test('shared salary settings and held receipts are translated in all four locales', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const t = (key, values) => translate(locale, key, values);
    const markup = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { t } },
        React.createElement(React.Fragment, null, [
          React.createElement(ApplicationSalarySettings, {
            key: 'settings',
            options: {},
            setOptions: () => {},
          }),
          React.createElement(ApplicationSalaryReceipt, {
            key: 'receipt',
            receipt: {
              salaryAdmission: {
                action: 'defer',
                reason: 'below-current-tier',
                floorRub: 450000,
              },
            },
          }),
        ])
      )
    );
    assert(markup.includes('data-application-option="salaryLadder"'));
    assert(markup.includes('data-application-option="salaryFloorRub"'));
    assert(markup.includes('data-application-option="formUrl"'));
    assert(markup.includes('data-application-salary="defer"'));
    assert(!markup.includes('application.salary'));
    for (const suffix of [
      'salaryPolicy',
      'salaryFloor',
      'directForm',
      'salary.below-current-tier',
      'salary.rates-stale',
    ]) {
      const key = `application.${suffix}`;
      assert.notEqual(t(key), key);
      if (locale !== 'en') {
        assert.notEqual(t(key), translate('en', key));
      }
    }
  }
});
