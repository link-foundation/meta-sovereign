import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvPrepareBrowserFixture } from '../../../experiments/issue-56/cv-prepare-browser-fixture.mjs';
import { decodeWire, encodeWire, LINO_TEXT } from '../../src/transport/lino.js';
import { holdUnreceivedCvPreparation } from './e2e-cv-prepare-recovery.mjs';

export const verifyCvPreparationCancellation = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const f = await cvPrepareBrowserFixture(browser);
  const { page, provider } = f;
  const panel = page.locator('[data-cv-preparation]');
  const prepare = panel.locator('[data-cv-prepare-change="en:about"]');
  const cancel = panel.locator('[data-cv-prepare-cancel]');
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${f.base}/#/cv`);
    await prepare.waitFor();
    const { original, posts } = await holdUnreceivedCvPreparation({
      page,
      prepare,
      panel,
    });
    if (before) {
      await shot('cv-prepare-cancel-before');
    }
    assert.equal(
      await cancel.count(),
      1,
      'An unknown intent needs explicit cancellation'
    );
    await cancel.focus();
    await page.keyboard.press('Enter');
    await panel.locator('[data-cv-preparation-state="cancelled"]').waitFor();
    assert.equal(await prepare.isEnabled(), true);
    const late = await page.request.post(`${f.base}/api/vacancies/cv-prepare`, {
      headers: { origin: f.base, 'content-type': LINO_TEXT, accept: LINO_TEXT },
      data: encodeWire(original),
    });
    assert.equal(late.status(), 200);
    const result = decodeWire(
      await late.body(),
      late.headers()['content-type']
    );
    assert.equal(result.preparation.state, 'cancelled');
    assert.equal(f.counters.attached, 0);
    assert.equal(await provider.locator('textarea').count(), 0);
    await shot('cv-prepare-cancel-confirmed');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await panel.locator('[data-cv-preparation-state="cancelled"]').waitFor();
    await shot('cv-prepare-cancel-phone');
    await prepare.click();
    await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
    assert.equal(f.counters.attached, 1);
    assert.equal(f.counters.detached, 1);
    assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 0);
    assert.equal(posts, 1);
    assert.deepEqual(f.errors, []);
    await page.setViewportSize({ width: 1280, height: 900 });
    await shot('cv-prepare-cancel-after');
    console.log(
      '[cv-prepare-cancel-evidence]',
      JSON.stringify({
        lateState: result.preparation.state,
        ...f.counters,
        saves: 0,
        errors: f.errors,
      })
    );
  } finally {
    await f.close();
  }
};
