import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VacancyDiscoveryView } from '../src/web/discovery-view.js';
import { translate } from '../src/web/i18n.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
} from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import {
  discoveryFixture,
  discoveryInput,
} from '../../experiments/issue-56/discovery-fixture.mjs';
import {
  ladderSalary,
  ladderSearch,
} from '../../experiments/issue-56/salary-ladder-fixture.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `salary discovery keeps frozen targets and acknowledged decisions through ${type}`,
    { timeout: 5000 },
    async (t) => {
      const f = discoveryFixture(t, { readSearch: ladderSearch });
      await withRoutes(
        async (base, _calls, { context }) => {
          const started = await wirePost(
            base,
            'discovery-start',
            {
              ...discoveryInput,
              salary: undefined,
              salaryConfig: ladderSalary,
              maxPages: 3,
            },
            type
          );
          assert.equal(started.status, 200);
          await context.vacancies['discovery-drain']();
          const response = await fetch(
            `${base}/api/vacancies/discovery-status`,
            { headers: { accept: type } }
          );
          assert.equal(response.status, 200);
          const { discovery: job } = decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          );
          assert.equal(job.salaryTier, 1);
          assert.equal(job.entries[0].pay.action, 'apply');
          assert.equal(job.entries[1].pay.action, 'exclude');
          assert.equal(job.options.salaryConfig.currencies[0].net, 450000);
          assert.equal(f.searches.length, 3);
          for (const locale of ['en', 'ru', 'hi', 'zh']) {
            const markup = renderToStaticMarkup(
              React.createElement(VacancyDiscoveryView, {
                state: {
                  discovery: { receipt: { discovery: job } },
                  capabilities: { discovery: true },
                },
                t: (key, values) => translate(locale, key, values),
              })
            );
            assert(markup.includes('data-discovery-field="salaryLadder"'));
            assert(!/discovery\.(?:pay|salary)/u.test(markup));
            assert(markup.includes('400000'));
          }
        },
        { store: f.store, service: f.serviceOptions }
      );
    }
  );
}

test(
  'foreground CLI decodes shared salary targets and honors its explicit opt-out',
  { timeout: 5000 },
  async (t) => {
    for (const optOut of [false, true]) {
      const f = discoveryFixture(t, { readSearch: ladderSearch });
      const receipts = [];
      const commands = createVacancyCommands({
        ...f.serviceOptions,
        openStore: async () => f.store,
      });
      const exit = await commands['vacancies-discovery-start'](
        {
          query: 'Python',
          resume: 'fixture_cv',
          'request-id': `cli-ladder-${optOut}`,
          'salary-config': encodeWire(ladderSalary),
          'max-pages': '3',
          'duration-ms': '10000',
          'no-salary-ladder': String(optOut),
        },
        (line) => receipts.push(decodeWire(line))
      );
      assert.equal(exit, 0);
      const job = receipts.at(-1).discovery;
      assert.equal(job.salaryTier, optOut ? undefined : 1);
      assert.equal(f.searches.length, optOut ? 1 : 3);
    }
  }
);
