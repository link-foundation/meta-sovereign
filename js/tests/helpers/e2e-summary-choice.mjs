import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';

export const verifySummaryChoices = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await questionBrowserServer(browser, {
    summaryChoices: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 950 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, version }) => {
      globalThis.localStorage.setItem(
        key,
        JSON.stringify({ off: true, v: version })
      );
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    },
    { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
  );
  const controls = page.locator(
    '[data-question-controls] [data-browser-answer-controls]'
  );
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const read = async () => {
    const review = controls.locator('[data-browser-answer-review]');
    const old = (await review.count())
      ? await review.getAttribute('data-browser-answer-review')
      : null;
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls
      .locator(
        old
          ? `[data-browser-answer-review]:not([data-browser-answer-review="${old}"])`
          : '[data-browser-answer-review]'
      )
      .waitFor();
  };
  try {
    await page.goto(`${fixture.base}/#/automation`);
    await page.locator('[data-question-controls] > summary').click();
    await controls.locator(':scope > summary').click();
    await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
    await read();
    await controls.scrollIntoViewIfNeeded();
    if (before) {
      await controls.getByText('No matching answer', { exact: true }).waitFor();
      await shot('before-summary-choice');
      assert.equal((await fixture.stats()).clicks, 0);
      return { before: true, acceptedSummaryMissing: true, clicks: 0 };
    }
    await controls
      .getByText('Accepted answer summary', { exact: true })
      .waitFor();
    await controls
      .getByText('A completed answer summary matches this current option.', {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await controls
        .getByRole('radio', { name: 'Yes', exact: true })
        .isChecked(),
      true
    );
    await shot('summary-choice-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await controls.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
    await shot('summary-choice-mobile');
    await controls.locator('[data-browser-answer-select]').click();
    await controls.locator('[data-browser-answer-status="sent"]').waitFor();
    assert.deepEqual(await fixture.stats(), {
      clicks: 1,
      textSends: 0,
      draft: '',
    });
    await shot('summary-choice-sent');
    await fixture.reset();
    await fixture.setSummary('conflict');
    await read();
    await controls.locator('[data-answer-summary-state="conflict"]').waitFor();
    assert.equal(
      await controls.getByRole('radio', { checked: true }).count(),
      0
    );
    assert.equal(
      await controls.locator('[data-browser-answer-select]').isDisabled(),
      true
    );
    assert.equal((await fixture.stats()).clicks, 0);
    await shot('summary-choice-conflict');
    assert.deepEqual(errors, []);
    console.log(
      '[summary-choice] PASS desktop, mobile native receipt and conflict review'
    );
    return { cases: 3, pageErrors: errors, liveProvider: false };
  } finally {
    await context.close();
    await fixture.close();
  }
};
