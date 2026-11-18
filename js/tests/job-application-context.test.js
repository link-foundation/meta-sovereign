import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  resumeContextDecision,
  applicationResumeContext,
} from '../src/jobs/application-resume-context.js';
import { applicationContextFixture } from '../../experiments/issue-56/application-context-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationResult } from '../src/jobs/application-result.js';

test('employer language precedence excludes shell dollars and prefers full context over titles', () => {
  const russian = 'Расскажите о вашем последнем опыте работы';
  const english = 'Describe your most recent professional experience';
  const cases = [
    [
      { questions: [russian], vacancy: { salary: '4,000 USD' } },
      'en',
      'dollar-pay',
    ],
    [
      { questions: [russian], vacancy: { salary: '5000 USDT' } },
      'en',
      'dollar-pay',
    ],
    [
      { questions: [russian], vacancy: { description: 'Оплата 3000 USDC' } },
      'en',
      'dollar-pay',
    ],
    [
      { questions: ['Ожидаемая компенсация в $ или рублях?'] },
      'en',
      'dollar-pay',
    ],
    [
      { questions: [russian], vacancy: { salary: '$ 4000' } },
      'en',
      'dollar-pay',
    ],
    [
      { questions: [russian], vacancy: { salary: '4000 $' } },
      'en',
      'dollar-pay',
    ],
    [
      { questions: [russian], vacancy: { salary: '4,000.50 $' } },
      'en',
      'dollar-pay',
    ],
    [
      { questions: [russian], vacancy: { salary: 'доллары США' } },
      'en',
      'dollar-pay',
    ],
    [
      { questions: [english], vacancy: { description: russian } },
      'en',
      'questions',
    ],
    [
      { questions: [russian], vacancy: { description: english } },
      'ru',
      'questions',
    ],
    [
      { vacancy: { title: russian, description: english } },
      'en',
      'description',
    ],
    [
      { vacancy: { title: english, description: russian } },
      'ru',
      'description',
    ],
    [{ vacancy: { title: russian } }, 'ru', 'title'],
    [{ questions: ['API?'] }, null, 'unknown'],
  ];
  for (const token of [
    '$SALARY',
    '$USD',
    '${USD}',
    '$(salary)',
    '$(',
    '${',
    '${USD',
    '$(USD',
  ]) {
    cases.push([
      { questions: [`Ожидаемая зарплата; shell ${token}`] },
      'ru',
      'questions',
    ]);
  }
  for (const [input, language, reason] of cases) {
    assert.deepEqual(resumeContextDecision(input), { language, reason });
  }
});

test(
  'context chooses from checked exports, preserves owner values and never enters or sends',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    fixture.state.fields[0].label = 'Expected salary USD'; // Outside the bound questionnaire.
    fixture.state.fields[1].value = 'My desired salary is 8000 USD';
    fixture.state.page.letter = {
      value: 'Owner letter: 9000 USD',
      index: 2,
      disabled: false,
    };
    const receipt = await fixture.service['application-read'](
      identity(fixture.entered)
    );
    await assert.rejects(fixture.context(receipt, { confirm: false }), {
      code: 'jobs-application-confirmation',
    });
    const result = await fixture.context(receipt);
    assert.deepEqual(receipt.resumeContext, {
      language: 'ru',
      reason: 'questions',
    });
    assert.equal(result.resumeSelection.hash, 'english');
    assert.equal(result.resumeSelection.languageProof.language, 'ru');
    assert.equal(fixture.state.page.letter.value, 'Owner letter: 9000 USD');
    assert.equal(
      fixture.state.fields[1].value,
      'My desired salary is 8000 USD'
    );
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.entered, 1);
    assert.deepEqual(fixture.state.writes, []);
    applicationResult(result, identity(result, { action: 'context' }));
    const saved = await fixture.store.get('secret:jobs-application:jobs:123');
    assert(!JSON.stringify(saved).includes('languageProof'));
    assert(!Object.hasOwn(saved, 'resumeContext'));
  }
);

