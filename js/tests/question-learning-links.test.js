import test from 'node:test';
import assert from 'node:assert/strict';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { learnArchivedAnswers } from '../src/automation/question-archive.js';
import { createMemoryStore } from '../src/storage/universal.js';

const message = (id, body, outgoing = false, extra = {}) => ({
  id: `msg:hh:7:${id}`,
  source: 'hh',
  chat: '7',
  sender: outgoing ? 'me' : 'recruiter',
  outgoing,
  body,
  timestamp: `2026-11-11T10:0${id}:00Z`,
  ...extra,
});
const turn = () => [
  message(1, 'Do you have distributed systems experience?'),
  message(2, 'Yes, five years.', true),
];
const credentialTarget = new URL('https://example.test/profile');
credentialTarget.username = 'fixture-owner';
credentialTarget.password = 'fixture-value';
const privateTargets = [
  ['https://example.test/private/access'],
  ['https://example.test/form?signature=private'],
  ['https://t.me/+private-invite'],
  [credentialTarget.href],
  ['https://example.test/form#private'],
  ['tg://resolve?domain=private'],
  ['https://example.test/%zz'],
  ['not-a-url'],
  ['javascript:void(0)'],
  [null],
  'https://example.test/private/access',
  ['x'.repeat(2001)],
];

test('hidden private or malformed link targets exclude question and answer proposals', () => {
  for (const links of privateTargets) {
    for (const index of [0, 1]) {
      const messages = turn();
      messages[index].links = links;
      assert.deepEqual(learnAnswerRules(messages), []);
    }
  }
});

test('a private continuation discards preceding public answer fragments and blocks adjacency', () => {
  for (const links of privateTargets) {
    assert.deepEqual(
      learnAnswerRules([
        ...turn(),
        message(3, 'See this link.', true, { links }),
        message(4, 'Five years, including incident response.', true),
      ]),
      []
    );
    assert.deepEqual(
      learnAnswerRules([
        turn()[0],
        message(2, 'Read this first.', false, { links }),
        message(3, 'Yes, five years.', true),
      ]),
      []
    );
  }
});

test('private hidden links in an incoming accepted summary cannot seed answers', () => {
  const summary = message(
    1,
    'Your answers:\nDo you have distributed systems experience?: Yes, five years.'
  );
  assert.equal(learnAnswerRules([summary]).length, 1);
  assert.deepEqual(
    learnAnswerRules([{ ...summary, links: privateTargets[0] }]),
    []
  );
});

test('public targets and legacy rows retain unapproved learning', () => {
  for (const links of [undefined, [], ['https://example.test/public/docs']]) {
    const messages = turn().map((row) => ({ ...row, links }));
    const rules = learnAnswerRules(messages);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].answers[0].text, 'Yes, five years.');
    assert.equal(rules[0].answers[0].approved, false);
  }
});

test('the archive projection retains hidden target barriers without returning private URLs', async () => {
  for (const links of privateTargets) {
    const store = createMemoryStore();
    for (const row of turn().map((row) => ({ ...row, links }))) {
      await store.put(row);
    }
    const result = await learnArchivedAnswers(store);
    assert.deepEqual(result.rules, []);
    assert.equal(result.coverage.retained, 2);
    assert.equal(JSON.stringify(result).includes('private/access'), false);
  }
});
