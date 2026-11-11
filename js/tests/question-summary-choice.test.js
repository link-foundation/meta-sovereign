import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  createAcceptedSummaryIndex,
  readAcceptedSummaries,
} from '../src/automation/question-summary-choice.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  previewAnswer,
  saveAnswerRule,
  learnSavedAnswers,
} from '../src/automation/question-store.js';
import {
  summaryChoiceMessage,
  summaryChoiceInput,
} from '../../experiments/issue-56/summary-choice-fixture.mjs';

const seeded = async (...messages) => {
  const store = createMemoryStore();
  await store.putMany(messages.length ? messages : [summaryChoiceMessage()]);
  return store;
};
const accepted = (answer) => {
  assert.equal(answer.text, 'YES');
  assert.equal(answer.option, 'YES');
  assert.equal(answer.complete, true);
  assert.equal(answer.requiresReview, false);
  assert.equal(answer.match, 'accepted-summary');
  assert.deepEqual(answer.evidence, ['msg:hh:accepted:20']);
};

test('a unique incoming completed summary selects the exact current label without learning or writing', async () => {
  const store = await seeded();
  const before = await store.query();
  accepted(await previewAnswer(store, summaryChoiceInput));
  assert.deepEqual(await store.query(), before);
  assert.equal(
    (
      await previewAnswer(store, {
        ...summaryChoiceInput,
        options: [],
        strictOptions: false,
      })
    ).text,
    ''
  );
});

test('accepted summary resolves a rejected free-text attempt while preserving unapproved zero-count learning', async () => {
  const store = await seeded();
  await saveAnswerRule(store, {
    id: 'attempt',
    question: summaryChoiceInput.question,
    answers: [
      { text: 'I have a detailed background in this area.', approved: true },
    ],
  });
  accepted(await previewAnswer(store, summaryChoiceInput));
  const learned = await learnSavedAnswers(store, { apply: true });
  const answer = learned.rules
    .flatMap((rule) => rule.answers)
    .find((value) => value.text === 'Yes.');
  assert.equal(answer.count, 0);
  assert.equal(answer.approved, false);
});

test('conflicting summaries block recovery and a changed subject is never guessed', async () => {
  const store = await seeded(
    summaryChoiceMessage(),
    summaryChoiceMessage({
      id: 'msg:vk:other:21',
      source: 'vk',
      chat: 'other',
      body: `Your answers:\n${summaryChoiceInput.question}: No.`,
    })
  );
  const conflict = await previewAnswer(store, summaryChoiceInput);
  assert.equal(conflict.text, '');
  assert.equal(conflict.requiresReview, true);
  assert.equal(conflict.acceptedSummary.state, 'conflict');
  const other = await previewAnswer(await seeded(), {
    ...summaryChoiceInput,
    question: summaryChoiceInput.question.replace(
      'distributed services',
      'embedded electronics'
    ),
  });
  assert.equal(other.text, '');
});

test('outgoing, incomplete, malformed and unavailable summaries never prove acceptance', async () => {
  for (const extra of [
    { outgoing: true },
    { out: true },
    { sender: 'me' },
    { deleted: true },
    { service: true },
    { pending: true },
    { failed: true },
    { delivery: 'unknown' },
    { timestamp: '' },
    {
      body: `Your answers:\n${summaryChoiceInput.question}: Yes.\nPlease send a new assignment.`,
    },
    { body: `${summaryChoiceInput.question}: Yes.` },
    { body: `Your answers:\n${summaryChoiceInput.question}: Why do you ask?` },
  ]) {
    const answer = await previewAnswer(
      await seeded(summaryChoiceMessage(extra)),
      summaryChoiceInput
    );
    assert.equal(answer.text, '', JSON.stringify(extra));
    assert.equal(answer.requiresReview, true);
  }
});

test('duplicate options and unmatched accepted answers do not become automatic choices', async () => {
  for (const options of [['Yes', 'YES', 'No'], ['No'], ['Maybe', 'Unknown']]) {
    const answer = await previewAnswer(await seeded(), {
      ...summaryChoiceInput,
      options,
    });
    assert.equal(answer.text, '');
    assert.equal(answer.requiresReview, true);
  }
});

test('explicit owner corrections and rejections outrank summary recovery', async () => {
  const store = await seeded();
  await saveAnswerRule(store, {
    id: 'correction',
    question: summaryChoiceInput.question,
    answers: [{ text: 'No', canonical: true, approved: false }],
  });
  let answer = await previewAnswer(store, summaryChoiceInput);
  assert.equal(answer.requiresReview, true);
  assert.notEqual(answer.match, 'accepted-summary');
  await saveAnswerRule(store, {
    id: 'correction',
    question: summaryChoiceInput.question,
    answers: [{ text: 'No', canonical: true, approved: true }],
  });
  answer = await previewAnswer(store, summaryChoiceInput);
  assert.equal(answer.option, 'NO');
  assert.equal(answer.requiresReview, false);
});

