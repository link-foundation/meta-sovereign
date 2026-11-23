import test from 'node:test';
import assert from 'node:assert/strict';
import { matchQuestion } from '../src/automation/question-match.js';
import { planAnswer } from '../src/automation/question-answers.js';
import { textLinks, linkOf } from '../src/message-links.js';
import { planAutomation } from '../src/automation/automations.js';
import {
  templateLinkExample as example,
  templateRequestExample,
} from '../../experiments/issue-56/question-template-fixture.mjs';

const rule = {
  id: example.id,
  question: example.pattern,
  answers: [{ text: example.answer, approved: true }],
};

test('a reviewed URL cannot authorize an additional template URL', () => {
  assert.equal(matchQuestion(example.pattern, example.question), null);
  const plan = planAnswer(example.question, { rules: [rule] });
  assert.equal(plan.requiresReview, true);
  assert.notEqual(plan.match, 'template');
});

test('template gaps reject bare, international and action links', () => {
  for (const link of [
    'example.com',
    't.me/recruiter',
    'example.zip/manual',
    'resume.pdf',
    'пример.рф/анкета',
    'tg://join/abc',
    'x://join/abc',
    'ftp://example.test/file',
    'mailto:recruiter@example.test',
  ]) {
    assert.equal(
      matchQuestion('Experience … details', `Experience ${link} details`),
      null,
      link
    );
  }
});

test('exact normalization cannot hide path case, scheme or query differences', () => {
  for (const [left, right] of [
    ['https://example.test/Case', 'https://example.test/case'],
    ['https://example.test/path', 'http://example.test/path'],
    ['https://example.test/?a=b', 'https://example.test/?a/b'],
    ['https://example.test/?a=b!', 'https://example.test/?a=b'],
    ['https://example.test/?a=b?', 'https://example.test/?a=b'],
    ['tg://join/abc', 'tg://join:abc'],
  ]) {
    assert.equal(matchQuestion(`Review ${left}`, `Review ${right}`), null);
  }
});

test('unchanged targets and ordinary technical filenames retain matching', () => {
  assert.equal(
    matchQuestion(
      example.pattern,
      'Do you have https://company.test professional experience?'
    ),
    'template'
  );
  assert.equal(
    matchQuestion(
      'Review https://example.test/Case',
      'Review https://example.test/Case'
    ),
    'exact'
  );
  assert.equal(matchQuestion('Where … live?', 'Where you live?'), 'template');
  assert.deepEqual(
    textLinks('Node.js .NET notes.md local.py name@example.test'),
    []
  );
  assert.equal(
    matchQuestion('Node.js experience?', 'node.js experience?'),
    'exact'
  );
});

for (const [sample, expectedDrafts, name] of [
  [example, 1, 'changed destinations require review'],
  [templateRequestExample, 0, 'an added request holds the old answer'],
]) {
  test(`shared provider plans: ${name}`, () => {
    for (const source of [
      'hh',
      'telegram',
      'vk',
      'email',
      'facebook',
      'whatsapp',
    ]) {
      const plan = planAutomation(
        [
          {
            id: `qa-rule:${sample.id}`,
            question: sample.pattern,
            answers: [{ text: sample.answer, approved: true }],
          },
          {
            id: `msg:${source}:7:1`,
            source,
            chat: '7',
            sender: 'them',
            body: sample.question,
            timestamp: new Date().toISOString(),
          },
        ],
        {
          id: sample.id,
          mode: 'auto',
          action: { kind: 'answer-questions' },
          conditions: { mutual: false, cooldownDays: 0 },
        },
        { self: ['me'], targets: [{ source, chat: '7' }] }
      );
      assert.equal(plan.drafts.length, expectedDrafts, source);
      for (const draft of plan.drafts) {
        assert.equal(draft.answer.requiresReview, true, source);
        assert.notEqual(draft.answer.match, 'template', source);
      }
    }
  });
}

test('shared link scanning retains every target while HTTP previews skip action schemes', () => {
  const input =
    'tg://join/abc mailto:recruiter@example.test https://example.test/Case, example.org/a https://example.test/Case';
  assert.deepEqual(textLinks(input), [
    'tg://join/abc',
    'mailto:recruiter@example.test',
    'https://example.test/Case,',
    'example.org/a',
    'https://example.test/Case',
  ]);
  assert.equal(linkOf(input), 'https://example.test/Case');
  assert.equal(linkOf('tg://join/abc notes.md'), null);
  assert.equal(linkOf('prefix_example.com'), null);
  assert.equal(linkOf('Пример: пример.рф/путь.'), 'пример.рф/путь');
});
