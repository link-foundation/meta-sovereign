import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDiscoveryApi } from '../src/web/discovery-api.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { VacancyDiscoveryView } from '../src/web/discovery-view.js';
import { ApplicationBatchView } from '../src/web/application-batch-view.js';
import {
  discoveryOptions,
  discoveryResult,
} from '../src/jobs/discovery-data.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { translate } from '../src/web/i18n.js';
import {
  discoveryFixture,
  discoveryInput,
} from '../../experiments/issue-56/discovery-fixture.mjs';
import { applicationBatchFixture } from '../../experiments/issue-56/application-batch-fixture.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { ordinaryCommandNames } from '../src/cli/command-names.js';
import { foregroundVacancyDiscovery } from '../src/cli/discovery-command.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `discovery uses real guarded routes and validated ${type} receipts`,
    { timeout: 5000 },
    async (t) => {
      const f = discoveryFixture(t);
      await withRoutes(
        async (base, _calls, { context }) => {
          const api = createDiscoveryApi({
            get: async (path) => {
              const response = await fetch(`${base}${path}`, {
                headers: { accept: type },
              });
              assert.equal(response.status, 200);
              return decodeWire(
                await response.arrayBuffer(),
                response.headers.get('content-type')
              );
            },
            report: async (path, value, flags) => {
              assert.deepEqual(flags, { network: true, read: false });
              const receipt = await wirePost(
                base,
                path.split('/').at(-1),
                value,
                type
              );
              assert.equal(receipt.status, 200, JSON.stringify(receipt.value));
              return receipt.value;
            },
          });
          assert.equal((await api.vacancyDiscoveryStatus()).discovery, null);
          await api.vacancyDiscoveryStart(discoveryInput);
          await context.vacancies['discovery-drain']();
          const receipt = await api.vacancyDiscoveryStatus();
          assert.equal(receipt.discovery.reason, 'exhausted');
          assert.equal(receipt.discovery.entries.length, 3);
          assert.equal(
            (await api.vacancyDiscoveryStop(discoveryInput)).discovery.phase,
            'completed'
          );
          assert.equal(f.searches.length, 2);
          await assert.rejects(
            api.vacancyDiscoveryStart({ ...discoveryInput, confirm: false })
          );
          const unsafe = await wirePost(
            base,
            'discovery-start',
            { ...discoveryInput, requestId: 'cross-origin' },
            type,
            { origin: 'https://foreign.invalid' }
          );
          assert.equal(unsafe.status, 403);
          assert.equal(f.searches.length, 2);
        },
        { store: f.store, service: f.serviceOptions }
      );
    }
  );
}
test(
  'registered foreground discovery CLI freezes bounded flags and drains before closing its store',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    const output = [];
    let closed = false;
    const commands = createVacancyCommands({
      ...f.serviceOptions,
      openStore: async () => ({
        ...f.store,
        close: async () => {
          closed = true;
          assert(f.searches.every((row) => !row.input.signal.aborted));
        },
      }),
    });
    for (const name of ['start', 'status', 'stop']) {
      assert(ordinaryCommandNames.has(`vacancies-discovery-${name}`));
    }
    const result = await commands['vacancies-discovery-start'](
      {
        query: 'Python',
        resume: 'fixture_cv',
        'request-id': 'cli-discovery',
        'max-pages': '1',
        'max-vacancies': '3',
        'duration-ms': '10000',
        'exclude-text': 'excluded description',
      },
      (line) => output.push(decodeWire(line))
    );
    assert.equal(result, 0);
    assert.equal(output[0].discovery.phase, 'running');
    assert.equal(output.at(-1).discovery.reason, 'page-limit');
    assert.equal(output.at(-1).discovery.options.search.resume, 'fixture_cv');
    assert(closed);
    assert.equal(f.searches.length, 1);
  }
);
test(
  'discovery rejects unbounded options and foreign or malformed public receipts',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    await f.start();
    await f.drain();
    const receipt = await f.status();
    for (const options of [
      { maxPages: 101 },
      { maxVacancies: 1001 },
      { durationMs: 0 },
      { refresh: 'true' },
      { filters: {} },
    ]) {
      assert.throws(() => discoveryOptions({ ...discoveryInput, ...options }));
    }
    for (const input of [
      { browserSlot: 'foreign' },
      { requestId: 'foreign' },
    ]) {
      assert.throws(() => discoveryResult(receipt, input));
    }
    for (const change of [
      { pages: 101 },
      { phase: 'invented' },
      { entries: [...receipt.discovery.entries, receipt.discovery.entries[0]] },
      { signature: 'changed' },
    ]) {
      assert.throws(() =>
        discoveryResult(
          { ...receipt, discovery: { ...receipt.discovery, ...change } },
          {}
        )
      );
    }
  }
);
test(
  'four-language discovery and batch handoff show observed states without starting applications',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    await f.start();
    await f.drain();
    const receipt = await f.status();
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const t = (key, values) => translate(locale, key, values);
      const discovery = { receipt, known: true, busy: false };
      const markup = renderToStaticMarkup(
        React.createElement(VacancyDiscoveryView, {
          state: { discovery, valid: true, capabilities: { discovery: true } },
          t,
        })
      );
      assert(markup.includes('data-discovery-phase="completed"'));
      assert(!/\bdiscovery\.[a-z]/u.test(markup));
      for (const key of [
        'title',
        'start',
        'status',
        'stop',
        'reason.exhausted',
      ]) {
        assert.notEqual(t(`discovery.${key}`), `discovery.${key}`);
        if (locale !== 'en') {
          assert.notEqual(
            t(`discovery.${key}`),
            translate('en', `discovery.${key}`)
          );
        }
      }
      const batch = renderToStaticMarkup(
        React.createElement(ApplicationBatchView, {
          supported: true,
          application: { options: {}, discovery, batch: { known: true } },
          t,
        })
      );
      assert(batch.includes('data-application-batch-action="use-discovery"'));
      assert.match(
        batch,
        /data-application-batch-action="start"[^>]*disabled/u
      );
    }
  }
);

