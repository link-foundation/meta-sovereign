import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { queueDrafts } from '../src/automation/drafts.js';
import {
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { saveAnswerModel } from '../src/automation/answer-model-config.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { toForm, fromForm } from '../src/web/automations-model.js';
import { AutomationActionFields } from '../src/web/question-actions.js';
import { AnswerEvidence } from '../src/web/question-evidence.js';
import { createAutomationApi } from '../src/web/automation-api.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { Notice } from '../src/web/notice.js';
import { runNotice } from '../src/web/chat-state.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  seedChatModel,
  knownChatQuestion,
  openChatQuestion,
  chatModelMessage,
  chatModelTargets as targets,
  chatModelNow as now,
  modelText,
} from '../../experiments/issue-56/chat-model-fixture.mjs';
import { matchingQuestions } from '../../experiments/issue-56/question-matching-fixture.mjs';

const setup = async (options) => {
  const store = createMemoryStore();
  const fixture = await seedChatModel(store, options);
  const sent = [];
  const runner = createAutomationRunner({
    store,
    modelRunner: fixture.runner,
    clock: () => now,
    send: async (draft) => {
      sent.push(draft);
      return { via: 'fixture' };
    },
  });
  return { store, ...fixture, modelRunner: fixture.runner, runner, sent };
};
const opts = { targets, test: true };

test('chat model opt-in persists through normalization and shared editor', () => {
  const automation = normalizeAutomation({
    id: 'opt-in',
    action: { kind: 'answer-questions', modelDraft: true },
  });
  assert.equal(automation.action.modelDraft, true);
  const form = toForm(automation);
  assert.equal(form.modelDraft, true);
  assert.equal(fromForm(form, automation).action.modelDraft, true);
  for (const modelDraft of ['true', 1, null]) {
    assert.throws(
      () =>
        normalizeAutomation({
          ...automation,
          action: { ...automation.action, modelDraft },
        }),
      { code: 'answer-model-config' }
    );
  }
});

test(
  'chat matching defaults to 0.7 for reviewed candidates and preserves explicit thresholds',
  { timeout: 5000 },
  async () => {
    const env = await setup({ openOnly: true });
    await saveAnswerRule(env.store, {
      id: 'chat-city',
      question: matchingQuestions.saved,
      answers: [{ text: 'London', approved: true }],
    });
    await env.store.put(chatModelMessage(2, matchingQuestions.asked));
    const automation = {
      ...env.automation,
      action: {
        ...env.automation.action,
        approximate: true,
        modelDraft: false,
      },
    };
    const plan = await env.runner.plan(automation, opts);
    assert.equal(plan.drafts[0].text, 'London');
    assert.equal(plan.drafts[0].answer.match, 'approximate');
    assert.equal(plan.drafts[0].answer.requiresReview, true);
    assert.equal(plan.drafts[0].answer.similarity, 8 / 11);
    const standalone = await previewAnswer(env.store, {
      question: matchingQuestions.asked,
    });
    assert.equal(standalone.text, '');
    automation.action.matching = { threshold: 0.8 };
    const explicit = await env.runner.plan(automation, opts);
    assert.equal(explicit.drafts.length, 0);
    assert.equal(env.calls.length, 0);
  }
);

test(
  'mixed preview drafts only unanswered parts and retains approved text and provenance',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const drafted = await previewAnswer(
      env.store,
      {
        ...env.automation.action,
        question: `${knownChatQuestion}\n${openChatQuestion}`,
        modelDraft: true,
      },
      { runner: env.modelRunner }
    );
    assert.equal(env.calls.length, 1);
    assert.deepEqual(
      env.calls[0].questions.map((q) => q.question),
      [openChatQuestion]
    );
    assert.equal(drafted.parts[0].text, 'My English level is B2.');
    assert.deepEqual(drafted.parts[0].rules, ['qa-rule:chat-english']);
    assert.equal(drafted.parts[1].text, modelText);
    assert.deepEqual(drafted.parts[1].evidence, ['cv:model-fixture']);
    assert.equal(drafted.complete, true);
    assert.equal(drafted.requiresReview, true);
  }
);

