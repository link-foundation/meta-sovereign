import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { inspectSalaryBrowser } from './salary-preview-controls.mjs';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import {
  bandSalary,
  bandQuestion,
  bandChoices,
  bandMixedChoices,
  bandSavedRule,
} from '../../../experiments/issue-56/salary-band-safety-fixture.mjs';

export const verifySalaryBandSafety = async (browser) => {
  const before = process.env.SALARY_BAND_SAFETY_BEFORE === '1';
  const ui = await questionBrowserUi(browser, {
    group: 'salary-band-safety',
    screenshots: process.env.SALARY_BAND_SAFETY_SCREENSHOTS,
  });
  const { fixture } = ui;
  const rule = await saveAnswerRule(fixture.store, bandSavedRule());
  const check = async (choices, expected) => {
    await fixture.reset({ question: bandQuestion, options: choices });
    await ui.readCurrent();
    assert.equal(
      await ui.controls.getByRole('radio', { checked: true }).count(),
      expected ? 1 : 0
    );
    if (expected) {
      assert.equal(
        await ui.controls
          .getByRole('radio', { name: expected, exact: true })
          .isChecked(),
        true
      );
    }
    assert.equal(
      await ui.controls.locator('[data-browser-answer-select]').isDisabled(),
      !expected
    );
    await ui.expectStats({
      clicks: 0,
      textSends: 0,
      draft: '',
    });
  };
  try {
    await inspectSalaryBrowser(ui, bandSalary);
    await ui.run('a specific saved amount requires owner review', async () => {
      await check(bandChoices, before ? bandChoices[1] : '');
      await ui.controls
        .locator('[data-browser-answer-review]')
        .scrollIntoViewIfNeeded();
      await ui.shot(
        before ? 'before-salary-band-safety' : 'after-salary-band-safety'
      );
    });
    await ui.run(
      'mixed numeric currencies never leave a false unique option',
      async () => {
        await check(bandMixedChoices, before ? bandMixedChoices[0] : '');
      }
    );
    assert.deepEqual(await fixture.store.get(rule.id), rule);
    if (!before) {
      await saveAnswerRule(
        fixture.store,
        bandSavedRule('From USD 6000 net per month.')
      );
      await ui.run(
        'matching current amount restores an explicit native selection receipt',
        async () => {
          await check(bandChoices, bandChoices[1]);
          await ui.controls.locator('[data-browser-answer-select]').click();
          await ui.status('sent').waitFor();
          await ui.expectStats({
            clicks: 1,
            textSends: 0,
            draft: '',
          });
        }
      );
      await fixture.reset({
        question: bandQuestion,
        options: bandChoices,
        draft: 'Keep my own answer',
      });
      await ui.readCurrent();
      assert.equal(
        await ui.controls.locator('[data-browser-answer-select]').isDisabled(),
        true
      );
      await ui.expectStats({
        clicks: 0,
        textSends: 0,
        draft: 'Keep my own answer',
      });
    }
    return {
      ...ui.result(),
      before,
      blockedClicks: 0,
      textSends: 0,
      nativeReceipts: before ? 0 : 1,
    };
  } finally {
    await ui.close();
  }
};
