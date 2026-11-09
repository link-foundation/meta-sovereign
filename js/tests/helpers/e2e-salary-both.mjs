import { assert } from './e2e-chat.mjs';

export const verifySalaryBoth = async ({
  page,
  preview,
  salary,
  run,
  result,
}) => {
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('What salary in USD net and gross do you expect?');
  await run();
  await result
    .getByText('From $7 100 gross per month ($6 000 net).', { exact: true })
    .waitFor();
  await result.getByText('Approved and complete.', { exact: true }).waitFor();
  await result.locator('[data-salary-automatic-rate="cached"]').waitFor();
  const calculation = result.locator('[data-salary-calculation-evidence]');
  if ((await calculation.getAttribute('open')) === null) {
    await calculation.locator(':scope > summary').click();
  }
  await calculation
    .getByText('Progressive personal tax · 13% / 15% / 18%', { exact: true })
    .waitFor();
  // Keep the configured amounts and the actual preview in one reviewable view.
  await salary.locator(':scope > summary').click();
  for (const [width, height, path] of [
    [1200, 1100, process.env.QUESTIONS_SALARY_BOTH_SCREENSHOT],
    [390, 844, process.env.QUESTIONS_SALARY_BOTH_MOBILE_SCREENSHOT],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .locator('.app-shell-compact')
      .waitFor({ state: width < 600 ? 'visible' : 'detached' });
    await result.scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth === globalThis.innerWidth
      ),
      'dual-basis preview fits viewport'
    );
    if (path) {
      await page.screenshot({ path, scale: 'css' });
    }
  }
  await page.setViewportSize({ width: 1200, height: 1100 });
  await page.locator('.app-shell-compact').waitFor({ state: 'detached' });
  await salary.locator(':scope > summary').click();
};