test(
  'latest consecutive unanswered messages become one reviewed draft, with bounded prior context',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const result = await env.runner.run(env.automation, opts);
    assert.equal(result.queued.length, 1);
    assert.match(result.queued[0].text, /1\. My English level is B2\./);
    assert.match(
      result.queued[0].text,
      /2\. I build accessible browser interfaces\./
    );
    assert.deepEqual(
      env.calls[0].questions.map((q) => q.question),
      [openChatQuestion]
    );
    assert.equal(env.calls[0].context.cv.id, 'cv:model-fixture');
    assert.ok(
      env.calls[0].context.recent.some((m) => m.text === 'I am interested.')
    );
    assert.equal(env.calls.length, 1);
    assert.equal(env.sent.length, 0);
    const reused = await env.runner.run(env.automation, opts);
    assert.equal(reused.reused, true);
    assert.equal(env.calls.length, 1);
  }
);

test(
  'a wholly unanswered question gets a model draft; unknown facts stay explicit and reviewed',
  { timeout: 5000 },
  async () => {
    const env = await setup({ openOnly: true });
    const result = await env.runner.plan(env.automation, opts);
    assert.equal(result.drafts[0].text, modelText);
    await env.store.put(chatModelMessage(2, 'When can you start?'));
    const unknown = await env.runner.plan(env.automation, opts);
    assert.match(unknown.drafts[0].text, /\[clarify:/);
    assert.equal(unknown.drafts[0].answer.complete, false);
    assert.equal(unknown.drafts[0].answer.requiresReview, true);
    assert.equal(env.sent.length, 0);
  }
);

test(
  'auto mode queues model output for review without a send confirmation or delivery',
  { timeout: 5000 },
  async () => {
    const env = await setup({ openOnly: true });
    const result = await env.runner.run(
      { ...env.automation, mode: 'auto' },
      opts
    );
    assert.equal(result.queued.length, 1);
    assert.equal(result.queued[0].text, modelText);
    assert.equal(result.results.length, 0);
    assert.equal(env.sent.length, 0);
  }
);

test(
  'disabled, absent and refused models never queue empty answers and expose actual states',
  { timeout: 5000 },
  async () => {
    for (const state of ['disabled', 'unavailable', 'refused']) {
      const env = await setup({ openOnly: true });
      if (state === 'disabled') {
        await saveAnswerModel(env.store, { ...env.settings, enabled: false });
      }
      const runner = createAutomationRunner({
        store: env.store,
        clock: () => now,
        modelRunner:
          state === 'unavailable' ? undefined : async () => ({ drafts: [] }),
      });
      const result = await runner.run(env.automation, opts);
      assert.equal(result.queued.length, 0, state);
      assert.equal(result.excluded[0].answer.model.state, state);
    }
  }
);

test(
  'opt-out, completed summaries, outgoing, service, unknown and oversized turns do not invoke a model',
  { timeout: 5000 },
  async () => {
    for (const change of [
      async (env) => {
        env.automation.action.modelDraft = false;
      },
      async (env) =>
        env.store.put(
          chatModelMessage(4, 'Your answers:\nWhat is your English level?: B2.')
        ),
      async (env) =>
        env.store.put(chatModelMessage(4, 'My own reply', { outgoing: true })),
      async (env) =>
        env.store.put(chatModelMessage(4, 'Service', { service: true })),
      async (env) =>
        env.store.put(
          chatModelMessage(4, openChatQuestion, { delivery: 'unknown' })
        ),
      async (env) => env.store.put(chatModelMessage(4, 'What '.repeat(1300))),
    ]) {
      const env = await setup({ openOnly: true });
      await change(env);
      await env.runner.plan(env.automation, opts);
      assert.equal(env.calls.length, 0);
    }
  }
);

test(
  'knowledge, configuration and turn edits during a held model request invalidate its output',
  { timeout: 5000 },
  async () => {
    for (const change of [
      (env) =>
        env.store.put(chatModelMessage(4, 'Owner replied.', { sender: 'me' })),
      (env) =>
        env.store.put(chatModelMessage(2, 'What is your Spanish level?')),
      (env) =>
        env.store.put(
          chatModelMessage(3, openChatQuestion, { answerOptions: ['Other'] })
        ),
      (env) =>
        env.store.put({
          id: 'cv:model-fixture',
          cv: { basics: { summary: 'Changed' } },
        }),
      (env) => saveAnswerPolicy(env.store, { rejected: ['unrelated'] }),
      (env) => env.store.put({ ...env.automation, enabled: false }),
      (env) =>
        saveAnswerRule(env.store, {
          id: 'extra-chat',
          question: 'Where?',
          answers: [{ text: 'Elsewhere', approved: true }],
        }),
    ]) {
      const env = await setup();
      let started;
      let release;
      const called = new Promise((resolve) => {
        started = resolve;
      });
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const runner = createAutomationRunner({
        store: env.store,
        clock: () => now,
        modelRunner: async () => {
          started();
          await held;
          return {
            drafts: [
              {
                id: 'part:1',
                text: modelText,
                missing: [],
                evidence: ['cv:model-fixture'],
              },
            ],
          };
        },
      });
      const pending = runner.run(env.automation, opts);
      await called;
      await change(env);
      release();
      const result = await pending;
      assert.equal(result.queued.length, 0);
      assert.equal((await runner.drafts()).length, 0);
    }
  }
);

test(
  'reviewed delivery validates frozen context without another model call and retains failed drafts',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const result = await env.runner.run(env.automation, opts);
    const draft = result.queued[0];
    await env.store.put({
      id: 'cv:model-fixture',
      cv: { basics: { summary: 'Changed' } },
    });
    const refused = await env.runner.sendDraft(draft.id, { confirm: true });
    assert.equal(refused.code, 'answer-review-required');
    assert.equal(env.sent.length, 0);
    assert.equal(env.calls.length, 1);
    assert.equal((await env.store.get(draft.id)).status, 'pending');
    const fresh = await setup();
    const ready = (await fresh.runner.run(fresh.automation, opts)).queued[0];
    const sent = await fresh.runner.sendDraft(ready.id, {
      confirm: true,
      text: 'Owner reviewed and edited.',
    });
    assert.equal(sent.status, 'sent');
    assert.equal(fresh.sent[0].text, 'Owner reviewed and edited.');
    assert.equal(fresh.calls.length, 1);
  }
);

