import assert from 'node:assert/strict';
import { salaryLadderBrowserFixture } from '../../../experiments/issue-56/salary-ladder-browser-fixture.mjs';
import { verifySalaryLadderPage } from '../../../experiments/issue-56/salary-ladder-page.mjs';

export const verifySalaryLadder = async (browser) => {
  const f = await salaryLadderBrowserFixture(browser);
  try {
    const result = await verifySalaryLadderPage({
      page: f.page,
      base: f.base,
      before: process.env.SALARY_LADDER_BEFORE === '1',
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    });
    assert.equal(f.records.length, 5, 'Reload must not replay discovery');
    assert(f.records.every((row) => row.closed && row.clicks === 0));
    assert.deepEqual(f.errors, []);
    console.log(
      JSON.stringify({
        ...result,
        providerClicks: 0,
        resourcesClosed: true,
        recoveryReplayed: false,
      })
    );
  } finally {
    await f.close();
  }
};
