import test from 'node:test';
import assert from 'node:assert/strict';
import {
  learnAnswerRules,
  createAnswerPairLearner,
} from '../src/automation/question-learning.js';
import { planAnswer } from '../src/automation/question-answers.js';
import { createAnswerContractor } from '../src/automation/question-contraction.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  learnSavedAnswers,
  saveAnswerRule,
  listAnswerRules,
} from '../src/automation/question-store.js';
import {
  noticeText,
  noticeReply,
  noticeRule,
} from '../../experiments/issue-56/notice-fixture.mjs';
import {
  noticeTurn,
  translatedNotices,
} from '../../experiments/issue-56/notice-learning-fixture.mjs';

test('actual notice replies learn unapproved normalized variants across providers and languages', () => {
  const turns = ['hh', 'telegram', 'vk', 'email', 'whatsapp'].flatMap(
    (source) =>
      noticeTurn({
        source,
        question: `Hello, Alice! ${noticeText}\nBest regards,\nRecruiter`,
      })
  );
  for (const [
    index,
    [core, greeting, signature],
  ] of translatedNotices.entries()) {
    turns.push(
      ...noticeTurn({
        chat: `locale-${index}`,
        question: greeting + core + signature,
      })
    );
  }
  const original = globalThis.structuredClone(turns);
  const rules = learnAnswerRules([...turns].reverse().concat(turns[1]));
  assert.equal(rules.length, 4);
  assert.ok(rules.every((rule) => rule.kind === 'notice'));
  const english = rules.find((rule) => rule.question === noticeText);
  assert.equal(english.answers[0].count, 5);
  assert.equal(english.answers[0].approved, false);
  assert.equal(english.answers[0].evidence.length, 5);
  assert.equal(english.id, learnAnswerRules(noticeTurn())[0].id);
  for (const [core] of translatedNotices) {
    assert.equal(
      rules.find((rule) => rule.question === core).answers[0].count,
      1
    );
  }
  assert.deepEqual(turns, original, 'transcripts remain unchanged');
  const result = planAnswer(noticeText, { rules });
  assert.equal(result.text, noticeReply);
  assert.equal(result.notice, true);
  assert.equal(result.requiresReview, true);
});

test('notice learning requires a delivered owner reply to the actual current turn', () => {
  for (const patch of [
    { pending: true },
    { failed: true },
    { delivery: 'unknown' },
    { status: 'sending' },
    { deleted: true },
    { service: true },
    { sender: 'other' },
    { replyTo: 'msg:hh:notice:unrelated' },
    { timestamp: '2026-11-13T12:00:00Z' },
    { body: 'What happens next?' },
    { body: '' },
  ]) {
    const [incoming, outgoing] = noticeTurn();
    assert.deepEqual(
      learnAnswerRules([incoming, { ...outgoing, ...patch }]),
      [],
      JSON.stringify(patch)
    );
  }
  for (const patch of [
    { deleted: true },
    { service: true },
    { timestamp: 'unknown' },
  ]) {
    const [incoming, outgoing] = noticeTurn();
    assert.deepEqual(
      learnAnswerRules([{ ...incoming, ...patch }, outgoing]),
      []
    );
  }
  const [incoming, outgoing] = noticeTurn();
  assert.equal(
    learnAnswerRules([
      incoming,
      { ...outgoing, sender: 'owner', outgoing: true },
    ]).length,
    1
  );
  assert.equal(
    learnAnswerRules([incoming, { ...outgoing, sender: 'owner' }], {
      self: ['owner'],
    }).length,
    1
  );
});

test('silence, markers, greetings, invitations and application barriers cannot invent notice observations', () => {
  assert.deepEqual(learnAnswerRules(noticeTurn().slice(0, 1)), []);
  assert.deepEqual(
    learnAnswerRules(noticeTurn({ answer: '[без ответа]' })),
    []
  );
  for (const question of [
    'Hello!',
    'Thanks!',
    'Please send your passport.',
    `${noticeText} Interview on Monday.`,
    `${noticeText}\nBest regards, where do you live?`,
    `${noticeText} https://candidate.example.test/private/cv/7`,
  ]) {
    const rules = learnAnswerRules(noticeTurn({ question }));
    assert.ok(
      rules.every((rule) => rule.kind !== 'notice'),
      question
    );
  }
  const [incoming, outgoing] = noticeTurn();
  assert.deepEqual(
    learnAnswerRules([
      incoming,
      {
        ...incoming,
        id: 'msg:hh:notice:barrier',
        timestamp: '2026-11-11T12:00:00.500Z',
        service: true,
        body: '',
      },
      outgoing,
    ]),
    []
  );
  assert.deepEqual(
    learnAnswerRules([incoming, { ...outgoing, chat: 'other' }]),
    []
  );
});

