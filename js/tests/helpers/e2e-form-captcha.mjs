import { assert } from './e2e-chat.mjs';
import { decoded, responseFor, closeFormReview } from './e2e-form-review.mjs';
import { verifyPrefillCleanup } from './e2e-prefill-cleanup.mjs';

const capture = async (page, state) => {
  const result = page.locator(`[data-form-automatic-result="${state}"]`);
  for (const [layout, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await result.evaluate((node) => node.scrollIntoView({ block: 'end' }));
    if (state !== 'waiting-owner') {
      await result.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => globalThis.scrollBy(0, -72));
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'manual verification fits viewport'
    );
    await page.screenshot({
      path: `docs/screenshots/issue-56-forms-captcha-${state}-${layout}.png`,
    });
  }
  await page.setViewportSize({ width: 1200, height: 800 });
};

export const verifyFormCaptchaUi = async ({ page, fixture, owned, until }) => {
  const submits = fixture.submits;
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/captcha'));
  await page.locator('[data-form-slot]').fill('application-2');
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  const inspection = await decoded(await pending);
  if (process.env.FORMS_CAPTCHA_BEFORE === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-captcha-before.png',
      fullPage: true,
    });
  }
  assert(
    inspection.ok &&
      inspection.challenge?.active &&
      inspection.fields.length === 0,
    'challenge excluded from public answers'
  );
  assert(
    !JSON.stringify(inspection).includes('Private challenge'),
    'challenge instructions excluded'
  );
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  let body;
  let first = true;
  const route = async (request) => {
    const current = request.request().postData();
    if (body) {
      assert(body === current, 'waiting recovery freezes original request');
    }
    body = current;
    const response = await request.fetch();
    if (first) {
      first = false;
      await request.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'waiting receipt lost',
      });
    } else {
      await request.fulfill({ response });
    }
  };
  await page.route('**/api/forms/sessions/prefill', route);
  try {
    await page.locator('[data-action="prefill-form"]').click();
    await page.locator('[data-form-prefill-error]').waitFor();
    await page.locator('[data-action="prefill-form"]').click();
    await page
      .locator('[data-form-automatic-result="waiting-owner"]')
      .waitFor();
  } finally {
    await page.unroute('**/api/forms/sessions/prefill', route);
  }
  assert(
    await page.locator('[data-review-action="close"]').isEnabled(),
    'Close remains usable while waiting'
  );
  await capture(page, 'waiting-owner');
  assert(
    (await owner.page.evaluate(() => globalThis.events.length)) === 0,
    'no automatic challenge interaction'
  );
  assert(
    (await owner.page.evaluate(() => globalThis.challengeReads)) === 0,
    'challenge value was never read'
  );
  await owner.page.screenshot({
    path: 'docs/screenshots/issue-56-forms-captcha-owner-before.png',
    fullPage: true,
  });
  // This is the test owner completing a synthetic gate. Production never
  // receives this button selector or a CAPTCHA answer/solver implementation.
  await verifyPrefillCleanup({ page, owner, fixture });
  await page.locator('[data-form-automatic-result="prefilled"]').waitFor();
  assert(
    (await owner.page.locator('[name="email"]').inputValue()) ===
      'ada@example.test',
    'filling resumes after the owner'
  );
  assert(
    (await owner.page.evaluate(() => globalThis.ownerReleases)) === 1,
    'one owner completion'
  );
  assert(
    (await owner.page.evaluate(() => globalThis.challengeReads)) === 0,
    'no challenge read after completion'
  );
  await capture(page, 'prefilled');
  await closeFormReview(page, until, 'manual verification review closed');
  assert(
    owner.closed && fixture.submits === submits,
    'review closed without submission'
  );
  console.log(
    '[forms-captcha]',
    JSON.stringify({
      waiting: true,
      lostResponseRecovered: true,
      ownerReleases: 1,
      challengeReads: 0,
      receipts: 1,
      submits: 0,
      closed: true,
    })
  );
};
