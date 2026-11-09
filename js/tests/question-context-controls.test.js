import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/index.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import {
  saveAnswerRule,
  previewAnswer,
} from '../src/automation/question-store.js';
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
import { hhNegotiationsToLinks, hhSource } from '../src/sources/hh.js';

const question = 'What salary expectations?';
const contexts = [
  {
    key: 'currency',
    default: 'GBP',
    choices: [
      { id: 'GBP', keywords: ['GBP'], profile: { salary: '£4200' } },
      { id: 'USD', keywords: ['USD'], profile: { salary: '$5000' } },
    ],
  },
];
const definition = {
  id: 'contextual',
  action: { kind: 'answer-questions', profile: { city: 'Hanoi' }, contexts },
};
const seed = (store) =>
  saveAnswerRule(store, {
    id: 'salary',
    question,
    answers: [{ text: '{{salary}}', approved: true }],
  });

test(
  'context configuration survives UI edits and Lino CLI save, previews and fresh offline reads',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    await seed(store);
    const automation = normalizeAutomation(definition);
    const form = toForm(automation);
    assert.deepEqual(checkForm(form, automation).automation, automation);
    const changed = checkForm(
      {
        ...form,
        contexts: contexts.map((group) => ({ ...group, default: 'USD' })),
      },
      automation
    ).automation;
    assert.equal(changed.action.contexts[0].default, 'USD');
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'question-context-cli-')
    );
    const file = path.join(directory, 'automation.lino');
    const preview = path.join(directory, 'preview.lino');
    const cli = createAutomationCommands({ openStore: async () => store });
    const output = [];
    const run = (args) => cli.automations(args, (line) => output.push(line));
    try {
      await writeFile(file, encodeLinoValue(definition));
      assert.equal(await run({ _: ['save', file] }), 0);
      assert.deepEqual(
        (await store.get('automation:contextual')).action.contexts,
        contexts
      );
      assert.equal(
        await run({
          _: ['answers', 'plan'],
          automation: 'contextual',
          question,
          json: true,
        }),
        0
      );
      assert.equal(JSON.parse(output.at(-1)).text, '£4200');
      await writeFile(
        preview,
        encodeLinoValue({ question, contexts, vacancy: { pay: 'USD' } })
      );
      assert.equal(
        await run({ _: ['answers', 'plan'], config: preview, json: true }),
        0
      );
      assert.equal(JSON.parse(output.at(-1)).text, '$5000');
      const api = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      assert.equal(
        (
          await api.previewAnswer({
            question,
            ...automation.action,
            recent: ['Paid in USD'],
          })
        ).text,
        '$5000'
      );
      await assert.rejects(
        previewAnswer(store, {
          question,
          ...automation.action,
          recent: new Array(21).fill('USD'),
        }),
        /20 messages/u
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test(
  'text and binary Lino APIs persist contexts and refuse malformed edits without mutation',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    await seed(store);
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    const call = async (method, endpoint, input, type) => {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/automations${endpoint}`,
        {
          method,
          headers: { accept: type, 'content-type': type },
          body: input === undefined ? undefined : encodeWire(input, type),
        }
      );
      return {
        status: response.status,
        body: await readWireResponse(response),
      };
    };
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const saved = await call('PUT', '', { automation: definition }, type);
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.body.action.contexts, contexts);
        const plan = await call(
          'POST',
          '/answers/plan',
          { question, ...saved.body.action, vacancy: { pay: 'USD' } },
          type
        );
        assert.equal(plan.body.text, '$5000');
        assert.equal(plan.body.contexts[0].source, 'vacancy-pay');
        const invalid = {
          ...definition,
          action: {
            ...definition.action,
            contexts: [{ ...contexts[0], default: 'missing' }],
          },
        };
        assert.equal(
          (await call('PUT', '', { automation: invalid }, type)).status,
          400
        );
        assert.deepEqual(
          (await store.get('automation:contextual')).action.contexts,
          contexts
        );
        assert.equal(
          (
            await call(
              'POST',
              '/answers/plan',
              { question, vacancy: { pay: 6000 } },
              type
            )
          ).status,
          400
        );
      }
    } finally {
      await server.close();
    }
  }
);

test('hh attaches only actual bounded vacancy text and excludes HTML attributes and hidden content', async () => {
  const vacancy = {
    id: '12',
    salary: { currency: 'USD' },
    description:
      '<script>RUB</script><p data-currency="GBP">Remote role in USD.</p>',
  };
  const [message] = hhNegotiationsToLinks({
    items: [
      {
        id: '1',
        vacancy,
        messages: [
          { id: '2', text: question, created_at: '2026-11-09T10:00:02Z' },
        ],
      },
    ],
  });
  assert.equal(message.answerContext.pay, 'USD');
  assert.equal(message.answerContext.description.trim(), 'Remote role in USD.');
  assert.equal(message.answerContext.evidence, 'vacancy:hh:12');
  const [archived] = await hhSource.parseArchive({
    negotiations: [{ id: '2', vacancy, text: question }],
  });
  assert.deepEqual(archived.answerContext, message.answerContext);
  for (const invalid of [
    undefined,
    { id: '12' },
    { id: '12', description: 'x'.repeat(60001) },
    { salary: { currency: 'USD' } },
  ]) {
    const [row] = hhNegotiationsToLinks({
      items: [{ id: '1', vacancy: invalid }],
    });
    assert.equal(row.answerContext, undefined);
  }
});