test(
  'an already verified matching CV is a passive confirmation even on repeated reads',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    const selected = await fixture.context(fixture.entered);
    const menus = fixture.state.menuClicks;
    let receipt = selected;
    for (let count = 0; count < 3; count++) {
      receipt = await fixture.service['application-read'](identity(receipt));
      assert.equal(receipt.resumeSelection, undefined);
      const priorRevision = receipt.revision;
      receipt = await fixture.context(receipt);
      assert.notEqual(receipt.revision, priorRevision);
      assert.equal(receipt.resumeSelection.hash, 'english');
    }
    assert.equal(fixture.state.menuClicks, menus);
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'missing desired-language exports and preview never open a native chooser',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t, {
      vacancy: { salary: '5000 USD' },
    });
    assert.deepEqual(fixture.entered.resumeContext, {
      language: 'en',
      reason: 'dollar-pay',
    });
    await assert.rejects(fixture.context(fixture.entered), {
      code: 'jobs-application-resume-export',
    });
    assert.equal(fixture.state.menuClicks, 0);
    assert.equal(fixture.state.resumeWrites, 0);
    const preview = await applicationContextFixture(t, {
      application: { testMode: true },
    });
    Object.assign(preview.state.page, {
      submit: { qa: 'vacancy-response-submit-popup', disabled: false },
      enter: null,
      scope: true,
      questions: true,
      fieldIndices: [1],
    });
    const read = await preview.service['application-read'](
      identity(preview.entered)
    );
    assert.equal((await preview.context(read)).state, 'test-preview');
    assert.equal(preview.state.menuClicks, 0);
    assert.equal(preview.state.resumeWrites, 0);
  }
);

test(
  'unreadable employer coverage refuses before reading exports or opening native controls',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    fixture.state.page.questionIndices = [1, 99];
    const read = await fixture.service['application-read'](
      identity(fixture.entered)
    );
    assert.deepEqual(read.resumeContext, {
      language: null,
      reason: 'unreadable',
    });
    await assert.rejects(fixture.context(read), {
      code: 'jobs-application-resume-context',
    });
    assert.equal(fixture.state.menuClicks, 0);
    assert.deepEqual(
      applicationResumeContext({
        page: { bound: true },
        vacancy: { salary: null },
      }),
      { language: null, reason: 'unreadable' }
    );
  }
);

test(
  'context changes during asynchronous export validation refuse without a native effect',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    const get = fixture.store.get.bind(fixture.store);
    fixture.store.get = async (id) => {
      const result = await get(id);
      if (id.startsWith('jobs-resume-export:')) {
        fixture.state.fields[1].label =
          'Describe your most recent professional experience';
      }
      return result;
    };
    await assert.rejects(fixture.context(fixture.entered), {
      code: 'jobs-application-changed',
    });
    assert.equal(fixture.state.menuClicks, 0);
    assert.equal(fixture.state.resumeWrites, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test('only known native CV radios may account for partial unlabelled coverage', () => {
  const record = {
    vacancy: {},
    page: {
      bound: true,
      questions: true,
      questionIndices: [2],
      resumeIndices: [1],
      resumeChooser: { open: true, ambiguous: false },
    },
    report: {
      coverage: 'partial',
      navigation: { limited: false, nextPage: false },
      omissions: [],
      frames: [{ reasons: ['unlabelled-controls'] }],
      fields: [
        { frame: 'frame-1', index: 1, type: 'radio', label: '' },
        {
          frame: 'frame-1',
          index: 2,
          type: 'textarea',
          label: 'Расскажите о вашем последнем опыте работы',
        },
      ],
    },
  };
  assert.deepEqual(applicationResumeContext(record), {
    language: 'ru',
    reason: 'questions',
  });
  const refuse = (changed) =>
    assert.deepEqual(applicationResumeContext(changed), {
      language: null,
      reason: 'unreadable',
    });
  refuse({ ...record, page: { ...record.page, resumeIndices: [99] } });
  refuse({
    ...record,
    report: { ...record.report, frames: [{ reasons: ['unexpanded-options'] }] },
  });
  record.report.fields[1].label = '';
  refuse(record);
});

test(
  'corrupted evidence refuses before menu access and cannot be inferred from the Latin CV title',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    await writeFile(join(fixture.folder, 'resume.json'), 'tampered');
    await assert.rejects(fixture.context(fixture.entered), {
      code: 'jobs-export-unconfirmed',
    });
    assert.equal(fixture.state.menuClicks, 0);
    assert.equal(fixture.state.resumeWrites, 0);
  }
);

test(
  'known exports absent from the actual chooser close it once without guessing or sending',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    let opened = await fixture.menu(fixture.entered);
    fixture.state.page.resumeChooser.options[1].hash = 'unobserved';
    opened = await fixture.service['application-read'](identity(opened));
    await assert.rejects(fixture.context(opened), {
      code: 'jobs-application-resume-export',
    });
    assert.equal(fixture.state.page.resumeChooser.open, false);
    assert.equal(fixture.state.menuClicks, 2);
    assert.equal(fixture.state.resumeWrites, 0);
  }
);

