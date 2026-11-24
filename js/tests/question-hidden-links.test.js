import test from 'node:test';
import assert from 'node:assert/strict';
import { messageLinkProperties } from '../src/message-link-targets.js';
import { planAnswer } from '../src/automation/question-answers.js';
import { planAutomation } from '../src/automation/automations.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  previewAnswer,
  readChatAnswerInput,
} from '../src/automation/question-store.js';
import {
  checkBrowserQuestion,
  browserChoiceDraft,
} from '../src/automation/question-browser-state.js';
import {
  browserPendingTurn,
  checkedBrowserPendingTurn,
} from '../src/sources/browser-pending-turn.js';
import { hiddenLink as link } from '../../experiments/issue-56/question-hidden-links-fixture.mjs';
import { withHistory } from '../../experiments/issue-56/browser-history-fixture.mjs';
import { browserQuestion } from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import {
  summaryChoiceInput,
  summaryChoiceMessage,
} from '../../experiments/issue-56/summary-choice-fixture.mjs';
import {
  seedModelAnswers,
  modelRunnerFixture,
  modelQuestion,
} from '../../experiments/issue-56/forms-model-fixture.mjs';

const rule = {
  id: 'qa-rule:experience',
  question: link.question,
  answers: [{ text: 'Yes', approved: true }],
};
const incoming = (id, body, links) => ({
  id,
  body,
  ...messageLinkProperties(links),
});

test('the serialized native reader retains absolute destinations without rewriting visible text', () => {
  withHistory(
    [
      {
        ...incoming('1', link.question, [link.first, '/assignment']),
        linkDisplayContents: true,
      },
    ],
    (read) => {
      const snapshot = read('read');
      assert.equal(snapshot.question.body, link.question);
      assert.deepEqual(snapshot.question.links, [
        link.first,
        'https://hh.ru/assignment',
      ]);
      assert.deepEqual(
        snapshot.pendingTurn.messages[0].links,
        snapshot.question.links
      );
    }
  );
});

test('hidden destinations require fresh review without rewriting exact question text', () => {
  const plan = planAnswer(link.question, {
    rules: [rule],
    links: [link.first],
  });
  assert.equal(plan.match, 'exact');
  assert.equal(plan.text, 'Yes');
  assert.equal(plan.question, link.question);
  assert.equal(plan.requiresReview, true);
  assert.equal(plan.linkReview, true);
  assert.deepEqual(plan.links, [link.first]);
  const question = `Do you have ${link.first} experience?`;
  assert.equal(
    planAnswer(question, {
      links: [link.first],
      rules: [{ ...rule, question }],
    }).requiresReview,
    false
  );
});

test('target metadata retains ordering and repetition while enforcing finite bounds', () => {
  assert.deepEqual(messageLinkProperties(), {});
  assert.deepEqual(messageLinkProperties([]), {});
  assert.deepEqual(
    messageLinkProperties([link.first, link.second, link.first]),
    {
      links: [link.first, link.second, link.first],
    }
  );
  for (const links of [
    null,
    'url',
    [''],
    [1],
    Array(21).fill('x'),
    ['x'.repeat(2001)],
    Array(4).fill('x'.repeat(2000)),
  ]) {
    assert.throws(() => planAnswer(link.question, { links }), {
      code: 'question-links-invalid',
    });
  }
  for (const links of [Array(21).fill(link.first), ['http://']]) {
    withHistory(
      [incoming('1', link.question), { body: link.question, links }],
      (read) => {
        assert.equal(read('read').code, 'answer-history-unverified');
      }
    );
  }
  assert.throws(
    () =>
      planAnswer(link.question, {
        links: [link.first],
        pendingMessages: [incoming('1', link.question)],
        rules: [rule],
      }),
    /destinations must match pending messages/u
  );
});

test('native review and frozen choices retain coherent destinations in the whole pending turn', () => {
  const snapshot = browserQuestion();
  snapshot.question.links = [link.first];
  snapshot.pendingTurn = browserPendingTurn([
    incoming('100', 'Earlier message', [link.second]),
    incoming('101', link.question, [link.first]),
  ]);
  const checked = checkBrowserQuestion(snapshot);
  assert.deepEqual(checked.question.links, [link.first]);
  assert.deepEqual(checked.pendingTurn.messages[0].links, [link.second]);
  const draft = browserChoiceDraft(
    { target: { source: 'hh' }, snapshot: checked },
    'Yes'
  );
  assert.deepEqual(draft.answer.turn.messages[0].links, [link.first]);
  assert.deepEqual(draft.answer.pendingTurn, checked.pendingTurn);
  snapshot.question.links = [link.second];
  assert.equal(
    checkedBrowserPendingTurn(snapshot.pendingTurn, snapshot.question),
    null
  );
  assert.throws(() => checkBrowserQuestion(snapshot), {
    code: 'question-browser-unverified',
  });
});

