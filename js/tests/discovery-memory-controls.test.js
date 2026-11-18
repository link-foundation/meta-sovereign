import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDiscoveryApi } from '../src/web/discovery-api.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { VacancyDiscoveryView } from '../src/web/discovery-view.js';
import { discoveredCollectionSettings } from '../src/web/application-batch-view.js';
import { discoveryOptions } from '../src/jobs/discovery-data.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { translate } from '../src/web/i18n.js';
import {
  discoveryFixture,
  discoveryInput,
} from '../../experiments/issue-56/discovery-fixture.mjs';

const options = { timeout: 5000 };
const input = { ...discoveryInput, collectVacancies: false };
const apiFor = (base, type) =>
  createDiscoveryApi({
    get: async (path) => {
      const response = await fetch(`${base}${path}`, {
        headers: { accept: type },
      });
      assert.equal(response.status, 200);
      return decodeWire(await response.arrayBuffer(), type);
    },
    report: async (path, value) => {
      const receipt = await wirePost(base, path.split('/').at(-1), value, type);
      assert.equal(receipt.status, 200);
      return receipt.value;
    },
  });

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `discovery preserves disabled collection through guarded ${type} and validated recovery`,
    options,
    async (t) => {
      const f = discoveryFixture(t);
      await withRoutes(
        async (base, _calls, { context }) => {
          const api = apiFor(base, type);
          const first = await api.vacancyDiscoveryStart(input);
          assert.equal(first.discovery.options.collectVacancies, false);
          await context.vacancies['discovery-drain']();
          const receipt = await api.vacancyDiscoveryStatus(input);
          assert.equal(receipt.discovery.options.collectVacancies, false);
          assert.equal(
            receipt.discovery.entries[2].decision.field,
            'description'
          );
          assert.deepEqual((await context.vacancies.stored()).entries, []);
          const falseReceipt = globalThis.structuredClone(receipt);
          falseReceipt.discovery.options.collectVacancies = true;
          falseReceipt.discovery.signature = JSON.stringify(
            discoveryOptions(falseReceipt.discovery.options)
          );
          const forged = createDiscoveryApi({
            report: async () => falseReceipt,
          });
          await assert.rejects(forged.vacancyDiscoveryStart(input), {
            code: 'jobs-discovery-unconfirmed',
          });
          assert.equal(
            (await api.vacancyDiscoveryStop(input)).discovery.options
              .collectVacancies,
            false
          );
        },
        { store: f.store, service: f.serviceOptions }
      );
    }
  );
}

for (const value of [true, false]) {
  test(
    `foreground discovery CLI parses --no-collect-vacancies=${value}`,
    options,
    async (t) => {
      const f = discoveryFixture(t);
      const output = [];
      const commands = createVacancyCommands({
        ...f.serviceOptions,
        openStore: async () => f.store,
      });
      const result = await commands['vacancies-discovery-start'](
        {
          query: 'Python',
          resume: 'fixture_cv',
          'request-id': `cli-memory-${value}`,
          'no-collect-vacancies': String(value),
          'max-pages': '1',
        },
        (line) => output.push(decodeWire(line))
      );
      assert.equal(result, 0);
      assert.equal(output.at(-1).discovery.options.collectVacancies, !value);
      assert.equal(
        (await f.store.query((row) => row.id.startsWith('assignment-vacancy:')))
          .length,
        value ? 0 : 1
      );
    }
  );
}
test(
  'invalid CLI collection input is rejected before opening storage',
  options,
  async () => {
    const commands = createVacancyCommands({
      openStore: () => assert.fail('invalid flag must not open storage'),
    });
    await assert.rejects(
      commands['vacancies-discovery-start'](
        { 'no-collect-vacancies': 'sometimes' },
        () => {}
      ),
      /must be a boolean/u
    );
  }
);

test(
  'four-language discovery receipts distinguish read history from saved descriptions and copy the frozen setting',
  options,
  async (t) => {
    const f = discoveryFixture(t);
    await f.start(input);
    const receipt = await f.drain();
    const discovery = { receipt, known: true, busy: false };
    assert.deepEqual(discoveredCollectionSettings(discovery), {
      collectVacancies: false,
    });
    assert.deepEqual(
      discoveredCollectionSettings({
        receipt: { discovery: { ...receipt.discovery, phase: 'running' } },
      }),
      {}
    );
    assert.deepEqual(discoveredCollectionSettings({}), {});
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const t = (key, values) => translate(locale, key, values);
      const markup = renderToStaticMarkup(
        React.createElement(VacancyDiscoveryView, {
          state: { discovery, valid: true, capabilities: { discovery: true } },
          t,
        })
      );
      assert(markup.includes('data-discovery-field="collectVacancies"'));
      assert(markup.includes('data-discovery-collection="memory"'));
      assert(
        !markup.includes(
          t('vacancySelection.cachedAt', {
            date: receipt.discovery.entries[0].capturedAt,
          })
        )
      );
      for (const key of ['collectionHint', 'collectionMemory', 'readAt']) {
        assert.notEqual(t(`discovery.${key}`), `discovery.${key}`);
        if (locale !== 'en') {
          assert.notEqual(
            t(`discovery.${key}`),
            translate('en', `discovery.${key}`)
          );
        }
      }
    }
  }
);