test('summary evidence cannot be supplied by a request or used for a form field or salary baseline', async () => {
  const forged = {
    entries: [
      {
        question: summaryChoiceInput.question,
        text: 'Yes',
        evidence: 'invented',
      },
    ],
    limited: false,
  };
  assert.equal(
    (
      await previewAnswer(createMemoryStore(), {
        ...summaryChoiceInput,
        acceptedSummaries: forged,
      })
    ).text,
    ''
  );
  assert.equal(
    (
      await previewAnswer(await seeded(), {
        ...summaryChoiceInput,
        questionMode: 'field',
      })
    ).text,
    ''
  );
  const question = 'What are your salary expectations in USD net?';
  const salary = await previewAnswer(
    await seeded(
      summaryChoiceMessage({ body: `Your answers:\n${question}: Above 7000` })
    ),
    { ...summaryChoiceInput, question, options: ['Above 7000', 'Below 7000'] }
  );
  assert.equal(salary.text, '');
  const followup = 'And gross?';
  const continued = await previewAnswer(
    await seeded(
      summaryChoiceMessage({ body: `Your answers:\n${followup}: Above 7000` })
    ),
    {
      ...summaryChoiceInput,
      question: followup,
      options: ['Above 7000', 'Below 7000'],
      recent: [{ text: question }],
      salary: {
        enabled: true,
        approved: false,
        defaultCurrency: 'USD',
        currencies: [
          { code: 'USD', keywords: ['USD'], net: 7000, gross: 8000 },
        ],
      },
    }
  );
  assert.equal(continued.requiresReview, true);
  assert.notEqual(continued.match, 'accepted-summary');
});

test('finite index limits and concurrent archive changes never authorize a partial match', async () => {
  for (const limits of [{ maxBytes: 1 }, { maxMessages: 0 }, { maxPairs: 0 }]) {
    const index = createAcceptedSummaryIndex(limits);
    index.accept(summaryChoiceMessage());
    const answer = planAnswer(summaryChoiceInput.question, {
      ...summaryChoiceInput,
      acceptedSummaries: index.snapshot(),
    });
    assert.equal(answer.text, '');
    assert.equal(answer.acceptedSummary.state, 'limited');
  }
  const store = await seeded();
  const scan = store.scan;
  store.scan = async (...args) => {
    await scan(...args);
    await store.put(summaryChoiceMessage({ body: 'The summary changed.' }));
  };
  assert.equal((await readAcceptedSummaries(store)).limited, true);
});

test('summary question matching respects case settings and significant technical subjects', async () => {
  const question = 'Do you have C# experience?';
  const store = await seeded(
    summaryChoiceMessage({ body: `Your answers:\n${question}: Yes.` })
  );
  assert.equal(
    (await previewAnswer(store, { ...summaryChoiceInput, question })).text,
    'YES'
  );
  for (const other of [
    'Do you have C experience?',
    'Do you have C++ experience?',
  ]) {
    assert.equal(
      (await previewAnswer(store, { ...summaryChoiceInput, question: other }))
        .text,
      ''
    );
  }
  assert.equal(
    (
      await previewAnswer(store, {
        ...summaryChoiceInput,
        question: question.toUpperCase(),
        matching: { caseSensitive: true },
      })
    ).text,
    ''
  );
});

test('rejected answers stay manual and repeated summaries never inflate owner frequency', async () => {
  const store = await seeded(
    summaryChoiceMessage(),
    summaryChoiceMessage({ id: 'msg:hh:accepted:21' })
  );
  const answer = await previewAnswer(store, summaryChoiceInput);
  assert.equal(answer.option, 'YES');
  assert.equal(answer.count, 0);
  assert.equal(answer.evidence.length, 2);
  await saveAnswerPolicy(store, { rejected: ['Yes'] });
  const rejected = await previewAnswer(store, summaryChoiceInput);
  assert.equal(rejected.requiresReview, true);
  assert.notEqual(rejected.match, 'accepted-summary');
});

test('later outgoing history identifies and excludes an earlier unflagged owner summary', async () => {
  const store = await seeded(
    summaryChoiceMessage({ sender: 'owner-id' }),
    summaryChoiceMessage({
      id: 'msg:hh:owner:22',
      sender: 'owner-id',
      outgoing: true,
      body: 'An actual owner message',
    })
  );
  assert.equal((await previewAnswer(store, summaryChoiceInput)).text, '');
});
