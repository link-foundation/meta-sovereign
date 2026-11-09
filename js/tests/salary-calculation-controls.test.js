import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/index.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { normalizeSalary } from '../src/automation/salary-config.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { checkForm, toForm } from '../src/web/automations-model.js';
import { startServer } from '../src/server/index.js';
import {
  encodeWire,
  encodeLinoValue,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const question = 'What salary in USD before taxes do you expect?';
const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  currencies: [
    { code: 'USD', keywords: ['USD', '$'], net: 6000, grossMethod: 'personal' },
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
  exchange: {
    base: 'RUB',
    rates: { USD: 84.9048 },
    asOf: new Date().toISOString().slice(0, 10),
    source: 'manual',
    maxAgeDays: 7,
  },
};
const definition = {
  id: 'calculated-salary',
  action: { kind: 'answer-questions', salary },
  conditions: { mutual: false, cooldownDays: 0 },
  pacing: { typing: true },
};

test(
  'calculated salary round trips through saved UI, offline preview, CLI and both Lino APIs',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    const automation = normalizeAutomation(definition);
    assert.deepEqual(
      checkForm(toForm(automation), automation).automation,
      automation
    );
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'salary-calculation-')
    );
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    try {
      const file = path.join(directory, 'salary.lino');
      await writeFile(file, encodeLinoValue(definition));
      const cli = createAutomationCommands({ openStore: async () => store });
      const output = [];
      const run = (args) => cli.automations(args, (line) => output.push(line));
      assert.equal(await run({ _: ['save', file] }), 0);
      assert.deepEqual(
        (await store.get('automation:calculated-salary')).action.salary,
        normalizeSalary(salary)
      );
      assert.equal(
        await run({
          _: ['answers', 'plan'],
          automation: 'calculated-salary',
          question,
          json: true,
        }),
        0
      );
      assert.equal(
        JSON.parse(output.at(-1)).text,
        'From $7 100 gross per month.'
      );
      const api = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      assert.equal(
        (await api.previewAnswer({ question, salary })).text,
        'From $7 100 gross per month.'
      );
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const call = async (endpoint, input) => {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/automations${endpoint}`,
            {
              method: endpoint ? 'POST' : 'PUT',
              headers: { accept: type, 'content-type': type },
              body: encodeWire(input, type),
            }
          );
          return {
            status: response.status,
            body: await readWireResponse(response),
          };
        };
        const saved = await call('', { automation: definition });
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.body.action.salary, normalizeSalary(salary));
        const plan = await call('/answers/plan', { question, salary });
        assert.equal(plan.body.text, 'From $7 100 gross per month.');
        assert.deepEqual(
          plan.body.salary.calculation.rates,
          [0.13, 0.15, 0.18]
        );
        const invalid = {
          ...definition,
          action: {
            ...definition.action,
            salary: {
              ...salary,
              taxes: { personal: { currency: 'RUB', bands: [] } },
            },
          },
        };
        assert.equal((await call('', { automation: invalid })).status, 400);
        assert.deepEqual(
          (await store.get('automation:calculated-salary')).action.salary,
          normalizeSalary(salary)
        );
      }
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test(
  'tax, FX, method and rounding edits during typing stop delivery before any outbox claim',
  { timeout: 10000 },
  async () => {
    for (const change of [
      (value) => ({
        ...value,
        taxes: {
          personal: { currency: 'RUB', bands: [{ upTo: null, rate: 0 }] },
        },
      }),
      (value) => ({
        ...value,
        exchange: { ...value.exchange, rates: { USD: 1 } },
      }),
      (value) => ({ ...value, exchange: undefined }),
      (value) => ({
        ...value,
        exchange: { ...value.exchange, asOf: '2000-01-01' },
      }),
      (value) => ({
        ...value,
        currencies: [{ ...value.currencies[0], grossMethod: 'explicit' }],
      }),
      (value) => ({
        ...value,
        currencies: [{ ...value.currencies[0], grossStep: 1000 }],
      }),
    ]) {
      const store = createMemoryStore();
      const automation = normalizeAutomation(definition);
      await store.put(automation);
      await store.put({
        id: 'msg:hh:1:1',
        source: 'hh',
        chat: '1',
        sender: 'them',
        body: question,
        timestamp: new Date().toISOString(),
      });
      let sent = 0;
      const runner = createAutomationRunner({
        store,
        self: ['me'],
        sleep: async () => {
          await store.put({
            ...automation,
            action: { ...automation.action, salary: change(salary) },
          });
        },
        send: async () => {
          sent++;
          return { status: 'sent' };
        },
      });
      const plan = await runner.plan(automation, {
        targets: [{ source: 'hh', chat: '1' }],
      });
      assert.equal(plan.drafts[0].text, 'From $7 100 gross per month.');
      assert.equal(
        (await runner.deliverDraft(automation, plan.drafts[0])).code,
        'answer-review-required'
      );
      assert.equal(sent, 0);
      assert.deepEqual(
        await store.query((link) => link.id?.startsWith('outbox:')),
        []
      );
    }
  }
);
