import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { seedApplicationAnswerContext } from '../../../experiments/issue-56/application-answer-context-fixture.mjs';
import { configureApplicationAnswerContext } from '../../../experiments/issue-56/application-answer-context-ui.mjs';
import { exerciseSalaryBatchUi } from '../../../experiments/issue-56/application-salary-batch-ui.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';

export const verifyApplicationSalaryBatch = async (browser) => {
  const outcomes = [];
  const fixture = await applicationNativeFixture(browser, {
    vacancyIds: ['123', '456'],
    salary: (id) => (id === '123' ? 'от 400000 ₽' : 'от 600000 ₽'),
    onApplicationClose: (outcome) => outcomes.push(outcome),
  });
  const directory = process.env.SALARY_BATCH_SCREENSHOTS;
  const before = process.env.SALARY_BATCH_BEFORE === '1';
  try {
    await seedApplicationAnswerContext(fixture.store);
    await fixture.page.goto(fixture.base);
    const result = await exerciseSalaryBatchUi(
      fixture.page,
      applicationPanelBrowser,
      configureApplicationAnswerContext,
      {
        before,
        screenshot: directory
          ? async (name, batch) => {
              await mkdir(directory, { recursive: true });
              await batch.screenshot({
                path: `${directory}/application-salary-batch-${name}.png`,
              });
            }
          : undefined,
      }
    );
    assert.equal(
      outcomes.reduce((n, row) => n + row.attempts, 0),
      before ? 1 : 2
    );
    assert.equal(
      outcomes.reduce((n, row) => n + row.entries, 0),
      0
    );
    assert.equal(
      fixture.records.every((row) => row.closed),
      true
    );
    assert.deepEqual(fixture.errors, []);
    return {
      ...result,
      nativeOutcomes: outcomes,
      resourcesClosed: true,
      liveProvider: false,
    };
  } catch (error) {
    console.log(
      'Salary batch refusal',
      await fixture.page
        .locator('[data-application-panel]')
        .innerText()
        .catch(() => 'missing')
    );
    console.log('Salary batch outcomes', JSON.stringify(outcomes));
    if (directory) {
      await fixture.page
        .screenshot({
          path: `${directory}/application-salary-batch-failed.png`,
          fullPage: true,
        })
        .catch(() => {});
    }
    throw error;
  } finally {
    await fixture.close();
  }
};
