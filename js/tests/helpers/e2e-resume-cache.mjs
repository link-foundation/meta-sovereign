import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resumeCacheFixture } from '../../../experiments/issue-56/resume-cache-fixture.mjs';

/** Real native discovery and production snapshot persistence; no provider traffic. */
export const verifyResumeCacheRecovery = async (
  browser,
  {
    screenshots = process.env.APPLICATION_SCREENSHOTS,
    before = process.env.RESUME_CACHE_BEFORE === '1',
  } = {}
) => {
  const fixture = await resumeCacheFixture(browser);
  try {
    const { page, records } = fixture;
    await page.goto(`${fixture.base}/#/cv`);
    const panel = page.locator('[data-vacancies]');
    const rows = panel.locator('[data-vacancy-resume]');
    const action = panel.locator('[data-vacancy-action="resumes"]');
    await action.click();
    await rows.nth(2).waitFor();
    assert.equal(await rows.count(), 3);
    fixture.failNext();
    await action.click();
    await panel.locator('[data-vacancy-error]').waitFor();
    assert.equal(
      await rows.count(),
      3,
      'The mounted view retains its last successful list'
    );
    const count = records.length;
    await page.reload();
    await rows.first().waitFor();
    await rows.first().scrollIntoViewIfNeeded();
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: join(
          screenshots,
          `resume-cache-${before ? 'before' : 'after'}.png`
        ),
      });
    }
    assert.equal(
      await rows.count(),
      3,
      'Rejected discovery must not replace the acknowledged list after reload'
    );
    assert(!(await panel.innerText()).includes('Unacknowledged CV'));
    await page.setViewportSize({ width: 390, height: 950 });
    await page.reload();
    await rows.nth(2).waitFor();
    await rows.first().scrollIntoViewIfNeeded();
    if (screenshots) {
      await page.screenshot({
        path: join(screenshots, 'resume-cache-phone.png'),
      });
    }
    assert.equal(
      records.length,
      count,
      'Recovery cannot launch native discovery'
    );
    assert(records.every((row) => row.closed && row.clicks === 0));
    assert.deepEqual(fixture.errors, []);
    console.log(
      JSON.stringify({
        resumeRows: 3,
        rejectedWrites: 1,
        providerClicks: 0,
        recoveryReplayed: false,
        resourcesClosed: true,
      })
    );
  } finally {
    await fixture.close();
  }
};
