import { questionBrowserUi } from './question-browser-ui.mjs';
import { inspectSalaryBrowser } from './salary-preview-controls.mjs';
import {
  bandSalary,
  bandQuestion,
  bandChoices,
  bandMixedChoices,
} from '../../../experiments/issue-56/salary-band-safety-fixture.mjs';
import { overlapBandCase } from '../../../experiments/issue-56/salary-band-overlap-fixture.mjs';
import { choiceCurrencyCase } from '../../../experiments/issue-56/salary-choice-currency-fixture.mjs';

/** Explicit finite watch; native choices are the only possible delivery effect. */
const verifySalaryWatchCase = async (browser, scenario = {}) => {
  const group = scenario.group ?? 'salary-band-watch';
  const before =
    process.env[scenario.beforeVariable ?? 'SALARY_BAND_WATCH_BEFORE'] === '1';
  const sends = scenario.hold ? before : !before;
  const question = scenario.question ?? bandQuestion;
  const choices = scenario.options ?? bandChoices;
  const salary = scenario.salary ?? bandSalary;
  const ui = await questionBrowserUi(browser, {
    group,
    screenshots:
      process.env[
        scenario.screenshotVariable ?? 'SALARY_BAND_WATCH_SCREENSHOTS'
      ],
  });
  const { fixture } = ui;
  const watch = ui.controls.locator('[data-browser-answer-watch]');
  const phase = (value) =>
    watch.locator(`[data-browser-watch-phase="${value}"]`);
  const reset = async (options = choices, draft = '') => {
    await fixture.reset({ question, options, draft });
    await ui.readCurrent();
  };
  const start = async () => {
    await watch.getByLabel('Minutes (1–120)', { exact: true }).fill('1');
    await watch.locator('[data-browser-watch-start]').click();
  };
  const stop = async () => {
    await watch.locator('[data-browser-watch-stop]').click();
    await watch.locator('[data-browser-watch-state="stopped"]').waitFor();
  };
  try {
    await inspectSalaryBrowser(ui, salary);
    await ui.run(
      scenario.hold
        ? 'overlap for one salary basis holds the entire watched decision'
        : 'approved containing salary choice reaches the native provider',
      async () => {
        await reset();
        await start();
        await phase(sends ? 'sent' : 'review').waitFor();
        if (sends) {
          await watch
            .getByText('Provider message receipt: 102', { exact: true })
            .waitFor();
        }
        await ui.expectStats({
          clicks: sends ? 1 : 0,
          textSends: 0,
          draft: '',
        });
        await watch.scrollIntoViewIfNeeded();
        await ui.shot(`${before ? 'before' : 'after'}-${group}`);
        await stop();
        await ui.expectStats({
          clicks: sends ? 1 : 0,
          textSends: 0,
          draft: '',
        });
      }
    );
    if (!before && !scenario.hold) {
      await ui.run(
        'mixed currency and owner drafts remain held during a watch',
        async () => {
          for (const [options, draft, expected] of [
            [bandMixedChoices, '', 'review'],
            [bandChoices, 'Keep my salary explanation', 'owner-draft'],
          ]) {
            await reset(options, draft);
            await start();
            await phase(expected).waitFor();
            await stop();
            await ui.expectStats({ clicks: 0, textSends: 0, draft });
          }
        }
      );
    }
    return {
      ...ui.result(),
      before,
      nativeReceipts: sends ? 1 : 0,
      textSends: 0,
    };
  } finally {
    await ui.close();
  }
};

export const verifySalaryBandOverlap = (browser) =>
  verifySalaryWatchCase(browser, {
    ...overlapBandCase,
    group: 'salary-band-overlap',
    beforeVariable: 'SALARY_BAND_OVERLAP_BEFORE',
    screenshotVariable: 'SALARY_BAND_OVERLAP_SCREENSHOTS',
    hold: true,
  });

export const verifySalaryChoiceCurrency = (browser) =>
  verifySalaryWatchCase(browser, {
    ...choiceCurrencyCase,
    group: 'salary-choice-currency',
    beforeVariable: 'SALARY_CHOICE_CURRENCY_BEFORE',
    screenshotVariable: 'SALARY_CHOICE_CURRENCY_SCREENSHOTS',
  });

export const verifySalaryBandWatch = async (browser) => ({
  ...(await verifySalaryWatchCase(browser)),
  overlap: await verifySalaryBandOverlap(browser),
  currency: await verifySalaryChoiceCurrency(browser),
});