test(
  'changed offered choices invalidate a reviewed model answer without another request',
  { timeout: 5000 },
  async () => {
    const env = await setup({ openOnly: true });
    await env.store.put(
      chatModelMessage(2, openChatQuestion, {
        answerOptions: [modelText, 'Other background'],
      })
    );
    const draft = (await env.runner.run(env.automation, opts)).queued[0];
    assert.equal(draft.text, modelText);
    await env.store.put(
      chatModelMessage(2, openChatQuestion, {
        answerOptions: ['Other background'],
      })
    );
    const result = await env.runner.sendDraft(draft.id, { confirm: true });
    assert.equal(result.code, 'answer-changed');
    assert.equal(env.sent.length, 0);
    assert.equal(env.calls.length, 1);
    assert.equal((await env.store.get(draft.id)).status, 'pending');
  }
);

test(
  'queue refuses stale model context and preserves a pending owner draft created during planning',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const draft = (await env.runner.plan(env.automation, opts)).drafts[0];
    await env.store.put({
      ...draft,
      status: 'pending',
      text: 'Owner keeps this edit.',
    });
    const queued = await queueDrafts(
      env.store,
      env.automation,
      [draft],
      now.toISOString()
    );
    assert.equal(queued[0].text, 'Owner keeps this edit.');
    await env.store.delete(draft.id);
    await env.store.put(
      chatModelMessage(4, 'Owner answered', { sender: 'me' })
    );
    await assert.rejects(
      queueDrafts(env.store, env.automation, [draft], now.toISOString()),
      { code: 'answer-changed' }
    );
  }
);

test(
  'abort drains the pending request and queues nothing',
  { timeout: 5000 },
  async () => {
    const env = await setup({ openOnly: true });
    const controller = new AbortController();
    let called;
    const started = new Promise((resolve) => {
      called = resolve;
    });
    const runner = createAutomationRunner({
      store: env.store,
      clock: () => now,
      modelRunner: async ({ signal }) => {
        called();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
        return { drafts: [] };
      },
    });
    const pending = runner.run(env.automation, {
      ...opts,
      signal: controller.signal,
    });
    await started;
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal((await runner.drafts()).length, 0);
  }
);

