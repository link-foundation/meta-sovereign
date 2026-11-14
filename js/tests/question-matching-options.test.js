import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  questionMatchingFlags,
  questionMatchPageFlags,
} from '../src/cli/question-matching-flags.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  planAnswer,
  normalizeAnswerAction,
} from '../src/automation/question-answers.js';
import {
  matchQuestion,
  questionSimilarity,
} from '../src/automation/question-match.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { checkForm, toForm } from '../src/web/automations-model.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  matchingQuestions,
  seedMatchingAnswers,
} from '../../experiments/issue-56/question-matching-fixture.mjs';

const rule = (question, extra = {}) => ({
  id: 'qa-rule:matching',
  question,
  answers: [{ text: 'Reviewed city.', approved: true, count: 1 }],
  ...extra,
});
const plan = (matching, extra = {}) =>
  planAnswer(matchingQuestions.asked, {
    rules: [rule(matchingQuestions.saved)],
    matching,
    ...extra,
  });

test('owner threshold changes approximate eligibility without approving reuse', () => {
  assert.equal(plan().match, 'unanswered');
  const lower = plan({ threshold: 0.6 });
  assert.equal(lower.match, 'approximate');
  assert.equal(lower.similarity, 8 / 11);
  assert.equal(lower.requiresReview, true);
  assert.equal(plan({ threshold: 0.9 }).match, 'unanswered');
  assert.equal(
    plan({ threshold: 0.6 }, { approximate: false }).match,
    'unanswered'
  );
  assert.equal(
    planAnswer(matchingQuestions.saved, {
      rules: [rule(matchingQuestions.saved)],
      matching: { threshold: 1 },
    }).match,
    'exact'
  );
});

test('case sensitivity applies to exact, template and approximate comparisons', () => {
  const options = { caseSensitive: true };
  assert.equal(matchQuestion('Which CITY?', 'Which city?', options), null);
  assert.equal(
    matchQuestion('Which CITY …?', 'Which city now?', options),
    null
  );
  assert.equal(
    questionSimilarity('Which CITY?', 'Which city?', undefined, options),
    0.5
  );
  assert.equal(matchQuestion('Где ёлка?', 'Где елка?', options), 'exact');
  const input = {
    rules: [rule('Which CITY?')],
    matching: { ...options, threshold: 1 },
  };
  assert.equal(planAnswer('Which city?', input).match, 'unanswered');
  assert.equal(planAnswer('Which CITY?', input).match, 'exact');
  assert.equal(
    planAnswer('Which city?', { ...input, matching: { threshold: 1 } }).match,
    'exact'
  );
});

test('matching settings validate finite score ranges, booleans and page bounds', () => {
  for (const matching of [
    null,
    [],
    'low',
    { threshold: -0.1 },
    { threshold: 1.1 },
    { threshold: NaN },
    { threshold: '0.6' },
    { caseSensitive: 'true' },
  ]) {
    assert.throws(
      () => normalizeAnswerAction({ matching }),
      /matching|threshold|case/iu
    );
  }
  for (const matchPage of [
    null,
    [],
    { offset: -1 },
    { offset: 0.5 },
    { limit: 0 },
    { limit: 51 },
    { offset: '0' },
  ]) {
    assert.throws(() => plan(undefined, { matchPage }), /match page/iu);
  }
  assert.deepEqual(
    normalizeAnswerAction({ matching: { threshold: 0, caseSensitive: false } })
      .matching,
    { threshold: 0, caseSensitive: false }
  );
});

