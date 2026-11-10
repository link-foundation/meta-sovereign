import test from 'node:test';
import assert from 'node:assert/strict';
import { plainAnswerText } from '../src/automation/answer-plain-text.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  seedModelAnswers,
  modelQuestion,
} from '../../experiments/issue-56/forms-model-fixture.mjs';

test(
  'plain drafts remove presentation while preserving the substantive text',
  { timeout: 3000 },
  () => {
    for (const [input, expected] of [
      [
        '# Experience ###\n\n- **Browser tools**\n2. _Testing_ and ~~maintenance~~',
        'Experience\n\nBrowser tools\nTesting and maintenance',
      ],
      [
        '> ## Summary\n> __Accessible__ *interfaces*\n---',
        'Summary\nAccessible interfaces',
      ],
      ['Summary\n===\n***bold and italic***', 'Summary\nbold and italic'],
      [
        '[portfolio](https://example.test/a_(b)) and [mail](mailto:ada@example.test)',
        'portfolio (https://example.test/a_(b)) and mail (mailto:ada@example.test)',
      ],
      [
        '![diagram](https://example.test/diagram.png)',
        'diagram (https://example.test/diagram.png)',
      ],
      ['[https://example.test](https://example.test)', 'https://example.test'],
      [
        'Use `C#` and ``snake_case``; 2**3**4, C++ and -5 stay literal.',
        'Use C# and snake_case; 2**3**4, C++ and -5 stay literal.',
      ],
      ['```single-line code```', 'single-line code'],
      [
        '```js\nconst x = "**literal**";\n// # code\n```',
        'const x = "**literal**";\n// # code',
      ],
      ['~~~text\n- keep this code\n~~~\nAfter', '- keep this code\nAfter'],
      [
        '\\# literal, \\*literal\\* and C:\\projects',
        '# literal, *literal* and C:\\projects',
      ],
      [
        '**Нячанг** и _Вьетнам_; **भारत**; **中文**',
        'Нячанг и Вьетнам; भारत; 中文',
      ],
      [
        'snake_case and snake__case__name; unmatched ** stays',
        'snake_case and snake__case__name; unmatched ** stays',
      ],
    ]) {
      assert.equal(plainAnswerText(input), expected, input);
    }
  }
);

test(
  'malformed searches and nesting have finite limits and refuse oversized drafts',
  { timeout: 3000 },
  () => {
    for (const input of ['x'.repeat(6001), '['.repeat(6000)]) {
      assert.throws(() => plainAnswerText(input), {
        code: 'answer-model-response',
      });
    }
    assert.equal(plainAnswerText('x'.repeat(6000)).length, 6000);
    assert.equal(plainAnswerText('`'.repeat(6000)), '');
  }
);

const draftPlan = async (text, options = {}) => {
  const store = createMemoryStore();
  await seedModelAnswers(store);
  if (options.rejected) {
    await saveAnswerPolicy(store, { rejected: options.rejected });
  }
  return planFormAnswers(
    store,
    {
      inspection: inspection([field(modelQuestion, options.field)]),
      approximate: false,
      modelDraft: true,
    },
    {
      runner: async ({ prompt }) => ({
        drafts: JSON.parse(prompt).questions.map(({ id }) => ({
          id,
          text,
          missing: options.missing ?? [],
          evidence: ['cv:model-fixture'],
        })),
      }),
    }
  );
};

test(
  'form plans convert drafts before proposals and keep exact provided choice labels',
  { timeout: 5000 },
  async () => {
    const prose = await draftPlan(
      '## Background\n- **Browser interfaces**\n- [Portfolio](https://example.test/portfolio)'
    );
    assert.deepEqual(prose.fields[0].answer.proposal, {
      value:
        'Background\nBrowser interfaces\nPortfolio (https://example.test/portfolio)',
    });
    for (const text of ['**Remote**', 'Remote']) {
      const choice = await draftPlan(text, {
        field: {
          type: 'select',
          options: [
            { label: text, value: 'remote', selected: false, disabled: false },
          ],
        },
      });
      assert.deepEqual(choice.fields[0].answer.proposal, {
        value: 'remote',
        option: text,
      });
    }
    const decorated = await draftPlan('**Remote**', {
      field: {
        type: 'select',
        options: [
          {
            label: 'Remote',
            value: 'remote',
            selected: false,
            disabled: false,
          },
        ],
      },
    });
    assert.deepEqual(decorated.fields[0].answer.proposal, {
      value: 'remote',
      option: 'Remote',
    });
  }
);

test(
  'converted empty or rejected drafts refuse; unknown facts remain unselectable clarification',
  { timeout: 5000 },
  async () => {
    for (const [text, rejected] of [
      ['---', []],
      ['not`ready`', ['notready']],
      ['**Forbidden claim**', ['Forbidden claim']],
    ]) {
      const result = await draftPlan(text, { rejected });
      assert.equal(result.planning.model.state, 'refused');
      assert.equal(result.fields[0].answer.proposal, null);
    }
    const unknown = await draftPlan('', {
      missing: ['**What starting date?**'],
    });
    assert.equal(
      unknown.fields[0].answer.text,
      '[clarify: What starting date?]'
    );
    assert.equal(unknown.fields[0].answer.proposal, null);
  }
);

test(
  'plain conversion leaves approved owner wording and observed owner values unchanged',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await seedModelAnswers(store);
    await saveAnswerRule(store, {
      id: 'owner-literal',
      question: modelQuestion,
      answers: [{ text: '**Owner-chosen wording**', approved: true }],
    });
    const result = await planFormAnswers(
      store,
      {
        inspection: inspection([
          field(modelQuestion, { value: '*Existing owner answer*' }),
        ]),
        modelDraft: true,
      },
      { runner: () => assert.fail('approved answer needs no model') }
    );
    assert.equal(
      result.fields[0].answer.proposal.value,
      '**Owner-chosen wording**'
    );
    assert.equal(result.fields[0].value, '*Existing owner answer*');
    assert.equal(result.fields[0].answer.preserveCurrent, true);
    assert.equal(result.planning.model.state, 'unneeded');
  }
);
