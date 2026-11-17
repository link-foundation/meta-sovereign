import { questionBrowserUi } from './question-browser-ui.mjs';
import { inspectSalaryBrowser } from './salary-preview-controls.mjs';
import {
  bandSalary,
  bandQuestion,
  bandChoices,
  bandMixedChoices,
} from '../../../experiments/issue-56/salary-band-safety-fixture.mjs';

/** Explicit finite watch; native choices are the only possible delivery effect. */
export const verifySalaryBandWatch = async (browser) => {
  const before = process.env.SALARY_BAND_WATCH_BEFORE === '1';
  const ui = await questionBrowserUi(browser, {
    group: 'salary-band-watch',
    screenshots: process.env.SALARY_BAND_WATCH_SCREENSHOTS,
  });
  const { fixture } = ui;
  const watch = ui.controls.locator('[data-browser-answer-watch]');
  const phase = (value) =>
    watch.locator(`[data-browser-watch-phase="${value}"]`);
  const reset = async (options = bandChoices, draft = '') => {
    await fixture.reset({ question: bandQuestion, options, draft });
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
    await inspectSalaryBrowser(ui, bandSalary);
    await ui.run(
      'approved containing salary choice reaches the native provider',
      async () => {
        await reset();
        await start();
        await phase(before ? 'review' : 'sent').waitFor();
        if (!before) {
          await watch
            .getByText('Provider message receipt: 102', { exact: true })
            .waitFor();
        }
        await ui.expectStats({
          clicks: before ? 0 : 1,
          textSends: 0,
          draft: '',
        });
        await watch.scrollIntoViewIfNeeded();
        await ui.shot(
          before ? 'before-salary-band-watch' : 'after-salary-band-watch'
        );
        await stop();
        await ui.expectStats({
          clicks: before ? 0 : 1,
          textSends: 0,
          draft: '',
        });
      }
    );
    if (!before) {
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
      nativeReceipts: before ? 0 : 1,
      textSends: 0,
    };
  } finally {
    await ui.close();
  }
};
