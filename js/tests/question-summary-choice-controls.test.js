import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeLinoValue,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  summaryChoiceMessage,
  summaryChoiceInput,
} from '../../experiments/issue-56/summary-choice-fixture.mjs';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import {
  seedChatModel,
  chatModelMessage,
  chatModelTargets,
  chatModelNow,
} from '../../experiments/issue-56/chat-model-fixture.mjs';

const browserSummary = async () => {
  const env = await questionBrowserFixture();
  await env.store.delete('qa-rule:experience');
  await env.store.put(
    summaryChoiceMessage({
      body: `Your answers:\n${env.state.snapshot.question.body}: Yes.`,
    })
  );
  return env;
};
const verify = (answer) => {
  assert.equal(answer.match, 'accepted-summary');
  assert.equal(answer.requiresReview, false);
  assert.equal(answer.complete, true);
};

test('CLI and offline UI resolve actual summaries without accepting caller-invented evidence', async () => {
  const store = createMemoryStore();
  await store.put(summaryChoiceMessage());
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  assert.equal(
    await cli.automations(
      {
        _: ['answers', 'plan'],
        ...summaryChoiceInput,
        options: encodeLinoValue(summaryChoiceInput.options),
        'strict-options': 'true',
        json: true,
      },
      (line) => output.push(line)
    ),
    0
  );
  verify(JSON.parse(output.at(-1)));
  const api = questionApi({ store, remote: { report: async () => null } });
  verify(await api.previewAnswer(summaryChoiceInput));
});

test('browser CLI inspection shares accepted-summary evidence and preserves explicit confirmation', async () => {
  const env = await browserSummary();
  const cli = createAutomationCommands({
    openStore: async () => env.store,
    send: env.send,
  });
  const output = [];
  assert.equal(
    await cli.automations(
      {
        _: ['answers', 'browser', 'inspect'],
        now: env.state.now.toISOString(),
        ...browserTarget,
        json: true,
      },
      (line) => output.push(line)
    ),
    0
  );
  const review = JSON.parse(output.at(-1));
  verify(review.plan);
  assert.equal(review.plan.option, 'Yes');
  assert.equal(env.state.sends.length, 0);
  await assert.rejects(env.browser.select({ id: review.id, option: 'Yes' }), {
    code: 'confirm-required',
  });
  assert.equal(
    (await env.browser.select({ id: review.id, option: 'Yes', confirm: true }))
      .status,
    'sent'
  );
  assert.equal(env.state.sends.length, 1);
});

test(
  'text and binary Lino plans and browser reviews use the same stored summary',
  { timeout: 10000 },
  async () => {
    const env = await browserSummary();
    const server = await startServer({
      store: env.store,
      port: 0,
      localUi: false,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false, send: env.send },
      log: null,
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        for (const [action, input] of [
          [
            'plan',
            {
              ...summaryChoiceInput,
              question: env.state.snapshot.question.body,
              options: ['Yes', 'No'],
            },
          ],
          ['browser/inspect', browserTarget],
        ]) {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/automations/answers/${action}`,
            {
              method: 'POST',
              headers: { 'content-type': type, accept: type },
              body: encodeWire(input, type),
            }
          );
          assert.equal(response.status, 200);
          const result = await readWireResponse(response);
          verify(action === 'plan' ? result : result.plan);
        }
      }
      assert.equal(env.state.sends.length, 0);
    } finally {
      await server.close();
    }
  }
);

test(
  'automatic native choices recheck accepted evidence before delivery and keep the shared durable reservation',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const env = await seedChatModel(store, { openOnly: true });
    const automation = {
      ...env.automation,
      mode: 'auto',
      action: { ...env.automation.action, modelDraft: false },
    };
    await store.put(automation);
    await store.put(summaryChoiceMessage());
    await store.put(
      chatModelMessage(2, summaryChoiceInput.question, {
        answerOptions: summaryChoiceInput.options,
        strictOptions: true,
      })
    );
    const sent = [];
    const runner = createAutomationRunner({
      store,
      clock: () => chatModelNow,
      send: async (draft) => {
        sent.push(draft);
        return {
          via: 'browser',
          source: draft.source,
          chat: draft.chat,
          option: draft.text,
          messageId: 'native-31',
        };
      },
    });
    const options = { targets: chatModelTargets, test: true };
    const plan = await runner.plan(automation, options);
    assert.ok(plan.drafts[0], JSON.stringify(plan));
    verify(plan.drafts[0].answer);
    const changed = { ...automation, name: 'Changed summary before write' };
    await store.put(
      summaryChoiceMessage({
        body: `Your answers:\n${summaryChoiceInput.question}: No.`,
      })
    );
    const stale = await runner.deliverDraft(changed, plan.drafts[0]);
    assert.equal(stale.code, 'answer-review-required');
    assert.equal(sent.length, 0);
    const fresh = await runner.plan(changed, options);
    const result = await runner.deliverDraft(changed, fresh.drafts[0]);
    assert.equal(result.status, 'sent');
    assert.equal(sent[0].text, 'NO');
    assert.equal(sent.length, 1);
    assert.notEqual(
      (await runner.deliverDraft(changed, fresh.drafts[0])).status,
      'sent'
    );
    assert.equal(sent.length, 1);
  }
);
