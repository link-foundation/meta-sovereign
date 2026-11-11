import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { planAnswer } from '../src/automation/question-answers.js';
import { chatQuestionTurn } from '../src/automation/question-chat-turn.js';
import {
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { NO_NOTICE_REPLY } from '../src/automation/question-notices.js';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import {
  earlierQuestion,
  earlierAnswer,
  pendingRules,
  wholeTurnSnapshot,
} from '../../experiments/issue-56/whole-turn-fixture.mjs';
import { summary } from '../../experiments/issue-56/question-summary-fixture.mjs';
import {
  noticeText,
  noticeRule,
} from '../../experiments/issue-56/notice-fixture.mjs';
import {
  seedChatModel,
  openChatQuestion,
} from '../../experiments/issue-56/chat-model-fixture.mjs';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { BrowserPendingTurn } from '../src/web/question-browser-pending.js';
import { AnswerEvidence } from '../src/web/question-evidence.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { withHistory } from '../../experiments/issue-56/browser-history-fixture.mjs';
import { createChoiceContext } from '../src/sources/browser-choice-controller.js';
import { selectBrowserAnswer } from '../src/sources/browser-choices.js';
import {
  providerChoiceDraft,
  providerChoiceUi,
} from '../../experiments/issue-56/provider-choice-fixture.mjs';

const messages = (...bodies) =>
  bodies.map((body, index) => ({ id: String(index), body }));
const plan = (bodies, options = {}) =>
  planAnswer(bodies.at(-1), {
    rules: pendingRules(),
    approximate: false,
    ...options,
    pendingMessages: messages(...bodies),
  });
const localized = (locale, children) =>
  renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      { value: { locale, t: (key, values) => translate(locale, key, values) } },
      children
    )
  );
const modelPending = async (bodies) => {
  const store = createMemoryStore();
  const env = await seedChatModel(store, { openOnly: true });
  const answer = await previewAnswer(
    store,
    {
      ...env.automation.action,
      question: bodies.at(-1),
      pendingMessages: messages(...bodies),
    },
    { runner: env.runner }
  );
  return { answer, calls: env.calls };
};
const withBrowser = async (work, options, watch = false) => {
  const env = await (watch ? questionWatchFixture : questionBrowserFixture)(
    options
  );
  try {
    await saveAnswerRule(env.store, pendingRules()[0]);
    await work(env);
  } finally {
    await env.browser.close();
  }
};
const startWatch = async (env) => {
  const review = await env.browser.inspect(browserTarget);
  await env.browser.watchStart({ ...env.input, review: review.id });
  return env.until(
    (state) =>
      state.state === 'paused' ||
      ['review', 'prefilled', 'sent', 'failed'].includes(state.phase)
  );
};

test('model opt-out plans every pending saved question instead of dropping earlier answers', () => {
  const snapshot = wholeTurnSnapshot();
  const answer = plan(
    snapshot.pendingTurn.messages.map((message) => message.body)
  );
  assert.equal(answer.text, `1. ${earlierAnswer}\n2. Yes`);
  assert.equal(answer.complete, true);
  assert.equal(answer.requiresReview, true);
  assert.equal(answer.parts.length, 2);
  assert.equal(answer.pending.actionable, 2);
});

test('later completed summaries cannot mask an earlier unanswered request', () => {
  const answer = plan([earlierQuestion, summary]);
  assert.equal(answer.text, earlierAnswer);
  assert.equal(answer.noReply, false);
  assert.equal(answer.parts[1].noReply, true);
  assert.equal(answer.requiresReview, false);
  const unknown = plan(['When can you start?', summary, earlierQuestion]);
  assert.equal(unknown.text, `1. {{answer:1}}\n2. ${earlierAnswer}`);
  assert.equal(unknown.complete, false);
});

test('only completed summaries and current approved no-reply notices unblock strict selection', () => {
  const latest = wholeTurnSnapshot().question.body;
  const options = { strictOptions: true, options: ['Yes', 'No'] };
  assert.equal(plan([summary, latest], options).pending.blocked, false);
  const rule = noticeRule({
    answers: [{ text: NO_NOTICE_REPLY, approved: true }],
  });
  const allowed = plan([noticeText, latest], {
    ...options,
    rules: [...pendingRules(), rule],
  });
  assert.equal(allowed.pending.blocked, false);
  assert.equal(allowed.requiresReview, false);
  for (const earlier of [earlierQuestion, 'When can you start?', noticeText]) {
    const blocked = plan([earlier, latest], options);
    assert.equal(blocked.pending.blocked, true, earlier);
    assert.equal(blocked.requiresReview, true, earlier);
    assert.equal(blocked.text, 'Yes');
  }
});

