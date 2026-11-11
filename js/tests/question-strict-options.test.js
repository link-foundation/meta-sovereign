import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  seedChatModel,
  chatModelMessage,
  chatModelTargets as targets,
  chatModelNow as now,
} from '../../experiments/issue-56/chat-model-fixture.mjs';

const question = 'Do you have distributed systems experience?';
const rule = {
  id: 'qa-rule:strict-experience',
  question,
  answers: [{ text: 'Yes.', approved: true }],
};
const setup = async (extra = {}) => {
  const store = createMemoryStore();
  const env = await seedChatModel(store, { openOnly: true });
  await saveAnswerRule(store, rule);
  await store.put(chatModelMessage(2, question, extra));
  const sent = [];
  const runner = createAutomationRunner({
    store,
    clock: () => now,
    modelRunner: env.runner,
    send: async (draft) => {
      sent.push(draft);
      return { via: 'fixture' };
    },
  });
  return { ...env, store, sent, runner, modelRunner: env.runner };
};
const opts = { targets, test: true };
const waiting = (answer) => {
  assert.equal(answer.text, '');
  assert.equal(answer.complete, false);
  assert.equal(answer.requiresReview, true);
  assert.equal(answer.optionPending, true);
};

test('strict delayed or disabled choices never become saved free-text answers', () => {
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    waiting(
      planAnswer(question, {
        source,
        strictOptions: true,
        options: [],
        rules: [rule],
      })
    );
  }
});

test('explicit choice instructions remain pending without mounted controls in four languages', () => {
  for (const question of [
    'Choose one option',
    'Выберите один вариант',
    'कृपया एक विकल्प चुनें',
    '请选择一个选项',
  ]) {
    waiting(planAnswer(question));
  }
});

test(
  'a strict pending question queues no draft and makes no model request',
  { timeout: 5000 },
  async () => {
    const env = await setup({ strictOptions: true, answerOptions: [] });
    const plan = await env.runner.plan(env.automation, opts);
    assert.equal(plan.drafts.length, 0);
    assert.equal(env.calls.length, 0);
    waiting(
      await previewAnswer(
        env.store,
        { question, strictOptions: true, modelDraft: true },
        { runner: env.modelRunner }
      )
    );
    assert.equal(env.calls.length, 0);
    assert.equal(env.sent.length, 0);
  }
);

test('an available unique answer keeps the provider label and explicit click intent', () => {
  const answer = planAnswer(question, {
    rules: [rule],
    options: ['YES', 'NO'],
    strictOptions: true,
  });
  assert.equal(answer.text, 'YES');
  assert.equal(answer.option, 'YES');
  assert.equal(answer.strictOptions, true);
  assert.equal(answer.complete, true);
  for (const options of [['Yes', 'YES'], ['NO']]) {
    const answer = planAnswer(question, { rules: [rule], options });
    assert.equal(answer.text, '');
    assert.equal(answer.complete, false);
  }
});

test('generic suggestions outside answerOptions retain normal text planning', () => {
  const answer = planAnswer(question, {
    rules: [rule],
    strictOptions: false,
    options: [],
    suggestions: ['Hello!', 'What is the schedule?'],
  });
  assert.equal(answer.text, 'Yes.');
  assert.equal(answer.complete, true);
  assert.equal(answer.strictOptions, undefined);
});

test('malformed provider options are refused without unbounded matching', () => {
  for (const options of [
    null,
    {},
    [''],
    [1],
    ['x'.repeat(6001)],
    Array(101).fill('Yes'),
  ]) {
    assert.throws(
      () => planAnswer(question, { options, rules: [rule] }),
      /choices require/u
    );
  }
  assert.throws(
    () => planAnswer(question, { strictOptions: 'true' }),
    /boolean/u
  );
});

test(
  'strict-state changes invalidate a reviewed draft even when option strings stay identical',
  { timeout: 5000 },
  async () => {
    const env = await setup({
      strictOptions: false,
      answerOptions: ['YES', 'NO'],
    });
    const draft = (await env.runner.run(env.automation, opts)).queued[0];
    await env.store.put(
      chatModelMessage(2, question, {
        strictOptions: true,
        answerOptions: ['YES', 'NO'],
      })
    );
    const result = await env.runner.sendDraft(draft.id, { confirm: true });
    assert.equal(result.code, 'answer-changed');
    assert.equal(env.sent.length, 0);
    assert.equal((await env.store.get(draft.id)).status, 'pending');
  }
);

test(
  'review cannot turn a strict option into arbitrary free text',
  { timeout: 5000 },
  async () => {
    const env = await setup({
      strictOptions: true,
      answerOptions: ['YES', 'NO'],
    });
    const draft = (await env.runner.run(env.automation, opts)).queued[0];
    const result = await env.runner.sendDraft(draft.id, {
      confirm: true,
      text: 'Let me explain my background.',
    });
    assert.equal(result.code, 'answer-choice-required');
    assert.equal(env.sent.length, 0);
  }
);

test('default delivery refuses strict choices before any API or plain browser text send', async () => {
  let writes = 0;
  const send = createDefaultSender({
    getSource: () => ({
      live: {
        post: async () => {
          writes++;
        },
      },
    }),
    browser: {
      close: async () => {},
      send: async () => {
        writes++;
      },
    },
  });
  try {
    await assert.rejects(
      async () =>
        send({
          source: 'hh',
          chat: '1',
          text: 'YES',
          answer: { strictOptions: true, option: 'YES' },
        }),
      { code: 'answer-choice-required' }
    );
    assert.equal(writes, 0);
  } finally {
    await send.close();
  }
});

test(
  'strict controls bind only the latest question during model turn assembly',
  { timeout: 5000 },
  async () => {
    const env = await setup({
      strictOptions: true,
      answerOptions: ['YES', 'NO'],
    });
    await env.store.put(chatModelMessage(1, 'Where do you live?'));
    const plan = await env.runner.plan(env.automation, opts);
    assert.equal(plan.drafts[0].text, 'YES');
    assert.equal(plan.drafts[0].answer.turn.messages.length, 1);
    assert.equal(plan.drafts[0].answer.question, question);
    assert.equal(env.calls.length, 0);
  }
);

test(
  'CLI config and offline UI retain an explicit strict wait',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await saveAnswerRule(store, rule);
    const input = { question, strictOptions: true, options: [] };
    const dir = await mkdtemp(join(tmpdir(), 'ms-strict-options-'));
    try {
      const config = join(dir, 'preview.lino');
      await writeFile(config, encodeWire(input, LINO_TEXT));
      const cli = createAutomationCommands({ openStore: async () => store });
      const output = [];
      assert.equal(
        await cli.automations(
          { _: ['answers', 'plan'], config, json: true },
          (line) => output.push(line)
        ),
        0
      );
      waiting(JSON.parse(output.at(-1)));
      const offline = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      waiting(await offline.previewAnswer(input));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'both default Lino transports preserve strict wait and exact choice identity',
  { timeout: 10000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const store = createMemoryStore();
      await saveAnswerRule(store, rule);
      const { server, base } = await formReviewHttp({ store }, media);
      try {
        for (const options of [[], ['YES', 'NO']]) {
          const response = await fetch(`${base}/api/automations/answers/plan`, {
            method: 'POST',
            headers: { 'content-type': media, accept: media },
            body: encodeWire({ question, strictOptions: true, options }, media),
          });
          assert.equal(response.status, 200);
          const answer = await readWireResponse(response);
          if (options.length) {
            assert.equal(answer.option, 'YES');
          } else {
            waiting(answer);
          }
        }
      } finally {
        await server.close();
      }
    }
  }
);