test(
  'portable context evidence rejects contradictory decisions and mismatched CV language',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    const receipt = await fixture.context(fixture.entered);
    for (const resumeContext of [
      null,
      { language: 'en', reason: 'dollar-pay' },
      { language: 'ru', reason: 'dollar-pay' },
      { language: null, reason: 'questions' },
      { language: 'de', reason: 'description' },
    ]) {
      assert.throws(
        () =>
          applicationResult(
            { ...receipt, resumeContext },
            identity(receipt, { action: 'context' })
          ),
        { code: 'jobs-application-unconfirmed' }
      );
    }
  }
);

test('observed verified candidates prefer an already checked CV, then their latest update', async () => {
  const { chooseContextResume } =
    await import('../src/jobs/application-context-choice.js');
  const entries = ['old', 'new', 'title-only', 'other-language'].map(
    (hash, index) => ({
      hash,
      title: hash,
      updatedAt: 1000 + index,
      latest: false,
      ...(hash === 'title-only'
        ? {}
        : {
            languageProof: {
              language: hash === 'other-language' ? 'en' : 'ru',
            },
          }),
    })
  );
  const chooser = {
    open: true,
    options: entries.map((row) => ({
      hash: row.hash,
      title: row.title,
      disabled: false,
      checked: row.hash === 'old',
    })),
  };
  const list = { entries };
  assert.equal(chooseContextResume(chooser, list, 'ru').hash, 'old');
  chooser.options[0].checked = false;
  assert.equal(chooseContextResume(chooser, list, 'ru').hash, 'new');
  chooser.options[1].disabled = true;
  assert.equal(chooseContextResume(chooser, list, 'ru').hash, 'old');
  chooser.options[0].title = 'Changed title';
  assert.equal(chooseContextResume(chooser, list, 'ru'), undefined);
});

test(
  'full-form recovery retains collected employer salary without refetching or native actions',
  { timeout: 5000 },
  async () => {
    const { applicationRecoveryFixture } =
      await import('../../experiments/issue-56/application-recovery-fixture.mjs');
    const { createVacancyService } = await import('../src/jobs/service.js');
    const { applicationInput } =
      await import('../../experiments/issue-56/application-fixture.mjs');
    let recovered,
      reads = 0;
    const fixture = applicationRecoveryFixture({
      application: {
        readPage: async () =>
          globalThis.structuredClone({
            ...fixture.state.page,
            questionIndices: [1],
          }),
      },
    });
    const open = fixture.serviceOptions.openSession;
    fixture.serviceOptions.openSession = async (input) => {
      const browser = await open(input);
      const evaluate = browser.commander.evaluate;
      browser.commander.evaluate = async (...args) => {
        reads++;
        return {
          ...(await evaluate(...args)),
          salary: reads === 1 ? '8000 USD' : '200000 RUB',
        };
      };
      return browser;
    };
    await fixture.service.stop();
    fixture.service = createVacancyService(fixture.serviceOptions);
    fixture.state.fields[1].label = 'Расскажите о вашем последнем опыте работы';
    try {
      const receipt = await fixture.enter();
      assert.deepEqual(receipt.resumeContext, {
        language: 'en',
        reason: 'dollar-pay',
      });
      await fixture.service.stop();
      recovered = createVacancyService(fixture.serviceOptions);
      const restored = await recovered['application-open']({
        ...applicationInput,
        recover: true,
      });
      assert.equal(restored.vacancy.salary, '8000 USD');
      assert.deepEqual(restored.resumeContext, receipt.resumeContext);
      assert.equal(reads, 1);
      assert.equal(fixture.state.entered, 1);
      assert.equal(fixture.state.submitted, 0);
      assert.deepEqual(fixture.state.writes, []);
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);