test('an earlier hidden destination cannot disappear behind a completed summary', () => {
  const summary = summaryChoiceMessage().body;
  for (const messages of [
    [incoming('1', summary, [link.first]), incoming('2', link.question)],
    [incoming('1', link.question, [link.first]), incoming('2', summary)],
  ]) {
    for (const strictOptions of [false, true]) {
      const plan = planAnswer(messages.at(-1).body, {
        rules: [rule],
        pendingMessages: messages,
        strictOptions,
        options: strictOptions ? ['Yes', 'No'] : [],
      });
      assert.equal(plan.requiresReview, true);
      assert.deepEqual(plan.parts.find((part) => part.linkReview)?.links, [
        link.first,
      ]);
    }
  }
});

test('accepted-summary recovery cannot approve a newly hidden destination', async () => {
  const store = createMemoryStore();
  await store.put(summaryChoiceMessage());
  const plan = await previewAnswer(store, {
    ...summaryChoiceInput,
    links: [link.first],
  });
  assert.equal(plan.match, 'accepted-summary');
  assert.equal(plan.text, 'YES');
  assert.equal(plan.requiresReview, true);
  assert.equal(plan.linkReview, true);
});

test(
  'a mocked model draft retains the hidden-destination review reason',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const { profile } = await seedModelAnswers(store);
    const calls = [];
    const plan = await previewAnswer(
      store,
      {
        question: modelQuestion,
        links: [link.first],
        modelDraft: true,
        profileId: profile.id,
      },
      { runner: modelRunnerFixture(calls) }
    );
    assert.equal(calls.length, 1);
    assert.equal(plan.match, 'model');
    assert.equal(plan.linkReview, true);
    assert.deepEqual(plan.links, [link.first]);
    assert.equal(plan.requiresReview, true);
  }
);

test('five shared provider plans and their final history recheck preserve target identity', async () => {
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    const message = {
      ...incoming(`msg:${source}:7:1`, link.question, [link.first]),
      source,
      chat: '7',
      sender: 'them',
      timestamp: new Date().toISOString(),
    };
    const automation = {
      id: 'hidden-links',
      mode: 'auto',
      action: { kind: 'answer-questions' },
      conditions: { mutual: false, cooldownDays: 0 },
    };
    const plan = planAutomation([rule, message], automation, {
      self: ['me'],
      targets: [{ source, chat: '7' }],
    });
    assert.equal(plan.drafts.length, 1, source);
    const draft = plan.drafts[0];
    assert.equal(draft.answer.requiresReview, true, source);
    assert.deepEqual(draft.answer.turn.messages[0].links, [link.first]);
    const store = createMemoryStore();
    await store.put(message);
    assert.equal(
      (await readChatAnswerInput(store, automation, draft)).ok,
      true
    );
    await store.put({ ...message, links: [link.second] });
    assert.equal(
      (await readChatAnswerInput(store, automation, draft)).code,
      'answer-changed'
    );
  }
});

test(
  'split earlier questions retain link review through aggregation and watcher admission',
  { timeout: 5000 },
  async () => {
    const env = await questionWatchFixture();
    try {
      env.state.snapshot.strictOptions = false;
      env.state.snapshot.answerOptions = [];
      env.state.snapshot.pendingTurn = browserPendingTurn([
        incoming('100', `${link.question} ${link.question}`, [link.first]),
        incoming('101', link.question),
      ]);
      const review = await env.browser.inspect(env.review.target);
      assert.equal(review.plan.match, 'pending-turn');
      assert.equal(review.plan.linkReview, true);
      env.input.review = review.id;
      await env.browser.watchStart(env.input);
      await env.until((value) => value.phase === 'review');
      assert.deepEqual(env.state.prefills, []);
      assert.deepEqual(env.state.sends, []);
      await env.browser.watchStop(env.input);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'the finite watcher neither selects nor prefills a hidden-link question',
  { timeout: 5000 },
  async () => {
    for (const strictOptions of [true, false]) {
      const env = await questionWatchFixture();
      try {
        env.state.snapshot.question.links = [link.first];
        env.state.snapshot.strictOptions = strictOptions;
        env.state.snapshot.answerOptions = strictOptions ? ['Yes', 'No'] : [];
        const review = await env.browser.inspect(env.review.target);
        env.input.review = review.id;
        await env.browser.watchStart(env.input);
        const status = await env.until((value) => value.phase === 'review');
        assert.equal(status.last.plan.linkReview, true);
        assert.deepEqual(env.state.sends, []);
        assert.deepEqual(env.state.prefills, []);
        await env.browser.watchStop(env.input);
        assert.equal(env.state.closes, 1);
      } finally {
        await env.browser.close();
      }
    }
  }
);
