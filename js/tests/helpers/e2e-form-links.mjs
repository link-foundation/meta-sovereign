import { assert } from './e2e-chat.mjs';
import {
  responseFor,
  decoded,
  planCurrent,
  applyCurrent,
  assertAppliedReceipts,
  formControlValues,
  closeFormReview,
} from './e2e-form-review.mjs';
import { formLinks } from '../../../experiments/issue-56/forms-links-fixture.mjs';

const capture = async (page, field, name) => {
  if (process.env.FORMS_LINKS_SCREENSHOTS !== '1') {
    return;
  }
  await page
    .locator(`[data-form-field="${field.id}"]`)
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-links-${name}.png`,
  });
};

export const verifyFormLinksUi = async ({ page, owned, fixture, until }) => {
  const initialSubmits = fixture.submits;
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/links'));
  await page.locator('[data-form-slot]').fill('application-2');
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  assert((await decoded(await pending)).ok, 'link form read');
  await page.locator('[data-form-profile]').selectOption('');
  let plan = await planCurrent(page);
  const githubBefore = plan.fields.find((field) => field.name === 'githubLink');
  if (process.env.FORMS_LINKS_BEFORE === '1') {
    await capture(page, githubBefore, 'before');
  }
  assert(
    plan.fields.every((field) => field.answer.proposal === null),
    'link questions never offer saved No as text'
  );
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:form-links');
  plan = await planCurrent(page);
  const byName = (name) => plan.fields.find((field) => field.name === name);
  assert(
    byName('resumeLink').answer.proposal.value === formLinks.resume,
    'resume request contains only resume link'
  );
  assert(
    byName('githubLink').answer.proposal.value === formLinks.github,
    'GitHub request contains only GitHub'
  );
  assert(
    byName('linkedinLink').answer.proposal === null,
    'missing LinkedIn stays open'
  );
  assert(
    byName('allLinks').answer.proposal.value ===
      Object.values(formLinks).join(', '),
    'combined request offers all available links'
  );
  for (const name of ['resumeLink', 'githubLink']) {
    await page.locator(`[data-form-select="${byName(name).id}"]`).check();
  }
  await capture(page, byName('githubLink'), 'after');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'link proposals fit a phone'
  );
  await capture(page, byName('linkedinLink'), 'mobile');
  await page.setViewportSize({ width: 1200, height: 800 });
  const applied = await applyCurrent(page);
  assertAppliedReceipts(applied, 2, 'two links have actual readback receipts');
  const values = await formControlValues(owner.page);
  assert(
    values.resumeLink === formLinks.resume &&
      values.githubLink === formLinks.github &&
      values.linkedinLink === '' &&
      values.allLinks === 'Owner keeps this answer',
    'actual fields contain only reviewed links and preserve owner input'
  );
  await closeFormReview(page, until, 'link review closed');
  assert(
    owner.closed && fixture.submits === initialSubmits,
    'link browser closes without submitting'
  );
  console.log(
    '[forms-links]',
    JSON.stringify({
      values,
      receipts: 2,
      closed: owner.closed,
      submits: fixture.submits - initialSubmits,
    })
  );
};