test('every eligible ranked match is inspectable across stable bounded pages', async () => {
  const store = createMemoryStore();
  await seedMatchingAnswers(store);
  const before = JSON.stringify(await store.query());
  const items = [];
  for (const offset of [0, 5, 10]) {
    const result = await previewAnswer(store, {
      question: matchingQuestions.asked,
      matching: { threshold: 0.6 },
      matchPage: { offset, limit: 5 },
    });
    assert.equal(result.matchResults.total, 12);
    assert.equal(result.matchResults.complete, true);
    assert.equal(result.matchResults.hasMore, offset < 10);
    assert.ok(result.matchResults.items.length <= 5);
    items.push(...result.matchResults.items);
  }
  assert.equal(new Set(items.map((item) => item.rule)).size, 12);
  assert.deepEqual(
    items.map((item) => item.count),
    Array.from({ length: 12 }, (_, i) => 11 - i)
  );
  assert.ok(
    items.every(
      (item) =>
        item.similarity === 8 / 11 && item.question === matchingQuestions.saved
    )
  );
  assert.equal(items[0].selected, true);
  assert.ok(items.slice(1).every((item) => !item.selected));
  assert.equal(
    (await previewAnswer(store, { question: matchingQuestions.saved }))
      .matchResults,
    undefined
  );
  assert.equal(JSON.stringify(await store.query()), before);
});

test('zero threshold and inspection retain subject, disabled, scope and rejected-answer guards', () => {
  const saved = 'How many years of experience do you have with Go?';
  const asked = saved.replace('Go', 'C#');
  const answer = planAnswer(asked, {
    rules: [rule(saved)],
    matching: { threshold: 0 },
    matchPage: {},
  });
  assert.equal(answer.match, 'unanswered');
  assert.equal(answer.matchResults.total, 0);
  for (const extra of [
    { enabled: false },
    { sources: ['hh'] },
    { chats: ['other'] },
  ]) {
    const result = plan(
      { threshold: 0 },
      {
        rules: [rule(matchingQuestions.saved, extra)],
        source: 'forms',
        chat: 'current',
        matchPage: {},
      }
    );
    assert.equal(result.matchResults.total, 0);
  }
  assert.equal(
    plan(
      { threshold: 0.6 },
      { policy: { rejected: ['Reviewed city'] }, matchPage: {} }
    ).matchResults.total,
    0
  );
});

test('rank inspection reports exhausted work budgets instead of claiming complete coverage', () => {
  const result = plan(
    { threshold: 0 },
    { matchBudget: { remaining: 0, exhausted: false }, matchPage: {} }
  );
  assert.equal(result.match, 'unanswered');
  assert.equal(result.matchResults.complete, false);
});

test('case-aware canonical corrections govern only their matching question', () => {
  const rules = [
    rule('Which CITY?', {
      id: 'qa-rule:canonical',
      answers: [{ text: 'Owner correction.', canonical: true, approved: true }],
    }),
    rule('Which city?', { id: 'qa-rule:lower' }),
  ];
  const options = {
    rules,
    matching: { threshold: 1, caseSensitive: true },
    matchPage: {},
  };
  assert.equal(planAnswer('Which city?', options).text, 'Reviewed city.');
  assert.equal(planAnswer('Which CITY?', options).text, 'Owner correction.');
  const folded = planAnswer('Which city?', {
    ...options,
    matching: { threshold: 1 },
  });
  assert.equal(folded.text, 'Owner correction.');
  assert.equal(folded.matchResults.total, 1);
});

test('CLI numeric flags reject missing values and boolean coercion', () => {
  for (const threshold of [true, false, '', ' ', 'NaN']) {
    assert.throws(
      () => questionMatchingFlags({ threshold }),
      /number|threshold/u
    );
  }
  assert.throws(
    () => questionMatchPageFlags({ 'match-offset': true }),
    /number/u
  );
  assert.throws(() => questionMatchPageFlags({ 'match-limit': '' }), /number/u);
  assert.deepEqual(questionMatchingFlags({ threshold: '0' }).matching, {
    threshold: 0,
    caseSensitive: false,
  });
});

test('saved automation and its editor retain optional matching settings', () => {
  const automation = normalizeAutomation({
    id: 'matching',
    action: {
      kind: 'answer-questions',
      matching: { threshold: 0.6, caseSensitive: true },
    },
  });
  const form = toForm(automation);
  assert.deepEqual(automation.action.matching, {
    threshold: 0.6,
    caseSensitive: true,
  });
  assert.deepEqual(form.matching, automation.action.matching);
  assert.deepEqual(checkForm(form, automation).automation, automation);
});

