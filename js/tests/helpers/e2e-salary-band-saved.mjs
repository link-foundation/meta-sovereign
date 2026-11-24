import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { inspectSalaryBrowser } from './salary-preview-controls.mjs';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import {
  bandSalary,
  bandQuestion,
  bandSavedRule,
} from '../../../experiments/issue-56/salary-band-safety-fixture.mjs';

export const verifySalaryBandSaved = async (browser, scenario = {}) => {
  const group = scenario.group ?? 'salary-band-saved';
  const before =
    process.env[scenario.beforeVariable ?? 'SALARY_BAND_SAVED_BEFORE'] === '1';
  const ui = await questionBrowserUi(browser, {
    group,
    screenshots:
      process.env[
        scenario.screenshotVariable ?? 'SALARY_BAND_SAVED_SCREENSHOTS'
      ],
  });
  const { fixture } = ui;
  const options = scenario.options ?? ['USD up to 5000', 'USD 5001–7999'];
  const question = scenario.question ?? bandQuestion;
  const salary = scenario.salary ?? bandSalary;
  const rule = await saveAnswerRule(
    fixture.store,
    bandSavedRule(options[0], { question })
  );
  try {
    await fixture.reset({ question, options });
    await inspectSalaryBrowser(ui, salary);
    await ui.run(
      'an old offered boundary uses the current containing band',
      async () => {
        assert.equal(
          await ui.controls.getByRole('radio', { checked: true }).count(),
          1
        );
        assert.equal(
          await ui.controls
            .getByRole('radio', { name: options[before ? 0 : 1], exact: true })
            .isChecked(),
          true
        );
        const select = ui.controls.locator('[data-browser-answer-select]');
        assert.equal(await select.isDisabled(), false);
        await ui.controls
          .locator('[data-browser-answer-review]')
          .scrollIntoViewIfNeeded();
        await ui.shot(`${before ? 'before' : 'after'}-${group}`);
        if (!before) {
          assert.equal(
            await ui.controls
              .getByRole('radio', { name: options[1], exact: true })
              .isChecked(),
            true
          );
          await select.click();
          await ui.status('sent').waitFor();
        }
      }
    );
    await ui.expectStats({ clicks: before ? 0 : 1, textSends: 0, draft: '' });
    assert.deepEqual(await fixture.store.get(rule.id), rule);
    return {
      ...ui.result(),
      before,
      nativeReceipts: before ? 0 : 1,
      textSends: 0,
    };
  } finally {
    await ui.close();
  }
};
