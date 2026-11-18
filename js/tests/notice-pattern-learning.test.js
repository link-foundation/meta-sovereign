import test from 'node:test';
import assert from 'node:assert/strict';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import {
  planAnswer,
  normalizeAnswerRule,
} from '../src/automation/question-answers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  learnSavedAnswers,
  listAnswerRules,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import {
  noticeTurn,
  noticePatternVariant as variant,
  noticePatternUnseen as unseen,
} from '../../experiments/issue-56/notice-learning-fixture.mjs';
import { withNoticePatterns } from '../src/automation/notice-pattern-learning.js';
import {
  noticeText,
  noticeReply,
} from '../../experiments/issue-56/notice-fixture.mjs';

const observations = () => [
  ...noticeTurn(),
  ...noticeTurn({ chat: 'variant', question: variant }),
];

test('actual related notices regenerate learned ordered-word patterns for review', () => {
  const rules = learnAnswerRules(observations());
  assert.equal(rules.length, 2);
  assert.ok(rules.every((rule) => rule.learnedPatterns?.length === 1));
  const [pattern] = rules[0].learnedPatterns;
  assert.match(pattern, /…/u);
  assert.match(pattern, /experience\*/u);
  assert.equal(rules[1].learnedPatterns[0], pattern);
  const result = planAnswer(unseen, { rules, approximate: false });
  assert.equal(result.text, noticeReply);
  assert.equal(result.match, 'template');
  assert.equal(result.learnedPattern, true);
  assert.equal(result.requiresReview, true);
  assert.ok(
    rules.every(
      (rule) => rule.answers[0].count === 1 && !rule.answers[0].approved
    )
  );
});

test('unrelated notices, different replies and questions never join a learned template', () => {
  for (const turn of [
    noticeTurn({
      chat: 'other',
      question:
        'Your documents have been archived for the next financial year.',
    }),
    noticeTurn({
      chat: 'other',
      question: variant,
      answer: 'I have withdrawn my application.',
    }),
    noticeTurn({
      chat: 'other',
      question: 'Have you received the application and reviewed my experience?',
    }),
  ]) {
    assert.ok(
      learnAnswerRules([...noticeTurn(), ...turn]).every(
        (rule) => !rule.learnedPatterns?.length
      )
    );
  }
  const rules = learnAnswerRules(observations());
  for (const text of [
    `${unseen} What is your salary?`,
    `${unseen} Please send your passport.`,
    `${unseen} https://example.test/private/cv`,
  ]) {
    assert.notEqual(
      planAnswer(text, { rules, approximate: false }).text,
      noticeReply
    );
  }
});

test('generated patterns cannot authorize no-reply or replace explicit owner aliases', () => {
  const [learned] = learnAnswerRules(observations());
  const rule = {
    ...learned,
    answers: [{ text: '[без ответа]', approved: true }],
  };
  const proposed = planAnswer(unseen, { rules: [rule], approximate: false });
  assert.equal(proposed.noReply, false);
  assert.equal(proposed.requiresReview, true);
  assert.equal(proposed.text, '');
  const adopted = planAnswer(unseen, {
    rules: [{ ...rule, questions: learned.learnedPatterns }],
    approximate: false,
  });
  assert.equal(adopted.noReply, true);
  assert.equal(adopted.requiresReview, false);
});

test('generated patterns do not broaden a canonical correction before owner adoption', () => {
  const learned = learnAnswerRules(observations()).find(
    (rule) => rule.question === noticeText
  );
  const corrected = {
    ...learned,
    answers: [{ text: noticeReply, canonical: true, approved: true }],
  };
  const messages = noticeTurn({
    question: unseen,
    answer: 'A different actual response.',
  });
  assert.equal(learnAnswerRules(messages, { rules: [corrected] }).length, 1);
  assert.deepEqual(
    learnAnswerRules(messages, {
      rules: [{ ...corrected, questions: learned.learnedPatterns }],
    }),
    []
  );
});

test('notice pattern metadata is bounded and rejected on question records', () => {
  const [rule] = learnAnswerRules(observations());
  assert.deepEqual(
    normalizeAnswerRule(rule).learnedPatterns,
    rule.learnedPatterns
  );
  for (const learnedPatterns of [
    ['Why … now?'],
    ['Please send … passport'],
    ['plain text'],
    Array(101).fill('message … recorded'),
  ]) {
    assert.throws(
      () => normalizeAnswerRule({ ...rule, learnedPatterns }),
      /pattern/u
    );
  }
  assert.throws(
    () => normalizeAnswerRule({ ...rule, kind: 'question' }),
    /notice/u
  );
});

