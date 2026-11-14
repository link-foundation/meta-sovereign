import assert from 'node:assert/strict';
import { wirePost } from './vacancy-routes.mjs';
import { LINO_TEXT, decodeWire } from '../../src/transport/lino.js';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';

export const nativeApplicationFormUrl =
  'https://hh.ru/applicant/vacancy_response?vacancyId=123';
export const nativeApplicationForm = (
  browser,
  url = nativeApplicationFormUrl
) =>
  browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => page.url() === url);

export const nativeApplicationQueue = async (fixture) => {
  const response = await fetch(
    `${fixture.base}/api/vacancies/application-queue`,
    {
      headers: { accept: LINO_TEXT },
    }
  );
  assert.equal(response.status, 200);
  return decodeWire(
    await response.arrayBuffer(),
    response.headers.get('content-type')
  );
};

export const nativeApplicationRequest = async (fixture, operation, input) => {
  const result = await wirePost(
    fixture.base,
    `application-${operation}`,
    input,
    LINO_TEXT
  );
  assert.equal(result.status, 200, JSON.stringify(result.value));
  return result.value;
};
export const nativeApplicationReviewRequest = (
  fixture,
  operation,
  receipt,
  extra = {}
) =>
  nativeApplicationRequest(fixture, operation, {
    ...applicationInput,
    ...(receipt ? { revision: receipt.revision } : {}),
    ...extra,
  });

/** Enter the real native fixture and retain actual owner edits for draft checks. */
export const openNativeAnsweredApplication = async (
  fixture,
  browser,
  answers
) => {
  let receipt = await nativeApplicationReviewRequest(fixture, 'open');
  receipt = await nativeApplicationReviewRequest(fixture, 'advance', receipt, {
    action: 'enter',
    confirm: true,
  });
  const page = nativeApplicationForm(browser);
  await page.locator('#experience').fill(answers.experience);
  await page.locator('[data-qa="add-cover-letter"]').click();
  await page
    .locator('[data-qa="vacancy-response-form-letter-input"]')
    .fill(answers.letter);
  receipt = await nativeApplicationReviewRequest(fixture, 'read', receipt);
  return { receipt, page };
};
