import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { createApplicationApi } from '../src/web/application-api.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `native application HTTP controls retain intent and outcomes over ${type}`,
    { timeout: 10000 },
    async () => {
      const fixture = applicationFixture();
      try {
        await withRoutes(
          async (base) => {
            const query = new URLSearchParams({ url: applicationInput.url });
            const response = await fetch(
              `${base}/api/vacancies/application-status?${query}`,
              { headers: { accept: type } }
            );
            const missing = decodeWire(
              await response.arrayBuffer(),
              response.headers.get('content-type')
            );
            assert.equal(response.status, 200);
            assert.equal(missing.mode, 'hh-application-missing');
            assert.equal(fixture.state.opened, 0);
            const post = async (name, value) => {
              const result = await wirePost(
                base,
                `application-${name}`,
                value,
                type
              );
              assert.equal(result.status, 200, JSON.stringify(result.value));
              return result.value;
            };
            let receipt = await post('open', applicationInput);
            const input = (extra = {}) => ({
              ...applicationInput,
              revision: receipt.revision,
              ...extra,
            });
            assert.equal(receipt.state, 'ready');
            const foreign = await wirePost(
              base,
              'application-advance',
              input({ action: 'enter', confirm: true }),
              type,
              { origin: 'https://foreign.test' }
            );
            assert.equal(foreign.status, 403);
            assert.equal(fixture.state.entered, 0);
            receipt = await post(
              'advance',
              input({ action: 'enter', confirm: true })
            );
            const stale = await wirePost(
              base,
              'application-read',
              { ...applicationInput, revision: 'old' },
              type
            );
            assert.equal(stale.status, 409);
            receipt = await post('prefill', input({ confirm: true }));
            assert.equal(receipt.exact, true);
            receipt = await post(
              'advance',
              input({ action: 'submit', confirm: true })
            );
            assert.equal(receipt.delivery, 'provider-confirmed');
            const replay = await wirePost(
              base,
              'application-advance',
              input({ action: 'submit', confirm: true }),
              type
            );
            assert.equal(replay.status, 409);
            receipt = await post('close', input());
            assert.equal(receipt.state, 'closed');
            assert.equal(fixture.state.submitted, 1);
            assert.equal(fixture.state.closed, 1);
          },
          { store: fixture.store, service: fixture.serviceOptions }
        );
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'application API accepts only bound status and never retries a mutation or uses cached status',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    try {
      const receipt =
        await fixture.service['application-open'](applicationInput);
      const calls = [];
      let raw = receipt;
      const api = createApplicationApi({
        get: async (path) => {
          calls.push(['get', path]);
          return raw;
        },
        report: async (...args) => {
          calls.push(args);
          return raw;
        },
      });
      assert.equal(
        (await api.vacancyApplicationOpen(applicationInput)).state,
        'ready'
      );
      assert.deepEqual(calls[0][2], { network: true, read: false });
      assert.equal(calls.length, 1);
      raw = null;
      await assert.rejects(api.vacancyApplicationOpen(applicationInput), {
        code: 'jobs-application-unconfirmed',
      });
      assert.equal(calls.length, 2);
      raw = { ...receipt, url: 'https://hh.ru/vacancy/999' };
      await assert.rejects(api.vacancyApplicationStatus(applicationInput), {
        code: 'jobs-application-unconfirmed',
      });
      raw = {
        ok: true,
        mode: 'hh-application-missing',
        url: applicationInput.url,
        browserSlot: 'jobs',
        requestId: applicationInput.requestId,
      };
      assert.equal(
        (await api.vacancyApplicationStatus(applicationInput)).mode,
        'hh-application-missing'
      );
      await assert.rejects(api.vacancyApplicationRead(applicationInput), {
        code: 'jobs-application-unconfirmed',
      });
      raw.browserSlot = 'other';
      await assert.rejects(api.vacancyApplicationStatus(applicationInput), {
        code: 'jobs-application-unconfirmed',
      });
    } finally {
      await fixture.close();
    }
  }
);

test(
  'foreground application CLI serializes reviewed actions and closes its browser on EOF',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    let closes = 0;
    fixture.store.close = async () => {
      closes++;
    };
    const output = [];
    const commands = createVacancyCommands({
      ...fixture.serviceOptions,
      openStore: async () => fixture.store,
      async *applicationInput() {
        yield 'enter';
        yield 'prefill';
        yield 'submit';
        yield 'status';
      },
    });
    try {
      const result = await commands['vacancies-application'](
        {
          url: applicationInput.url,
          'request-id': applicationInput.requestId,
          'no-auto-select-resume-language': true,
        },
        (line) => output.push(decodeWire(line))
      );
      assert.equal(result, 0);
      assert.equal(output[0].state, 'ready');
      assert.equal(output.at(-1).delivery, 'provider-confirmed');
      assert.equal(fixture.state.entered, 1);
      assert.equal(fixture.state.submitted, 1);
      assert.equal(fixture.state.closed, 1);
      assert.equal(closes, 1);
      await commands['vacancies-application-status'](
        { url: applicationInput.url, 'request-id': applicationInput.requestId },
        (line) => output.push(decodeWire(line))
      );
      assert.equal(output.at(-1).state, 'delivered');
      assert.equal(fixture.state.opened, 1, 'status never launches a browser');
      await assert.rejects(
        commands['vacancies-application'](
          {
            url: applicationInput.url,
            'request-id': 'invalid',
            'auto-exact': 'yes',
          },
          () => {}
        ),
        /true or false/u
      );
      assert.equal(closes, 2, 'invalid options never open storage');
    } finally {
      await fixture.close();
    }
  }
);