test(
  'a start response must match its frozen requested settings',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    await f.start();
    await f.drain();
    const receipt = await f.status();
    const api = createDiscoveryApi({ report: async () => receipt });
    await assert.rejects(
      api.vacancyDiscoveryStart({ ...discoveryInput, query: 'Other search' }),
      { code: 'jobs-discovery-unconfirmed' }
    );
    const missing = createDiscoveryApi({
      report: async () => ({ ...receipt, discovery: null }),
    });
    await assert.rejects(missing.vacancyDiscoveryStart(discoveryInput), {
      code: 'jobs-discovery-unconfirmed',
    });
  }
);

test(
  'discovery cannot take the read lane while an application batch sleeps',
  { timeout: 5000 },
  async (t) => {
    const f = applicationBatchFixture(t, {
      application: {
        batchWait: (ms, signal) => delay(10000, undefined, { signal }),
      },
    });
    await f.start();
    assert.equal(f.state.opened, 0);
    await assert.rejects(f.service['discovery-start'](discoveryInput), {
      code: 'jobs-busy',
    });
    assert.equal((await f.service['discovery-status']({})).discovery, null);
    assert.equal(f.state.opened, 0);
  }
);

test(
  'foreground discovery signal stops its owned reader and removes both listeners',
  { timeout: 5000 },
  async (t) => {
    const entered = Promise.withResolvers();
    let drained = false;
    const f = discoveryFixture(t, {
      readSearch: async (_url, { signal }) => {
        entered.resolve();
        try {
          await delay(10000, undefined, { signal });
        } finally {
          drained = true;
        }
      },
    });
    const before = ['SIGINT', 'SIGTERM'].map((name) =>
      process.listenerCount(name)
    );
    const pending = foregroundVacancyDiscovery(
      f.service,
      discoveryInput,
      () => {}
    );
    await entered.promise;
    process.emit('SIGINT');
    const result = await pending;
    assert.equal(result.discovery.phase, 'stopped');
    assert(drained);
    assert.deepEqual(
      ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name)),
      before
    );
    assert.equal(f.searches.length, 1);
    assert.equal(f.descriptions.length, 0);
  }
);
