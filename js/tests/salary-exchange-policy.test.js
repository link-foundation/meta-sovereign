import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { normalizeSalary } from '../src/automation/salary-config.js';
import { previewAnswer } from '../src/automation/question-store.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { SALARY_EXCHANGE_ID } from '../src/automation/salary-exchange-state.js';

const now = () => Date.parse('2026-11-09T12:00:00Z');
const exchange = {
  base: 'RUB',
  rates: [{ code: 'USD', rate: 84.9048 }],
  asOf: '2026-11-09',
  source: 'cbr',
  maxAgeDays: 7,
};
const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  exchangeMode: 'cbr',
  currencies: [
    { code: 'USD', keywords: ['USD'], net: 6000, grossMethod: 'personal' },
  ],
  taxes: {
    personal: {
      currency: 'RUB',
      bands: [
        { upTo: 2400000, rate: 0.13 },
        { upTo: 5000000, rate: 0.15 },
        { upTo: null, rate: 0.18 },
      ],
    },
  },
};
const question = 'What salary in USD before taxes do you expect?';
const feed =
  '<ValCurs Date="09.11.2026"><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>84,9048</Value></Valute></ValCurs>';
const seed = (store, snapshot = exchange) =>
  store.put({
    id: SALARY_EXCHANGE_ID,
    exchange: snapshot,
    fetchedAt: new Date(now()).toISOString(),
  });

test('automatic exchange is opt-in and invalid policies are rejected', async () => {
  const { prepareSalaryExchange } =
    await import('../src/automation/salary-exchange-policy.js');
  assert.equal(
    normalizeSalary({ ...salary, exchangeMode: undefined }).exchangeMode,
    'snapshot'
  );
  assert.throws(
    () => normalizeSalary({ ...salary, exchangeMode: 'unknown' }),
    /exchange mode/
  );
  const configured = normalizeSalary({
    ...salary,
    exchangeMode: 'snapshot',
    exchange,
  });
  const prepared = await prepareSalaryExchange(
    createMemoryStore(),
    configured,
    {
      now,
      fetchImpl: () => {
        throw new Error('must not contact feed');
      },
    }
  );
  assert.deepEqual(prepared, { salary: configured });
});

test(
  'parallel automatic plans share a refresh and reuse the dated cache without modifying saved snapshots',
  { timeout: 3000 },
  async () => {
    const { prepareSalaryExchange } =
      await import('../src/automation/salary-exchange-policy.js');
    const store = createMemoryStore();
    let calls = 0;
    let release;
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    const dependencies = {
      now,
      fetchImpl: async () => {
        calls++;
        await wait;
        return new globalThis.Response(feed);
      },
    };
    const first = prepareSalaryExchange(store, salary, dependencies);
    const second = prepareSalaryExchange(store, salary, dependencies);
    release();
    const values = await Promise.all([first, second]);
    assert.equal(calls, 1);
    for (const value of values) {
      assert.deepEqual(value.salary.exchange, exchange);
      assert.equal(value.rateState.fresh, true);
      assert.equal(value.rateState.asOf, exchange.asOf);
    }
    await prepareSalaryExchange(store, salary, dependencies);
    assert.equal(calls, 1);
    assert.equal(salary.exchange, undefined);
  }
);

test(
  'automatic failure preserves stale dates, backs off, retries and never substitutes an unselected manual snapshot',
  { timeout: 3000 },
  async () => {
    const { prepareSalaryExchange } =
      await import('../src/automation/salary-exchange-policy.js');
    const store = createMemoryStore();
    await seed(store, { ...exchange, asOf: '2000-01-01' });
    let calls = 0;
    let time = now();
    let online = false;
    const dependencies = {
      now: () => time,
      fetchImpl: async () => {
        calls++;
        if (!online) {
          throw new Error('fixture offline');
        }
        return new globalThis.Response(feed);
      },
    };
    const configured = {
      ...salary,
      exchange: {
        ...exchange,
        source: 'manual',
        rates: [{ code: 'USD', rate: 1 }],
      },
    };
    const failed = await prepareSalaryExchange(store, configured, dependencies);
    assert.equal(failed.rateState.status, 'stale');
    assert.equal(failed.rateState.warning, 'fetch-failed');
    assert.equal(failed.salary.exchange.asOf, '2000-01-01');
    const blocked = await prepareSalaryExchange(
      store,
      configured,
      dependencies
    );
    assert.equal(blocked.rateState.warning, 'refresh-backoff');
    assert.equal(calls, 1);
    time += 5 * 60000;
    online = true;
    const recovered = await prepareSalaryExchange(
      store,
      configured,
      dependencies
    );
    assert.equal(recovered.rateState.status, 'updated');
    assert.equal(calls, 2);
    assert.deepEqual(recovered.salary.exchange, exchange);
    const empty = await prepareSalaryExchange(createMemoryStore(), configured, {
      now,
      fetchImpl: async () => {
        throw new Error('fixture offline');
      },
    });
    assert.equal(empty.salary.exchange, undefined);
    assert.equal(empty.rateState.status, 'unavailable');
  }
);

