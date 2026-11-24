import test from 'node:test';
import assert from 'node:assert/strict';
import { historyOrder } from '../src/replies/history-order.js';
import { chatQuestionTurn } from '../src/automation/question-chat-turn.js';
import { answerEnvironmentFromMessages } from '../src/automation/question-context.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { indexAnswerArchive } from '../src/automation/question-archive.js';
import { acceptedSummariesFromLinks } from '../src/automation/question-summary-choice.js';
import { unreadAnswerInput } from '../src/automation/question-unread-model.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  learnSavedAnswers,
  readChatAnswerInput,
} from '../src/automation/question-store.js';
import { planAutomation } from '../src/automation/automations.js';
import { summaryChoiceMessage } from '../../experiments/issue-56/summary-choice-fixture.mjs';
import {
  vkQuestionMessage,
  vkQuestionRule,
  vkQuestionAutomation,
} from '../../experiments/issue-56/question-vk-links-fixture.mjs';

const instant = Date.parse('2026-11-17T00:00:00Z');
const formats = [
  (at) => at / 1000,
  (at) => String(at / 1000),
  (at) => at,
  String,
  (at) => new Date(at).toISOString(),
];
const message = (id, timestamp, extra = {}) => ({
  id: `msg:vk:7:${id}`,
  source: 'vk',
  chat: '7',
  sender: 'them',
  body: 'Where do you live?',
  timestamp,
  ...extra,
});

test('mixed native seconds, milliseconds and ISO history sorts by instant and numeric ID', () => {
  const records = formats.map((format, id) =>
    message(id + 1, format(instant + id * 1000))
  );
  assert.deepEqual(records.toReversed().sort(historyOrder), records);
  const equal = formats.map((format, id) => message(id + 9, format(instant)));
  assert.deepEqual(equal.toReversed().sort(historyOrder), equal);
  const earlier = message(1, new Date(instant).toISOString());
  const later = message(2, (instant + 1000) / 1000);
  assert.deepEqual([later, earlier].sort(historyOrder), [earlier, later]);
});

test('native timestamp representations preserve raw frozen turn identity and final admission', async () => {
  for (const format of formats) {
    const raw = await vkQuestionMessage({ nativeTime: true });
    const current = {
      ...raw,
      raw: undefined,
      attachments: undefined,
      timestamp: format(instant),
    };
    const turn = chatQuestionTurn([current]);
    assert.equal(turn.reason, undefined);
    assert.equal(turn.turn.messages[0].timestamp, current.timestamp);
    const [draft] = planAutomation(
      [vkQuestionRule, current],
      vkQuestionAutomation,
      {
        self: ['me'],
        targets: [{ source: 'vk', chat: '7' }],
      }
    ).drafts;
    const store = createMemoryStore();
    await store.put(current);
    assert.equal(
      (await readChatAnswerInput(store, vkQuestionAutomation, draft)).ok,
      true
    );
    await store.put({ ...current, timestamp: format(instant + 1000) });
    assert.equal(
      (await readChatAnswerInput(store, vkQuestionAutomation, draft)).code,
      'answer-changed'
    );
  }
});

test('numeric native questions learn only delivered adjacent answers within one day', () => {
  for (const format of formats) {
    const question = message(1, format(instant));
    const answer = message(2, new Date(instant + 1000).toISOString(), {
      sender: 'me',
      body: 'Vietnam.',
    });
    assert.equal(
      learnAnswerRules([answer, question])[0]?.answers[0].text,
      'Vietnam.'
    );
    for (const extra of [
      { timestamp: format(instant + 86401000) },
      { delivery: 'unknown' },
      { service: true },
    ]) {
      assert.deepEqual(
        learnAnswerRules([question, { ...answer, ...extra }]),
        []
      );
    }
  }
});

test('small mixed-format archive retains original metadata and learns the real ordered pair', async () => {
  const store = createMemoryStore();
  const question = message(1, instant / 1000);
  const answer = message(2, new Date(instant + 1000).toISOString(), {
    sender: 'me',
    body: 'Vietnam.',
  });
  await store.putMany([answer, question]);
  const { chats } = await indexAnswerArchive(store);
  assert.equal([...chats.values()][0].invalid, false);
  assert.equal(
    [...chats.values()][0].entries.find(({ id }) => id === question.id)
      .timestamp,
    question.timestamp
  );
  const learned = await learnSavedAnswers(store);
  assert.equal(learned.rules[0]?.answers[0].text, 'Vietnam.');
  assert.equal(learned.coverage.retained, 2);
  assert.equal(learned.coverage.excludedChats, 0);
});

test('context uses consistent one-day chronology while retaining service and invalid barriers', () => {
  const latest = message(5, instant / 1000);
  const old = message(1, instant - 86401000);
  const recent = message(3, (instant - 1000) / 1000, {
    body: 'We pay in USD.',
  });
  assert.deepEqual(
    answerEnvironmentFromMessages([old, recent], latest).recent,
    [{ text: recent.body, evidence: recent.id }]
  );
  const barrier = message(4, instant - 500, { service: true });
  assert.deepEqual(
    answerEnvironmentFromMessages([recent, barrier], latest).recent,
    []
  );
});

test('accepted summaries recognize numeric timestamps without authorizing malformed chronology', () => {
  for (const format of formats) {
    assert.equal(
      acceptedSummariesFromLinks([
        summaryChoiceMessage({ timestamp: format(instant) }),
      ]).entries.length,
      1
    );
  }
  for (const timestamp of ['', null, {}, 'unknown', Infinity]) {
    assert.equal(
      acceptedSummariesFromLinks([summaryChoiceMessage({ timestamp })]).entries
        .length,
      0
    );
    assert.equal(
      chatQuestionTurn([message(1, timestamp)]).reason,
      'question-turn-unavailable'
    );
  }
});

test('acknowledged unread window keeps numeric native context for the exact question', async () => {
  const snapshot = {
    chat: '7',
    question: { id: '2', body: 'Where do you live?', outgoing: false },
  };
  const rows = [
    {
      id: '1',
      body: 'We pay in USD.',
      timestamp: (instant - 1000) / 1000,
      outgoing: true,
    },
    { ...snapshot.question, timestamp: instant / 1000 },
  ];
  let observed;
  await unreadAnswerInput(
    {
      recentWindow: () => ({ chat: '7', rows }),
      answerPlanning: async (planning) => {
        observed = planning.recent;
        return {};
      },
    },
    { source: 'vk', planning: { modelDraft: true } },
    snapshot
  );
  assert.deepEqual(observed, [
    { text: rows[0].body, evidence: 'msg:vk:7:1', outgoing: true },
  ]);
});