test('pending metadata refuses malformed, duplicate and over-capacity turns without partial answers', () => {
  for (const pendingMessages of [
    [],
    messages('Other question?'),
    [
      { id: 'same', body: earlierQuestion },
      { id: 'same', body: earlierQuestion },
    ],
    Array.from({ length: 21 }, (_, index) => ({
      id: String(index),
      body: earlierQuestion,
    })),
    [...messages('x'.repeat(6001)), ...messages(earlierQuestion)],
    [
      ...Array.from({ length: 4 }, (_, index) => ({
        id: String(index),
        body: 'x'.repeat(6000),
      })),
      { id: 'latest', body: earlierQuestion },
    ],
  ]) {
    assert.throws(
      () => planAnswer(earlierQuestion, { pendingMessages }),
      /complete bounded turn/
    );
  }
});

test('all archived providers retain notices, old unanswered questions and real reply boundaries independently of model opt-in', () => {
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    const rows = messages(
      'Old answered question?',
      'Owner reply',
      earlierQuestion,
      noticeText,
      wholeTurnSnapshot().question.body
    ).map((message, index) => ({
      ...message,
      id: `msg:${source}:7:${index}`,
      sender: index === 1 ? 'owner' : 'recruiter',
      timestamp: `2026-11-${index < 3 ? '08' : '11'}T01:00:0${index}Z`,
    }));
    const selected = chatQuestionTurn(rows, ['owner'], false);
    assert.deepEqual(
      selected.pendingMessages.map((message) => message.body),
      rows.slice(2).map((message) => message.body)
    );
    assert.equal(selected.question, rows.at(-1).body);
    assert.equal(selected.turn.messages.length, 3);
    assert.equal(
      chatQuestionTurn(
        [
          ...rows,
          { ...rows[1], id: 'manual', timestamp: '2026-11-11T02:00:00Z' },
        ],
        ['owner']
      ).reason,
      'question-already-answered'
    );
    rows[2].deleted = true;
    assert.equal(
      chatQuestionTurn(rows, ['owner']).reason,
      'question-turn-unavailable'
    );
  }
});

test('browser inspection and manual prefill review both known messages', () =>
  withBrowser(async (env) => {
    env.state.snapshot = wholeTurnSnapshot();
    const review = await env.browser.inspect(browserTarget);
    assert.equal(review.plan.text, `1. ${earlierAnswer}\n2. Yes`);
    await env.browser.prefill({ id: review.id, confirm: true });
    assert.equal(env.state.prefills[0].text, review.plan.text);
    assert.equal(env.state.sends.length, 0);
  }));

test('finite watches prefill all approved answers and never send free text', () =>
  withBrowser(
    async (env) => {
      env.state.snapshot = wholeTurnSnapshot();
      const status = await startWatch(env);
      assert.equal(status.phase, 'prefilled');
      assert.equal(env.state.prefills[0].text, `1. ${earlierAnswer}\n2. Yes`);
      assert.equal(env.state.sends.length, 0);
    },
    undefined,
    true
  ));

test('strict watches allow completed summaries while retaining actionable earlier messages for review', async () => {
  for (const earlier of [summary, earlierQuestion]) {
    await withBrowser(
      async (env) => {
        env.state.snapshot = wholeTurnSnapshot({
          strictOptions: true,
          earlier,
        });
        const status = await startWatch(env);
        assert.equal(status.phase, earlier === summary ? 'sent' : 'review');
        assert.equal(env.state.sends.length, earlier === summary ? 1 : 0);
      },
      undefined,
      true
    );
  }
});

test('an earlier saved-answer change during queued prefill stops the whole pending draft', () => {
  let fixture;
  return withBrowser(
    async (env) => {
      fixture = env;
      env.state.snapshot = wholeTurnSnapshot();
      const status = await startWatch(env);
      assert.equal(status.state, 'paused');
      assert.equal(status.reason, 'question-watch-plan-changed');
      assert.equal(env.state.prefills.length, 0);
      assert.equal(env.state.sends.length, 0);
    },
    {
      prefilling: async () =>
        saveAnswerRule(fixture.store, {
          ...pendingRules()[0],
          answers: [{ text: 'C1', approved: true }],
        }),
    },
    true
  );
});

test('opt-in model drafting fills an earlier unknown request without drafting completed summaries', async () => {
  const bodies = [openChatQuestion, summary, earlierQuestion];
  const { answer, calls } = await modelPending(bodies);
  assert.equal(answer.complete, true);
  assert.match(answer.text, /1\. I build accessible browser interfaces/);
  assert.match(answer.text, /2\. My English level is B2\./);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].questions.map((item) => item.question),
    [openChatQuestion]
  );
});

