import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAnswerPlanning } from '../src/automation/question-browser-vacancy.js';
import { previewAnswer } from '../src/automation/question-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { clarificationSalary as salary } from '../../experiments/issue-56/salary-clarification-fixture.mjs';
import {
  salaryVacancyQuestion as question,
  salaryVacancyAnswer as expected,
  salaryVacancyUrl as url,
  salaryVacancySnapshot as page,
  salaryVacancyQuestionSnapshot as snapshot,
} from '../../experiments/issue-56/salary-vacancy-fixture.mjs';

test('browser salary reviews lazily read and reuse the verified vacancy instead of a default currency', async () => {
  let reads = 0;
  const env = await questionBrowserFixture({
    readVacancy: async (value, options) => {
      reads++;
      assert.equal(value, url);
      assert.equal(options.browserSlot, 'question-vacancy');
      assert.equal(options.useCase, 'messages');
      assert.equal(options.signal.aborted, false);
      return page(value);
    },
  });
  try {
    Object.assign(env.state.snapshot, snapshot());
    const [first, second] = await Promise.all([
      env.browser.inspect({ ...browserTarget, salary }),
      env.browser.inspect({ ...browserTarget, salary }),
    ]);
    assert.equal(first.plan.text, expected);
    assert.equal(second.plan.text, expected);
    assert.equal(reads, 1);
    assert.equal(first.plan.contexts[0].source, 'vacancy-pay');
    await env.browser.prefill(first);
    assert.equal(env.state.prefills[0].text, expected);
    assert.equal(env.state.sends.length, 0);
    const cached = await env.store.query((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    assert.equal(cached.length, 1);
    assert.equal(cached[0].description, page().description);
  } finally {
    await env.browser.close();
  }
});

test(
  'salary watches replace derived context when the observed vacancy changes',
  { timeout: 5000 },
  async () => {
    const reads = [];
    const env = await questionWatchFixture({
      readVacancy: async (value) => {
        reads.push(value);
        return page(value, value === url ? {} : { salary: '6 000 EUR' });
      },
    });
    try {
      Object.assign(env.state.snapshot, snapshot());
      env.input.review = (
        await env.browser.inspect({ ...browserTarget, salary })
      ).id;
      await env.browser.watchStart(env.input);
      assert.equal(
        (await env.until((value) => value.last?.plan?.text === expected)).phase,
        'review'
      );
      env.state.snapshot.noticeContext.vacancyUrl = 'https://hh.ru/vacancy/456';
      const changed = await env.until(
        (value) => value.last?.plan?.salary?.currency === 'EUR'
      );
      assert.equal(changed.last.plan.text, 'From 5 500 € net per month.');
      assert.deepEqual(reads, [url, 'https://hh.ru/vacancy/456']);
      await env.browser.watchStop(env.input);
      assert.equal(env.state.closes, 1);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'unread salary review uses native vacancy context without model opt-in',
  { timeout: 5000 },
  async () => {
    let reads = 0;
    const env = await unreadAnswerFixture({
      rows: [snapshot({ chat: '8' })],
      readVacancy: async () => {
        reads++;
        return page();
      },
    });
    try {
      const result = await env.complete({
        ...env.input,
        salary,
        modelDraft: false,
      });
      assert.equal(result.entries[0].answer.phase, 'prefilled');
      assert.deepEqual(env.state.prefills, [{ chat: '8', text: expected }]);
      assert.equal(reads, 1);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await env.browser.close();
    }
  }
);

test('salary vacancy reads are skipped for known, invariant, unrelated or owner-held replies', async () => {
  let reads = 0;
  const plan = createBrowserAnswerPlanning({
    store: createMemoryStore(),
    readVacancy: async () => {
      reads++;
      return page();
    },
  });
  const cases = [
    [
      { salary },
      snapshot({
        question: {
          id: '101',
          body: 'What are your salary expectations in EUR?',
          outgoing: false,
        },
      }),
    ],
    [{ salary, recent: ['We pay in EUR.'] }, snapshot()],
    [{ salary, vacancy: { pay: '5 000 EUR' } }, snapshot()],
    [{ salary: { ...salary, currencies: [salary.currencies[0]] } }, snapshot()],
    [
      { salary },
      snapshot({
        question: { id: '101', body: 'What is your role?', outgoing: false },
      }),
    ],
    [{ salary }, snapshot({ hasDraft: true })],
    [
      { salary },
      snapshot({
        noticeContext: { ...snapshot().noticeContext, canReply: false },
      }),
    ],
    [{ salary }, snapshot({ noticeContext: undefined })],
    [
      { salary },
      snapshot({
        noticeContext: {
          ...snapshot().noticeContext,
          vacancyUrl: 'https://hh.ru.evil.test/vacancy/123',
        },
      }),
    ],
  ];
  for (const [input, observed] of cases) {
    await plan(input, observed, browserTarget);
  }
  await plan({ salary }, snapshot(), { source: 'vk' });
  assert.equal(reads, 0);
});

test('native vacancy pay, title and complete description retain ordered currency evidence', async () => {
  for (const [patch, currency] of [
    [
      {
        salary: '5 000 EUR',
        title: 'USD engineer',
        description: 'RUB compensation',
      },
      'EUR',
    ],
    [
      { salary: '', title: 'USD engineer', description: 'EUR compensation' },
      'USD',
    ],
    [{ salary: '', description: 'EUR compensation' }, 'EUR'],
    [
      {
        salary: '',
        description: `${'We welcome all teams. '.repeat(700)} EUR compensation`,
      },
      'EUR',
    ],
    [
      {
        salary: '',
        description: `${'Long vacancy text. '.repeat(700)} GBP compensation`,
      },
      null,
    ],
    [{ salary: 'USD or EUR' }, null],
  ]) {
    const store = createMemoryStore();
    const planning = await createBrowserAnswerPlanning({
      store,
      readVacancy: async () => page(url, patch),
    })({ salary }, snapshot(), browserTarget);
    const result = await previewAnswer(store, {
      salary,
      question,
      ...planning,
    });
    assert.equal(result.salary.currency, currency);
    if (!currency) {
      assert.equal(result.complete, false);
    }
    const saved = await store.query((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    assert.equal(saved[0].description, page(url, patch).description);
  }
});

test('unreadable or mismatched vacancy pages never produce a fabricated default draft', async () => {
  for (const reader of [
    async () => {
      throw Object.assign(new Error('CAPTCHA fixture'), {
        code: 'assignment-vacancy-unavailable',
      });
    },
    async () => page('https://hh.ru/vacancy/999'),
  ]) {
    const env = await questionBrowserFixture({ readVacancy: reader });
    try {
      Object.assign(env.state.snapshot, snapshot());
      await assert.rejects(env.browser.inspect({ ...browserTarget, salary }));
      assert.equal(env.state.prefills.length, 0);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await env.browser.close();
    }
  }
});

test(
  'closing browser review aborts and drains an admitted vacancy read',
  { timeout: 5000 },
  async () => {
    let admitted;
    const started = new Promise((resolve) => {
      admitted = resolve;
    });
    let drained = false;
    const env = await questionBrowserFixture({
      readVacancy: async (_, { signal }) => {
        admitted();
        try {
          await new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
          );
        } finally {
          drained = true;
        }
      },
    });
    Object.assign(env.state.snapshot, snapshot());
    const inspection = env.browser.inspect({ ...browserTarget, salary });
    const refused = assert.rejects(inspection);
    try {
      await started;
      await env.browser.close();
      await refused;
      assert.equal(drained, true);
      assert.equal(env.state.prefills.length, 0);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await env.browser.close();
    }
  }
);
