import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationSalary } from '../../experiments/issue-56/application-salary-fixture.mjs';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { vacancyContent } from '../src/assignments/vacancy-content.js';
import { vacancySnapshot } from '../src/assignments/vacancy.js';

const publicRows = async (f) =>
  (await f.store.query()).filter(
    (row) => !row.id.startsWith('secret:jobs-application:')
  );
const assertOwnerUnchanged = (f) => {
  assert.deepEqual(f.visits, [applicationInput.url]);
  assert.equal(f.state.fields[1].value, 'Actual owner popup answer');
  assert.equal(f.state.submitted, 0);
  assert.deepEqual(f.state.writes, []);
};

const popup = async (t, options, readFirst = false) => {
  const f = applicationFixture(options);
  await f.service.stop();
  const open = f.serviceOptions.openSession;
  f.visits = [];
  f.serviceOptions.openSession = async (input) => {
    const browser = await open(input);
    browser.commander.goto = async ({ url }) => {
      f.visits.push(url);
    };
    return browser;
  };
  f.service = createVacancyService(f.serviceOptions);
  t.after(() => f.close());
  if (readFirst) {
    f.opened = await f.service['application-open'](applicationInput);
  }
  f.state.page.submit = {
    ...f.state.page.enter,
    qa: 'vacancy-response-submit-popup',
  };
  Object.assign(f.state.page, {
    enter: null,
    scope: true,
    questions: true,
    fieldIndices: [1],
    questionIndices: [1],
  });
  f.state.fields[1].value = 'Actual owner popup answer';
  return f;
};

test(
  'an existing native popup reads full vacancy context in place without navigating over owner answers',
  { timeout: 3000 },
  async (t) => {
    const f = await popup(t);
    const receipt = await f.service['application-open']({
      ...applicationInput,
      salary: applicationSalary,
    });
    assertOwnerUnchanged(f);
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.salaryAdmission.action, 'defer');
    const plan = f.state.calls.find(([kind]) => kind === 'plan')[1];
    assert.equal(plan.vacancy.title, 'Python engineer');
    assert.equal(plan.vacancy.salary, 'от 250 000 ₽');
    const cached = (await f.store.query()).find((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    assert.equal(
      vacancyContent(cached, applicationInput.url).description,
      vacancySnapshotFixture().description
    );
    assert.equal(
      JSON.stringify(cached).includes('Actual owner popup answer'),
      false
    );
  }
);

test(
  'test-mode popup inspection retains context without creating a public cache',
  { timeout: 3000 },
  async (t) => {
    const f = await popup(t);
    const receipt = await f.service['application-open']({
      ...applicationInput,
      testMode: true,
    });
    assert.equal(receipt.state, 'review');
    assert.equal(
      f.state.calls.find(([kind]) => kind === 'plan')[1].vacancy.title,
      'Python engineer'
    );
    assert.deepEqual(await publicRows(f), []);
    assertOwnerUnchanged(f);
  }
);

test(
  'a test preview preserves an existing public cache while planning with the current native context',
  { timeout: 3000 },
  async (t) => {
    const f = await popup(t);
    const saved = await vacancySnapshot(
      f.store,
      async () => ({
        ...vacancySnapshotFixture(),
        title: 'Previously cached title',
      }),
      applicationInput.url,
      true
    );
    await f.service['application-open']({
      ...applicationInput,
      testMode: true,
    });
    assert.deepEqual(await f.store.get(saved.id), saved);
    assert.equal(
      f.state.calls.find(([kind]) => kind === 'plan')[1].vacancy.title,
      'Python engineer'
    );
    assertOwnerUnchanged(f);
  }
);

test(
  'popup context refuses a different vacancy before caching or native effects',
  { timeout: 3000 },
  async (t) => {
    const f = await popup(t, {
      vacancy: () => ({
        ...vacancySnapshotFixture(),
        url: 'https://hh.ru/vacancy/456',
      }),
    });
    await assert.rejects(f.service['application-open'](applicationInput), {
      code: 'jobs-application-vacancy',
    });
    assert.deepEqual(await publicRows(f), []);
    assertOwnerUnchanged(f);
  }
);

for (const salary of ['', null]) {
  test(
    `cached application context distinguishes ${salary === null ? 'unreadable' : 'unadvertised'} native salary`,
    { timeout: 3000 },
    async (t) => {
      const f = await popup(
        t,
        {
          vacancy: () => ({ ...vacancySnapshotFixture(), salary }),
        },
        true
      );
      f.state.fields[1].label = 'Расскажите о вашем последнем опыте работы';
      const receipt = await f.service['application-read']({
        ...applicationInput,
        revision: f.opened.revision,
      });
      assert.equal(receipt.vacancy.salary, salary);
      assert.deepEqual(
        receipt.resumeContext,
        salary === null
          ? { language: null, reason: 'unreadable' }
          : { language: 'ru', reason: 'questions' }
      );
      assert.equal((await publicRows(f)).length, salary === null ? 0 : 1);
      assertOwnerUnchanged(f);
    }
  );
}