test('oversized split model batches are refused before invoking the configured runner', async () => {
  const bodies = [0, 1].map((group) =>
    Array.from(
      { length: 13 },
      (_, index) => `Where did you work at company ${group * 13 + index}?`
    ).join('\n')
  );
  const { answer, calls } = await modelPending(bodies);
  assert.equal(answer.model.state, 'refused');
  assert.equal(answer.model.code, 'answer-model-context');
  assert.equal(answer.complete, false);
  assert.equal(calls.length, 0);
});

test('archived native intent retains every pending message without inventing an observed boundary', async () => {
  const draft = providerChoiceDraft();
  draft.answer.turn.messages.unshift({ id: 'msg:hh:7:100', body: summary });
  let expected;
  await assert.rejects(
    selectBrowserAnswer(
      {
        evaluate: async ({ args }) => {
          expected = args[0].expected;
          return { code: 'answer-choice-changed' };
        },
      },
      providerChoiceUi('http://127.0.0.1:12345'),
      draft,
      '7'
    ),
    { code: 'answer-choice-changed' }
  );
  assert.deepEqual(
    expected.pendingMessages.map((message) => message.id),
    ['100', '101']
  );
  assert.equal(expected.pendingTurn, undefined);
  withHistory(
    [
      { outgoing: true, body: 'Owner reply' },
      { body: summary },
      { body: draft.answer.turn.messages.at(-1).body },
    ],
    (read) => {
      const current = read('read');
      const frozen = {
        ...current,
        pendingMessages: current.pendingTurn.messages,
      };
      delete frozen.pendingTurn;
      const context = createChoiceContext({ expected: frozen }, () => current);
      assert.equal(context.same(current), true);
      current.pendingTurn = {
        ...current.pendingTurn,
        messages: current.pendingTurn.messages.slice(1),
      };
      assert.equal(context.same(current), false);
    }
  );
});

test(
  'CLI, offline API and both default Lino representations preserve the same complete pending plan',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    for (const rule of pendingRules()) {
      await saveAnswerRule(store, rule);
    }
    const snapshot = wholeTurnSnapshot();
    const input = {
      question: snapshot.question.body,
      pendingMessages: snapshot.pendingTurn.messages,
      approximate: false,
    };
    const expected = `1. ${earlierAnswer}\n2. Yes`;
    const offline = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    assert.equal((await offline.previewAnswer(input)).text, expected);
    const directory = await mkdtemp(join(tmpdir(), 'ms-whole-turn-'));
    const config = join(directory, 'plan.lino');
    try {
      await writeFile(config, encodeWire(input, LINO_TEXT));
      const output = [];
      const cli = createAutomationCommands({ openStore: async () => store });
      assert.equal(
        await cli.automations(
          { _: ['answers', 'plan'], config, json: true },
          (line) => output.push(line)
        ),
        0
      );
      assert.equal(JSON.parse(output.at(-1)).text, expected);
      const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
      try {
        for (const media of [LINO_TEXT, LINO_BINARY]) {
          const response = await fetch(`${base}/api/automations/answers/plan`, {
            method: 'POST',
            headers: { accept: media, 'content-type': media },
            body: encodeWire(input, media),
          });
          assert.equal(response.status, 200);
          const answer = await readWireResponse(response);
          assert.equal(answer.text, expected);
          assert.equal(answer.pending.count, 2);
          assert.equal(answer.parts.length, 2);
        }
      } finally {
        await server.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test('four localized shared reviews describe whole-turn coverage and per-message answer evidence', () => {
  const snapshot = wholeTurnSnapshot();
  const answer = plan(
    snapshot.pendingTurn.messages.map((message) => message.body)
  );
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const markup = localized(locale, [
      React.createElement(BrowserPendingTurn, {
        key: 'turn',
        snapshot,
        plan: answer,
      }),
      React.createElement(AnswerEvidence, { key: 'answer', answer }),
    ]);
    assert.ok(markup.includes(translate(locale, 'browserAnswer.wholeTurn')));
    assert.ok(
      markup.includes(translate(locale, 'questions.match.pending-turn'))
    );
    assert.equal(markup.includes('browserAnswer.wholeTurn'), false);
    assert.equal(markup.includes('questions.match.pending-turn'), false);
    const completed = wholeTurnSnapshot({
      strictOptions: true,
      earlier: summary,
    });
    const completedPlan = plan(
      completed.pendingTurn.messages.map((message) => message.body),
      { options: completed.answerOptions, strictOptions: true }
    );
    const completedMarkup = localized(
      locale,
      React.createElement(BrowserPendingTurn, {
        snapshot: completed,
        plan: completedPlan,
      })
    );
    assert.ok(
      completedMarkup.includes(
        translate(locale, 'browserAnswer.latestAfterCompleted')
      )
    );
    assert.equal(completedMarkup.includes('browserAnswer.latestOnly'), false);
  }
});