test(
  'preview, runner and final delivery validation use the selected cache policy and current clock',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    await seed(store);
    const input = { question, salary, now: now() };
    const preview = await previewAnswer(store, input);
    assert.equal(preview.text, 'From $7 100 gross per month.');
    assert.equal(preview.salaryExchange.status, 'cached');
    const automation = normalizeAutomation({
      id: 'automatic-exchange',
      action: { kind: 'answer-questions', salary },
      conditions: { mutual: false, cooldownDays: 0 },
      pacing: { typing: true },
    });
    await store.put(automation);
    await store.put({
      id: 'msg:hh:1:1',
      source: 'hh',
      chat: '1',
      sender: 'them',
      body: question,
      timestamp: new Date(now()).toISOString(),
    });
    let sent = 0;
    const runner = createAutomationRunner({
      store,
      self: ['me'],
      clock: () => new Date(now()),
      sleep: async () => {
        await seed(store, { ...exchange, rates: [{ code: 'USD', rate: 1 }] });
      },
      send: async () => {
        sent++;
        return { status: 'sent' };
      },
    });
    const plan = await runner.plan(automation, {
      targets: [{ source: 'hh', chat: '1' }],
    });
    assert.equal(plan.drafts[0].text, preview.text);
    assert.equal(plan.drafts[0].answer.salaryExchange.status, 'cached');
    assert.equal(
      (await runner.deliverDraft(automation, plan.drafts[0])).code,
      'answer-review-required'
    );
    assert.equal(sent, 0);
    assert.equal(
      (await store.query((link) => link.id?.startsWith('outbox:'))).length,
      0
    );
    assert.deepEqual(
      (await store.get(automation.id)).action.salary,
      normalizeSalary(salary)
    );
  }
);

test(
  'saved automatic policy works through CLI, offline UI and both Lino APIs',
  { timeout: 15000 },
  async () => {
    const { createAutomationCommands } =
      await import('../src/cli/automation-commands.js');
    const { questionApi } = await import('../src/web/question-api.js');
    const { startServer } = await import('../src/server/index.js');
    const { encodeWire, readWireResponse, LINO_TEXT, LINO_BINARY } =
      await import('../src/transport/lino.js');
    const store = createMemoryStore();
    const today = new Date().toISOString().slice(0, 10);
    await seed(store, { ...exchange, asOf: today });
    const automation = normalizeAutomation({
      id: 'rate-policy',
      action: { kind: 'answer-questions', salary },
    });
    await store.put(automation);
    const output = [];
    const cli = createAutomationCommands({ openStore: async () => store });
    assert.equal(
      await cli.automations(
        {
          _: ['answers', 'plan'],
          automation: 'rate-policy',
          question,
          json: true,
        },
        (line) => output.push(line)
      ),
      0
    );
    assert.equal(
      JSON.parse(output.at(-1)).text,
      'From $7 100 gross per month.'
    );
    const api = questionApi({ store, remote: { report: async () => null } });
    assert.equal(
      (await api.previewAnswer({ question, salary })).salaryExchange.status,
      'cached'
    );
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/plan`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ question, salary }, type),
          }
        );
        assert.equal(response.status, 200);
        const answer = await readWireResponse(response);
        assert.equal(answer.text, 'From $7 100 gross per month.');
        assert.equal(answer.salaryExchange.asOf, today);
        assert.equal(answer.salaryExchange.status, 'cached');
      }
      assert.deepEqual(await store.get(automation.id), automation);
    } finally {
      await server.close();
    }
  }
);