test('form fields share threshold and case controls while retaining owner values', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, rule(matchingQuestions.saved));
  const report = inspection([
    field(matchingQuestions.asked),
    { ...field('What is your CITY?'), id: 'case-field', value: 'Owner answer' },
  ]);
  const result = await planFormAnswers(store, {
    inspection: report,
    matching: { threshold: 0.6, caseSensitive: true },
  });
  assert.equal(result.fields[0].answer.proposal.value, 'Reviewed city.');
  assert.equal(result.fields[0].answer.requiresReview, true);
  assert.equal(result.fields[1].answer.preserveCurrent, true);
  assert.equal(result.fields[1].answer.matchResults, undefined);
});

test('inspection sorts scores before frequency and retains exact matched alias evidence', () => {
  const rules = [
    rule(matchingQuestions.saved, { id: 'qa-rule:lower' }),
    rule('Where do you live?', {
      id: 'qa-rule:alias',
      questions: [matchingQuestions.asked],
    }),
  ];
  const result = planAnswer(matchingQuestions.asked, {
    rules,
    matching: { threshold: 0.6 },
    matchPage: {},
  });
  assert.deepEqual(
    result.matchResults.items.map((item) => item.similarity),
    [1, 8 / 11]
  );
  assert.equal(result.matchResults.items[0].question, matchingQuestions.asked);
  assert.equal(result.matchResults.items[0].selected, true);
  assert.equal(result.matchResults.items[0].text, result.text);
});

test('case-aware padding removal preserves the actual first letter', () => {
  const options = {
    rules: [rule('Where do you live?')],
    matching: { caseSensitive: true, threshold: 1 },
  };
  assert.equal(
    planAnswer('Thanks. where do you live?', options).match,
    'unanswered'
  );
  assert.equal(
    planAnswer('Thanks. Where do you live?', options).match,
    'exact'
  );
});

test(
  'CLI, offline preview and both Lino transports share matching and bounded inspection',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await seedMatchingAnswers(store);
    const baseline = JSON.stringify(await store.query());
    const dir = await mkdtemp(join(tmpdir(), 'question-matching-'));
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      forms: { reportWriter: null },
    });
    const input = {
      question: matchingQuestions.asked,
      matching: { threshold: 0.6, caseSensitive: true },
      matchPage: { offset: 10, limit: 5 },
    };
    const verify = (result) => {
      assert.equal(result.match, 'approximate');
      assert.equal(result.requiresReview, true);
      assert.equal(result.matchResults.total, 12);
      assert.deepEqual(
        result.matchResults.items.map((item) => item.count),
        [1, 0]
      );
    };
    try {
      const output = [];
      const cli = createAutomationCommands({ openStore: async () => store });
      assert.equal(
        await cli.automations(
          {
            _: ['answers', 'plan'],
            question: input.question,
            threshold: '0.6',
            'case-sensitive': 'true',
            'match-offset': '10',
            'match-limit': '5',
            json: true,
          },
          (line) => output.push(JSON.parse(line))
        ),
        0
      );
      verify(output.at(-1));
      const api = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      verify(await api.previewAnswer(input));
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/plan`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(input, type),
          }
        );
        assert.equal(response.status, 200);
        verify(await readWireResponse(response));
      }
      const report = inspection([field(matchingQuestions.asked)]);
      const file = join(dir, 'inspection.json');
      await writeFile(file, JSON.stringify(report));
      const forms = createFormsCommands({
        openStore: async () => store,
        reportWriter: null,
      });
      await forms['forms-plan'](
        { file, threshold: '0.6', 'case-sensitive': true },
        (line) => output.push(JSON.parse(line))
      );
      assert.equal(
        output.at(-1).fields[0].answer.proposal.value,
        'Hanoi, district 12.'
      );
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/forms/plan`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(
              { inspection: report, matching: input.matching },
              type
            ),
          }
        );
        assert.equal(response.status, 200);
        assert.equal(
          (await readWireResponse(response)).fields[0].answer.proposal.value,
          'Hanoi, district 12.'
        );
      }
      assert.equal(JSON.stringify(await store.query()), baseline);
    } finally {
      await server.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
