import assert from 'node:assert/strict';
import { verifySalaryDraft } from './salary-draft-browser.mjs';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import {
  openQuestionPreview,
  openQuestionDisclosure,
  requestQuestionPreview,
} from './question-preview.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';
import {
  prioritySalary as salary,
  priorityQuestion as question,
  priorityVacancy as vacancy,
  priorityExpected as expected,
} from '../../../experiments/issue-56/salary-priority-fixture.mjs';

const verifyPriorityControl = async (browser) => {
  const fixture = await questionBrowserServer(browser);
  const page = await fixture.page.context().newPage();
  try {
    await page.addInitScript(
      ({ key, version }) => {
        globalThis.localStorage.setItem(
          key,
          JSON.stringify({ off: true, v: version })
        );
      },
      { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
    );
    await page.goto(`${fixture.base}/#/automation`);
    const { preview } = await openQuestionPreview(page);
    const controls = preview.locator('[data-answer-salary]');
    await openQuestionDisclosure(controls);
    await controls
      .getByRole('checkbox', {
        name: 'Use configured salary targets',
        exact: true,
      })
      .check();
    await controls
      .getByRole('checkbox', {
        name: 'Approve complete salary answers for automatic sending',
        exact: true,
      })
      .check();
    const entries = [
      salary.currencies.find((entry) => entry.code === 'USD'),
      salary.currencies.at(-1),
    ];
    for (const [index, entry] of entries.entries()) {
      if (index) {
        await controls
          .getByRole('button', { name: 'Add salary currency', exact: true })
          .click();
      }
      const fields = controls.locator('[data-salary-currency]').nth(index);
      await fields
        .getByLabel('Currency code, e.g. USD', { exact: true })
        .fill(entry.code);
      await fields
        .getByLabel('Currency words, comma-separated', { exact: true })
        .fill(entry.keywords.join(', '));
      await fields
        .getByLabel('Monthly net amount', { exact: true })
        .fill(String(entry.net));
    }
    const environment = preview.locator('[data-answer-environment]');
    await openQuestionDisclosure(environment);
    await environment
      .getByLabel('Vacancy description', { exact: true })
      .fill(vacancy.description);
    const priority = controls
      .locator('[data-salary-currency]')
      .last()
      .getByLabel('Context priority (higher wins; explicit question first)', {
        exact: true,
      });
    await priority.fill('10');
    await requestQuestionPreview(preview, question);
    const result = preview.locator('[data-answer-preview]');
    await result.getByText(expected, { exact: true }).waitFor();
    await result.getByText('Approved and complete.', { exact: true }).waitFor();
    await priority.fill('0');
    await requestQuestionPreview(preview, question);
    await result
      .getByText('Review required before automatic sending.', { exact: true })
      .waitFor();
    assert.equal(await result.getByText(expected, { exact: true }).count(), 0);
    await priority.fill('10');
    await requestQuestionPreview(preview, question);
    await result.getByText(expected, { exact: true }).waitFor();
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await priority.scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth <=
            globalThis.innerWidth
        ),
        true
      );
      if (process.env.SALARY_PRIORITY_UI_SCREENSHOTS) {
        await page.screenshot({
          path: `${process.env.SALARY_PRIORITY_UI_SCREENSHOTS}-${width}.png`,
        });
      }
    }
    assert.deepEqual(await fixture.stats(), {
      clicks: 0,
      textSends: 0,
      draft: '',
    });
    return {
      contextPriority: 10,
      tiedPriorityRequiresReview: true,
      narrowLayout: true,
      textSends: 0,
    };
  } finally {
    await fixture.close();
  }
};

export const verifySalaryContextPriority = async (browser) => {
  console.log(
    '[salary-context-priority]',
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question,
        expected,
        input: { salary, vacancy },
        screenshot: process.env.SALARY_PRIORITY_SCREENSHOT,
      })
    )
  );
  console.log(
    '[salary-priority-controls]',
    JSON.stringify(await verifyPriorityControl(browser))
  );
};
