import { assert } from './e2e-chat.mjs';
import { openFormPlan, closeFormReview, decoded } from './e2e-form-review.mjs';
import { encodeWire, LINO_TEXT } from '../../src/transport/lino.js';
import { saveConfiguredResume } from '../../src/forms/configured-resume.js';
import { syntheticResumePdf } from '../../../experiments/issue-56/forms-resume-fixture.mjs';
import { verifyAutomaticPrefillControls } from './e2e-form-automatic-controls.mjs';

export const verifyFormAutomaticUi = async ({
  page,
  base,
  fixture,
  owned,
  store,
  until,
}) => {
  await saveConfiguredResume(store, {
    file: {
      name: 'synthetic-resume.pdf',
      data: syntheticResumePdf().toString('base64'),
    },
  });
  const initialSubmits = fixture.submits;
  const plan = await openFormPlan(
    page,
    fixture.url.replace('/application', '/automatic'),
    'qa-profile:forms-fixture'
  );
  const owner = owned.at(-1);
  await owner.page.screenshot({
    path: 'docs/screenshots/issue-56-forms-automatic-before.png',
    fullPage: true,
  });
  const prefill = async (requestId) =>
    decoded(
      await page.request.post(`${base}/api/forms/sessions/prefill`, {
        headers: { 'content-type': LINO_TEXT, accept: LINO_TEXT },
        data: encodeWire(
          {
            id: plan.reviewPlan.sessionId,
            requestId,
            profileId: 'qa-profile:forms-fixture',
            approximate: true,
            modelDraft: false,
          },
          LINO_TEXT
        ),
      })
    );
  const result = await verifyAutomaticPrefillControls(page, until);
  assert(
    result.state === 'partial' &&
      result.receipts.length === 6 &&
      result.receipts.every((item) => item.status === 'applied'),
    `verified current-page text and choices: ${JSON.stringify(result)}`
  );
  assert(
    result.uploads.length === 2 &&
      result.uploads.every((item) => item.state === 'attached'),
    'main and cross-origin PDF bytes verified'
  );
  assert(
    result.nextPage && result.requiresReview && !result.submissionAttempted,
    'next-page guidance retains human submission'
  );
  assert(
    (await owner.page.locator('[name="email"]').inputValue()) ===
      'ada@example.test',
    'actual email filled'
  );
  assert(
    (await owner.page.locator('[name="fullName"]').inputValue()) ===
      "Owner's current answer",
    'owner name preserved'
  );
  assert(
    (await owner.page.locator('[name="unknown"]').inputValue()) === '',
    'unknown fact remains open'
  );
  const child = owner.page
    .frames()
    .find(
      (frame) =>
        frame.url().includes('/automatic') && frame !== owner.page.mainFrame()
    );
  assert(
    (await child.locator('[name="city"]').inputValue()) === 'Vietnam, UTC+7',
    'cross-origin city and timezone filled'
  );
  const beforeRecovery = await owner.page.evaluate(
    () => globalThis.events.length
  );
  const recovered = await prefill(result.requestId);
  assert(
    JSON.stringify(recovered.receipts) === JSON.stringify(result.receipts) &&
      (await owner.page.evaluate(() => globalThis.events.length)) ===
        beforeRecovery,
    'recovered request never writes again'
  );
  assert(
    (await owner.page.evaluate(() => globalThis.navigationClicks)) === 0 &&
      fixture.submits === initialSubmits,
    'no next-page or submission interaction'
  );
  for (const [name, width, height] of [
    ['after', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await owner.page.setViewportSize({ width, height });
    assert(
      await owner.page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'actual form fits viewport'
    );
    await owner.page.screenshot({
      path: `docs/screenshots/issue-56-forms-automatic-${name}.png`,
      fullPage: true,
    });
  }
  await owner.page.getByRole('button', { name: 'Next', exact: true }).click();
  await owner.page.waitForURL('**/automatic?page=2');
  const second = await prefill('automatic-page-two');
  assert(
    second.state === 'prefilled' &&
      second.complete &&
      !second.nextPage &&
      second.receipts.length === 1,
    'manually opened second page fills independently'
  );
  assert(
    (await owner.page.locator('[name="language"]').inputValue()) === 'English',
    'actual second-page answer'
  );
  await closeFormReview(page, until, 'automatic review closed');
  assert(
    owner.closed && fixture.submits === initialSubmits,
    'automatic review closes without submitting'
  );
  console.log(
    '[forms-automatic]',
    JSON.stringify({
      firstPage: result.state,
      receipts: result.receipts.length,
      uploads: result.uploads.length,
      secondPage: second.state,
      nextClicks: 0,
      submits: fixture.submits - initialSubmits,
      closed: owner.closed,
    })
  );
};
