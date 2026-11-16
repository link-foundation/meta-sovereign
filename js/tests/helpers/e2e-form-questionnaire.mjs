import { decodeWire } from '../../src/transport/lino.js';
import { assert } from './e2e-chat.mjs';
import { formQuestions } from '../../../experiments/issue-56/form-questionnaire-fixture.mjs';

export const verifyFormQuestionnaireUi = async ({ page, fixture, owned }) => {
  const initialSubmits = fixture.submits;
  await page.locator('[data-form-slot]').fill('application-2');
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/questionnaire'));
  let pending = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/read')
  );
  await page.locator('[data-action="read-form"]').click();
  const inspected = await pending;
  const report = decodeWire(
    await inspected.body(),
    inspected.headers()['content-type']
  );
  assert(
    report.ok && report.fields.length === 2,
    'both questionnaire controls inspected'
  );
  assert(
    report.fields.every(
      (field) => field.label.split('\n').length === 3 && field.value === ''
    ),
    'literal and br question boundaries survive inspection'
  );
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:questionnaire');
  pending = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/plan')
  );
  await page.locator('[data-action="plan-form"]').click();
  const planned = await pending;
  const result = decodeWire(
    await planned.body(),
    planned.headers()['content-type']
  );
  assert(
    result.ok &&
      result.fields.every(
        ({ answer }) =>
          answer.match === 'assembled' &&
          answer.parts.length === 3 &&
          answer.requiresReview &&
          answer.complete &&
          answer.parts.every((part, i) => part.question === formQuestions[i]) &&
          answer.proposal.value.includes('$6 000 net per month.') &&
          answer.proposal.value.includes('owner@example.test') &&
          answer.proposal.value.includes('https://github.com/example-owner')
      ),
    'each questionnaire retains all salary and contact proposals for review'
  );
  await page.locator('[data-form-plan-summary]').waitFor();
  const cards = page.locator('[data-form-field]');
  assert(
    (await cards.count()) === 2 &&
      (await cards.allTextContents()).every((text) =>
        text.includes('$6 000 net per month.')
      ),
    'production UI displays complete assemblies'
  );
  assert(
    owned.at(-1).closed &&
      owned.at(-1).events.length === 0 &&
      fixture.submits === initialSubmits,
    'read and planning leave form unchanged and close the browser'
  );
  console.log(
    '[forms-questionnaire]',
    JSON.stringify({
      controls: 2,
      parts: 3,
      requiresReview: true,
      providerWrites: 0,
      closed: true,
    })
  );
};