test('Russian, Hindi and Chinese notice variations retain review-only patterns', () => {
  for (const [left, right] of [
    [
      'Мы изучили ваше резюме. Опыт разработки соответствует позиции, позже свяжемся с вами.',
      'Спасибо, ваше резюме сохранено. Опытный разработчик соответствует позиции, скоро свяжемся с вами.',
    ],
    [
      'हम आपके आवेदन और अनुभव की समीक्षा कल करेंगे।',
      'हम आपके आवेदन और अनुभव की समीक्षा जल्दी करेंगे।',
    ],
    ['我们会审核您的申请资料', '我们会审核您的申请经验'],
  ]) {
    const rules = learnAnswerRules([
      ...noticeTurn({ question: left }),
      ...noticeTurn({ chat: 'second', question: right }),
    ]);
    assert.equal(rules.length, 2);
    assert.ok(
      rules.every((rule) => rule.learnedPatterns?.length === 1),
      left
    );
    const result = planAnswer(rules[0].question, { rules });
    assert.equal(result.requiresReview, true);
  }
});

test('similar replies can share a pattern but negated or different numeric answers cannot', () => {
  for (const [answer, expected] of [
    ['Thank you, I will wait patiently.', true],
    ['Thank you, I will not wait.', false],
    ['Thank you, I will NOT wait.', false],
    ['I can wait for 2 days.', false],
  ]) {
    const rules = learnAnswerRules([
      ...noticeTurn(),
      ...noticeTurn({ chat: 'second', question: variant, answer }),
    ]);
    assert.equal(
      rules.every((rule) => rule.learnedPatterns.length === 1),
      expected,
      answer
    );
  }
});

test('finite pattern budgets refuse atomically without mutating observations', () => {
  const rules = learnAnswerRules(observations());
  const snapshot = globalThis.structuredClone(rules);
  for (const limit of [{ maxCells: 1 }, { maxComparisons: 0 }]) {
    assert.throws(() => withNoticePatterns(rules, limit), /capacity exceeded/u);
    assert.deepEqual(rules, snapshot);
  }
});

test('relearning preserves an owner change from a notice to a question record', async () => {
  const store = createMemoryStore();
  for (const message of observations()) {
    await store.put(message);
  }
  const first = await learnSavedAnswers(store, { apply: true });
  const rule = first.rules.find((entry) => entry.question === noticeText);
  await saveAnswerRule(store, {
    ...rule,
    kind: 'question',
    learnedPatterns: [],
  });
  const next = await learnSavedAnswers(store, { apply: true });
  const retained = next.rules.find((entry) => entry.id === rule.id);
  assert.equal(retained.kind, undefined);
  assert.equal(retained.learnedPatterns, undefined);
});

test(
  'relearning regenerates patterns while retaining original counts, approval and owner aliases',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const message of observations()) {
      await store.put(message);
    }
    const preview = await learnSavedAnswers(store);
    assert.equal(preview.rules[0].learnedPatterns.length, 1);
    assert.deepEqual(await listAnswerRules(store), []);
    const first = (await learnSavedAnswers(store, { apply: true })).rules;
    const rule = first.find((entry) => entry.question === noticeText);
    await saveAnswerRule(store, {
      ...rule,
      questions: ['A separately reviewed notice.'],
      answers: [{ ...rule.answers[0], approved: true }],
    });
    for (const message of noticeTurn({
      chat: 'third',
      question:
        'We have received a detailed application and will review your experience.',
    })) {
      await store.put(message);
    }
    const next = (await learnSavedAnswers(store, { apply: true })).rules.find(
      (entry) => entry.id === rule.id
    );
    assert.ok(next.learnedPatterns.length > rule.learnedPatterns.length);
    assert.equal(next.answers[0].count, 1);
    assert.equal(next.answers[0].approved, true);
    assert.deepEqual(next.questions, ['A separately reviewed notice.']);
    await store.delete('msg:hh:variant:1');
    await store.delete('msg:hh:variant:2');
    await store.delete('msg:hh:third:1');
    await store.delete('msg:hh:third:2');
    const remaining = (
      await learnSavedAnswers(store, { apply: true })
    ).rules.find((entry) => entry.id === rule.id);
    assert.deepEqual(
      remaining.learnedPatterns,
      [],
      'removed observations retire derived patterns'
    );
    assert.deepEqual(remaining.questions, ['A separately reviewed notice.']);
  }
);
