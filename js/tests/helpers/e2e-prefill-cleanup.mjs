import { assert } from './e2e-chat.mjs';
import { decoded } from './e2e-form-review.mjs';

/** Observe real pending cleanup through the ordinary read-only UI poll. */
export const verifyPrefillCleanup = async ({ page, owner, fixture }) => {
  const gate = fixture.prefillCleanup.arm();
  try {
    await owner.page.locator('#owner-clear').click();
    await gate.started;
    const request = await page.waitForRequest(
      (value) =>
        value.method() === 'GET' &&
        new URL(value.url()).pathname === '/api/forms/sessions/prefill'
    );
    const value = await decoded(await request.response());
    if (value.ok) {
      await page.locator('[data-form-prefill-error]').waitFor();
    }
    assert(
      value.state === 'prefilling' &&
        !value.ok &&
        !value.complete &&
        value.receipts.length === 1,
      'a fresh status read during held cleanup retains confirmed changes'
    );
    const pending = page.locator('[data-form-automatic-result="prefilling"]');
    await pending.waitFor();
    assert(
      (await page.locator('[data-form-prefill-error]').count()) === 0,
      'cleanup status remains accepted without another POST'
    );
    console.log(
      '[prefill-cleanup]',
      JSON.stringify({ pending: true, receipts: value.receipts.length })
    );
    await pending.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-prefill-cleanup/after-pending.png',
    });
  } finally {
    gate.release();
  }
};
