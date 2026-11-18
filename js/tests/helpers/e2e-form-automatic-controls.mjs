import { assert } from './e2e-chat.mjs';
import { responseFor, decoded } from './e2e-form-review.mjs';
import { encodeWire, LINO_TEXT } from '../../src/transport/lino.js';

export const verifyAutomaticPrefillControls = async (page, until) => {
  await page.locator('[data-form-planner]').scrollIntoViewIfNeeded();
  if (process.env.FORMS_AUTOMATIC_CONTROLS_BEFORE === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-automatic-controls-before.png',
    });
  }
  const button = page.locator('[data-action="prefill-form"]');
  await button.waitFor({ timeout: 5000 });
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let original;
  const requests = [];
  const route = async (routed) => {
    const response = await routed.fetch();
    const result = await decoded(response);
    requests.push(routed.request().postData());
    if (!original) {
      original = result;
      await held;
      await routed.fulfill({
        response,
        body: encodeWire(
          { ok: false, code: 'fixture-response-lost' },
          LINO_TEXT
        ),
      });
    } else {
      await routed.fulfill({ response });
    }
  };
  await page.route('**/api/forms/sessions/prefill', route);
  try {
    let pending = responseFor(page, 'prefill');
    await button.click();
    await until(
      () => Boolean(original),
      'automatic prefill reached held response'
    );
    assert(
      await button.isDisabled(),
      'prefill disabled during pending response'
    );
    assert(
      await page.locator('[data-form-profile]').isDisabled(),
      'profile frozen during request'
    );
    release();
    await pending;
    await page
      .locator('[data-form-prefill-error="fixture-response-lost"]')
      .waitFor();
    assert(
      (await page.locator('[data-action="apply-form-plan"]').count()) === 0,
      'old manual plan invalidated'
    );
    await page.locator('[data-form-profile]').selectOption('');
    assert(
      (await button.textContent()).includes('Recover'),
      'explicit recovery offered'
    );
    pending = responseFor(page, 'prefill');
    await button.click();
    const recovered = await decoded(await pending);
    await page.locator('[data-form-automatic-result="partial"]').waitFor();
    assert(
      requests.length === 2 && requests[0] === requests[1],
      'recovery keeps original request ID and settings'
    );
    assert(
      JSON.stringify(recovered.receipts) === JSON.stringify(original.receipts),
      'actual receipts recovered'
    );
    for (const [name, width, height] of [
      ['desktop', 1200, 800],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page
        .locator('[data-form-automatic-result]')
        .evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => globalThis.scrollBy(0, -72));
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        'prefill receipts fit viewport'
      );
      await page.screenshot({
        path: `docs/screenshots/issue-56-forms-automatic-controls-${name}.png`,
      });
    }
    await page.setViewportSize({ width: 1200, height: 800 });
    return original;
  } finally {
    release();
    await page.unroute('**/api/forms/sessions/prefill', route);
  }
};