test(
  'offline planning exposes model unavailability without fabricated output',
  { timeout: 5000 },
  async () => {
    const env = await setup({ openOnly: true });
    const api = createAutomationApi({
      store: env.store,
      remote: { get: async () => null, post: async () => null },
    });
    const plan = await api.planAutomation({
      automation: env.automation.id,
      ...opts,
    });
    assert.equal(plan.drafts.length, 0);
    assert.equal(plan.excluded[0].answer.model.state, 'unavailable');
  }
);

test(
  'both Lino transports use the configured server model and reject untrusted draft requests',
  { timeout: 15000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await setup();
      const { server, base } = await formReviewHttp(
        {
          store: env.store,
          answerModel: { draft: env.modelRunner, stop: async () => {} },
        },
        media
      );
      const request = async (origin) => {
        const response = await fetch(`${base}/api/automations/run`, {
          method: 'POST',
          headers: {
            accept: media,
            'content-type': media,
            ...(origin ? { origin } : {}),
          },
          body: encodeWire({ automation: env.automation.id, ...opts }, media),
        });
        return {
          status: response.status,
          body: await readWireResponse(response),
        };
      };
      try {
        assert.equal((await request('https://untrusted.example')).status, 403);
        assert.equal(env.calls.length, 0);
        const response = await request();
        assert.equal(response.status, 200);
        assert.equal(response.body.queued[0].answer.model.state, 'drafted');
        assert.match(response.body.queued[0].text, /English level is B2/);
        assert.match(
          response.body.queued[0].text,
          /accessible browser interfaces/
        );
        assert.equal(env.calls.length, 1);
      } finally {
        await server.close();
      }
    }
  }
);

test(
  'CLI planning and run share the opt-in adapter and preserve the reviewed draft',
  { timeout: 10000 },
  async () => {
    const env = await setup();
    const logs = [];
    const commands = createAutomationCommands({
      openStore: async () => env.store,
      modelRunner: env.modelRunner,
      send: async () => assert.fail('CLI run must not send'),
      setTyping: async () => null,
      sleep: async () => {},
    });
    const status = await commands.automations(
      {
        _: ['run', env.automation.id],
        chat: 'hh:model-chat',
        test: true,
        json: true,
        now: now.toISOString(),
      },
      (value) => logs.push(value)
    );
    assert.equal(status, 0, logs.join('\n'));
    const result = JSON.parse(logs[0]);
    assert.equal(result.queued[0].answer.model.used, true);
    assert.match(result.queued[0].text, /English level is B2/);
    assert.equal(env.calls.length, 1);
  }
);

test(
  'all four locales render shared opt-in, per-part evidence and unavailable chat notices',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const answer = (await env.runner.plan(env.automation, opts)).drafts[0]
      .answer;
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const render = (child) =>
        renderToStaticMarkup(
          React.createElement(
            LocaleContext.Provider,
            {
              value: {
                locale,
                t: (key, values) => translate(locale, key, values),
                setLocale: () => {},
              },
            },
            child
          )
        );
      const html = render(
        React.createElement(AutomationActionFields, {
          form: toForm(env.automation),
          set: () => {},
          Input: () => null,
          Choice: () => null,
          Check: () => null,
          api: {},
        })
      );
      assert.match(html, /data-model-draft-opt-in=""/);
      const evidence = render(React.createElement(AnswerEvidence, { answer }));
      assert.match(evidence, /cv:model-fixture/);
      assert.match(evidence, /qa-rule:chat-english/);
      const notice = runNotice({
        queued: [],
        excluded: [
          {
            key: 'hh:model-chat',
            reason: 'question-unanswered',
            answer: { model: { state: 'unavailable' } },
          },
        ],
      });
      const message = render(
        React.createElement(Notice, {
          notice,
          labels: { nothing: 'automations.reason.question-unanswered' },
          dismiss: () => {},
        })
      );
      assert.match(message, /data-answer-model-state="unavailable"/);
      assert.equal(message.includes('answerModel.state.unavailable'), false);
      assert.notEqual(
        translate(locale, 'answerModel.optIn'),
        'answerModel.optIn'
      );
    }
  }
);
