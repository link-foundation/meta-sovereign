/* global requestAnimationFrame */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openLayoutFixture } from '../../../experiments/issue-56/layout-observer-server.mjs';

export const verifyLayoutObserver = async (browser, { screenshots } = {}) => {
  const fixture = await openLayoutFixture();
  const context = await browser.newContext({
    viewport: { width: 1000, height: 800 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const mode of ['transient', 'persistent', 'reading']) {
      await page.goto(`${fixture.base}/?mode=${mode}`);
      await page.waitForFunction(() => globalThis.layoutEntries?.length);
      // Read after a complete observer/frame turn, never a fixed millisecond sleep.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
      );
      const entries = await page.evaluate(() => globalThis.layoutEntries);
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({
          path: join(screenshots, `layout-${mode}.png`),
        });
      }
      assert.equal(entries.length, 1, `${mode}: one transition`);
      assert.equal(
        entries[0].level,
        mode === 'persistent' ? 'warn' : 'debug',
        `${mode}: accurate severity`
      );
      assert.equal(
        entries[0].bottomGap,
        mode === 'transient' ? 8 : -30,
        `${mode}: actual geometry`
      );
      const count = entries.length;
      await page.evaluate(() => globalThis.unmountFixture());
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve))
      );
      assert.equal(
        await page.evaluate(() => globalThis.layoutEntries.length),
        count
      );
      console.log(`[layout-observer] PASS ${mode}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await fixture.close();
  }
};
