import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/index.js';
import { normalizeAutomation } from '../src/automation/automations.js';
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

const question = 'What hourly rate in USD do you expect?';
const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  defaultBasis: 'net',
  monthlyHours: 160,
  currencies: [
    {
      code: 'USD',
      keywords: ['USD', '$'],
      net: 6000,
      gross: 7100,
      hourlyStep: 5,
    },
  ],
};
const definition = {
  id: 'salary',
  action: { kind: 'answer-questions', salary },
  conditions: { mutual: false, cooldownDays: 0 },
  pacing: { typing: true },
};

test(
  'salary approval and targets survive UI, offline preview and Lino CLI save',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const automation = normalizeAutomation(definition);
    assert.deepEqual(
      checkForm(toForm(automation), automation).automation,
      automation
    );
    const dir = await mkdtemp(path.join(os.tmpdir(), 'salary-controls-'));
    const file = path.join(dir, 'salary.lino');
    const cli = createAutomationCommands({ openStore: async () => store });
    const output = [];
    const run = (args) => cli.automations(args, (line) => output.push(line));
    try {
      await writeFile(file, encodeLinoValue(definition));
      assert.equal(await run({ _: ['save', file] }), 0);
      assert.deepEqual(
        (await store.get('automation:salary')).action.salary,
        salary
      );
      assert.equal(
        await run({
          _: ['answers', 'plan'],
          automation: 'salary',
          question,
          json: true,
        }),
        0
      );
      assert.equal(JSON.parse(output.at(-1)).text, 'From $40 net per hour.');
      await writeFile(
        file,
        encodeLinoValue({ question, salary: { ...salary, approved: false } })
      );
      assert.equal(
        await run({ _: ['answers', 'plan'], config: file, json: true }),
        0
      );
      assert.equal(JSON.parse(output.at(-1)).requiresReview, true);
      const api = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      const preview = await api.previewAnswer({ question, salary });
      assert.equal(preview.text, 'From $40 net per hour.');
      assert.equal(preview.requiresReview, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'text and binary Lino APIs retain independent targets and reject invalid changes atomically',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    const call = async (endpoint, input, type) => {
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
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const saved = await call('', { automation: definition }, type);
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.body.action.salary, salary);
        const plan = await call('/answers/plan', { question, salary }, type);
        assert.equal(plan.body.text, 'From $40 net per hour.');
        const invalid = {
          ...definition,
          action: {
            ...definition.action,
            salary: { ...salary, monthlyHours: 0 },
          },
        };
        assert.equal(
          (await call('', { automation: invalid }, type)).status,
          400
        );
        assert.deepEqual(
          (await store.get('automation:salary')).action.salary,
          salary
        );
      }
    } finally {
      await server.close();
    }
  }
);

const changedDuringTyping = async (change) => {
  const store = createMemoryStore();
  const automation = normalizeAutomation(definition);
  await store.put(automation);
  await store.put({
    id: 'msg:hh:1:1',
    source: 'hh',
    chat: '1',
    sender: 'them',
    body: question,
    timestamp: '2026-11-09T10:00:00Z',
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
  assert.equal(plan.drafts[0].text, 'From $40 net per hour.');
  const outcome = await runner.deliverDraft(automation, plan.drafts[0]);
  assert.equal(outcome.code, 'answer-review-required');
  assert.equal(sent, 0);
  assert.deepEqual(
    await store.query((link) => link.id?.startsWith('outbox:')),
    []
  );
};
test(
  'salary target, hours, enablement and approval edits invalidate delivery before queuing',
  { timeout: 10000 },
  async () => {
    for (const change of [
      (value) => ({
        ...value,
        currencies: [{ ...value.currencies[0], net: 8000 }],
      }),
      (value) => ({ ...value, monthlyHours: 100 }),
      (value) => ({ ...value, approved: false }),
      (value) => ({ ...value, enabled: false }),
      () => undefined,
    ]) {
      await changedDuringTyping(change);
    }
  }
);