test('a question reminder cannot redirect its substantive answer to an earlier notice', () => {
  const [incoming, outgoing] = noticeTurn({
    answer: 'Five years in distributed teams.',
  });
  const reminder = {
    ...incoming,
    id: 'msg:hh:notice:reminder',
    body: 'Can we continue our conversation?',
    timestamp: '2026-11-11T12:00:00.500Z',
  };
  const rules = learnAnswerRules([incoming, reminder, outgoing]);
  assert.equal(rules.length, 1);
  assert.notEqual(rules[0].kind, 'notice');
  assert.equal(rules[0].question, reminder.body);
});

test('notice corrections normalize greetings, retain scope and remove wrong historical variants', () => {
  const corrected = noticeRule({
    question: `Hello! ${noticeText}\nBest regards,\nRecruiter`,
    sources: ['hh'],
    chats: ['hh:notice'],
    answers: [{ text: noticeReply, count: 0, approved: true, canonical: true }],
  });
  const wrong = 'A wrong historical notice reply.';
  assert.deepEqual(
    learnAnswerRules(noticeTurn({ answer: wrong }), { rules: [corrected] }),
    []
  );
  assert.equal(
    learnAnswerRules(noticeTurn(), { rules: [corrected] })[0].answers[0].text,
    noticeReply
  );
  assert.equal(
    learnAnswerRules(noticeTurn({ source: 'vk', answer: wrong }), {
      rules: [corrected],
    })[0].answers[0].text,
    wrong
  );
  const old = noticeRule({
    id: 'qa-rule:old-notice',
    answers: [{ text: wrong, approved: true, count: 99 }],
  });
  const result = planAnswer(noticeText, {
    rules: [corrected, old],
    source: 'hh',
    chat: 'notice',
  });
  assert.deepEqual(
    result.alternatives.map((entry) => entry.text),
    [noticeReply]
  );
});

test('notice corrections and non-question form-label corrections remain separate', () => {
  const corrected = noticeRule({
    answers: [{ text: noticeReply, approved: true, canonical: true }],
  });
  const text = 'An actual form field value.';
  const learner = createAnswerPairLearner({ rules: [corrected] });
  learner.add(noticeText, text, ['form:actual']);
  assert.equal(learner.values().length, 1);
  assert.notEqual(learner.values()[0].kind, 'notice');
  const field = { ...corrected, kind: 'question' };
  const rules = learnAnswerRules(noticeTurn({ answer: text }), {
    rules: [field],
  });
  assert.equal(rules[0].kind, 'notice');
  assert.equal(rules[0].answers[0].text, text);
  assert.notEqual(rules[0].id, learner.values()[0].id);
});

test('notice learning retains rejection, clarification, privacy and current contact contraction guards', () => {
  for (const answer of [
    'https://example.test/private/cv/7',
    '[уточнить: email]',
    '{{answer:email}}',
  ]) {
    assert.deepEqual(learnAnswerRules(noticeTurn({ answer })), []);
  }
  assert.deepEqual(
    learnAnswerRules(noticeTurn(), { policy: { rejected: [noticeReply] } }),
    []
  );
  const profile = { email: 'owner@example.test' };
  const learned = learnAnswerRules(noticeTurn({ answer: profile.email }), {
    profile,
    contract: createAnswerContractor({ contract: true, profile }),
  });
  assert.equal(learned[0].answers[0].text, '{{email}}');
});

test(
  'archive notice previews, replayed counts and existing review decisions remain stable',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const messages = [...noticeTurn(), ...noticeTurn({ start: 2 })];
    for (const message of messages.reverse()) {
      await store.put(message);
    }
    const preview = await learnSavedAnswers(store);
    assert.equal(preview.rules.length, 1);
    assert.equal(preview.rules[0].kind, 'notice');
    assert.equal(preview.rules[0].answers[0].count, 2);
    assert.deepEqual(await listAnswerRules(store), []);
    const [saved] = (await learnSavedAnswers(store, { apply: true })).rules;
    await saveAnswerRule(store, {
      ...saved,
      sources: ['hh'],
      answers: [{ ...saved.answers[0], approved: true, canonical: true }],
    });
    const [again] = (await learnSavedAnswers(store, { apply: true })).rules;
    assert.equal(again.answers[0].count, 2);
    assert.equal(again.answers[0].approved, true);
    assert.equal(again.answers[0].canonical, true);
    assert.deepEqual(again.sources, ['hh']);
    assert.deepEqual(await store.get(messages[0].id), messages[0]);
  }
);

test(
  'a notice archive mutation refuses before saving any proposals',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const message of noticeTurn()) {
      await store.put(message);
    }
    const get = store.get;
    let changed = false;
    store.get = async (id, project) => {
      if (id.startsWith('msg:') && !changed) {
        changed = true;
        const [, outgoing] = noticeTurn({
          answer: 'Owner edited during inspection.',
        });
        await store.put(outgoing);
      }
      return get(id, project);
    };
    await assert.rejects(
      learnSavedAnswers(store, { apply: true }),
      /archive changed/u
    );
    assert.deepEqual(await listAnswerRules(store), []);
  }
);
