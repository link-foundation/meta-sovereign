import { assert } from './e2e-chat.mjs';
import { deepEqual } from 'node:assert/strict';
import {
  applyCurrent,
  assertAppliedReceipts,
  formControlValues,
  closeFormReview,
  openFormPlan,
  planCurrent,
  captureFormField,
  captureFormFieldLayouts,
} from './e2e-form-review.mjs';
import {
  formPayAnswer,
  formVacancyPayAnswer,
} from '../../../experiments/issue-56/forms-pay-fixture.mjs';
import {
  vacancyId,
  vacancyUrl,
} from '../../../experiments/issue-56/assignment-vacancy-fixture.mjs';
import { captureNativeAssignmentChat } from '../../../experiments/issue-56/assignment-native-chat-fixture.mjs';

export const verifyFormPayUi = async ({ page, owned, fixture, until }) => {
  const submits = fixture.submits;
  const plan = await openFormPlan(
    page,
    fixture.url.replace('/application', '/pay'),
    'qa-profile:form-pay'
  );
  const owner = owned.at(-1);
  assert(
    plan.frames[0].intro.includes('3000р.') &&
      !plan.frames[0].intro.includes('USD 10'),
    'only visible form introduction is read'
  );
  const byName = (name) => plan.fields.find((field) => field.name === name);
  if (process.env.FORMS_PAY_BEFORE === '1') {
    await captureFormField(page, byName('hourly').id, 'before', 'pay');
  }
  assert(
    byName('hourly').answer.proposal?.value === formPayAnswer,
    'form introduction determines the minimum hourly pay and comfortable rate'
  );
  assert(
    byName('monthly').answer.salary.guidance.minimum === 336000,
    'lesson pay converts to the requested monthly unit'
  );
  assert(
    byName('technical').answer.proposal === null,
    'payroll database design stays unresolved'
  );
  assert(
    byName('ownerPay').answer.preserveCurrent,
    'owner pay answer remains protected'
  );
  await page.locator(`[data-form-select="${byName('hourly').id}"]`).check();
  await captureFormFieldLayouts(page, byName('hourly').id, 'pay');
  const applied = await applyCurrent(page);
  assertAppliedReceipts(applied, 1, 'one actual pay readback receipt');
  const values = await formControlValues(owner.page);
  assert(
    values.hourly === formPayAnswer &&
      values.monthly === '' &&
      values.ownerPay === 'Owner keeps this pay answer' &&
      values.technical === '',
    'only the selected pay answer changes'
  );
  await closeFormReview(page, until, 'pay review closed');
  assert(
    owner.closed && fixture.submits === submits,
    'pay browser closes with zero submissions'
  );
  console.log(
    '[forms-pay]',
    JSON.stringify({
      values,
      receipts: 1,
      closed: owner.closed,
      submits: fixture.submits - submits,
    })
  );
};

export const verifyFormVacancyPayUi = async ({
  page,
  store,
  fixture,
  owned,
  payVacancyReads,
  until,
}) => {
  const submits = fixture.submits;
  const link = new URL('/vacancy-pay-chat-link', fixture.url).href;
  const { counters, before, errors } = await captureNativeAssignmentChat(
    page.context().browser(),
    store,
    link
  );
  deepEqual(
    { ...counters, errors },
    { value: before, clicks: 0, sends: 0, errors: [] },
    'native chat capture leaves the composer untouched'
  );
  const priorReads = payVacancyReads.length;
  const plan = await openFormPlan(page, link, 'qa-profile:form-pay');
  const owner = owned.at(-1);
  const hourly = (report) =>
    report.fields.find((field) => field.name === 'hourly');
  const id = hourly(plan).id;
  const selection = page.locator(`[data-form-select="${id}"]`);
  const isParent = process.env.FORMS_VACANCY_PAY_PARENT === '1';
  try {
    assert(
      new URL(plan.url).search === '?from=chat' &&
        !plan.frames[0].intro.includes('3000р.'),
      'recorded form redirect has no pay introduction'
    );
    await selection.check();
    if (isParent) {
      assert(
        hourly(plan).answer.salary.guidance.source === 'owner-target',
        'published parent ignores the linked vacancy'
      );
      assert(payVacancyReads.length === priorReads, 'parent never reads pay');
      await page.setViewportSize({ width: 390, height: 844 });
      await captureFormField(page, id, 'before-mobile', 'vacancy_pay');
      console.log(
        '[forms-vacancy-pay-parent]',
        JSON.stringify(hourly(plan).answer.salary.guidance)
      );
      return;
    }
    if (process.env.CI_BROWSER_DEBUG === '1') {
      console.log(
        '[forms-vacancy-pay-plan]',
        JSON.stringify({
          vacancy: plan.planning.vacancy,
          guidance: hourly(plan).answer.salary?.guidance,
          reason: hourly(plan).answer.reason,
          reads: payVacancyReads.slice(priorReads),
        })
      );
    }
    deepEqual(
      {
        vacancy: plan.planning.vacancy.url,
        text: hourly(plan).answer.proposal?.value,
        evidence: hourly(plan).answer.salary.guidance.evidence,
      },
      {
        vacancy: vacancyUrl,
        text: formVacancyPayAnswer,
        evidence: `vacancy:hh:${vacancyId}`,
      },
      'exact DOM vacancy pay supplies the reviewed hourly draft'
    );
    await captureFormFieldLayouts(page, id, 'vacancy_pay');
    const message = await store.get(plan.planning.vacancy.sourceMessageId);
    await store.put({ ...message, deleted: true });
    const refused = await applyCurrent(page);
    deepEqual(
      {
        ok: refused.ok,
        code: refused.code,
        hourly: (await formControlValues(owner.page)).hourly,
        events: await owner.page.evaluate(() => globalThis.events),
      },
      { ok: false, code: 'form-answers-changed', hourly: '', events: [] },
      'deleted chat link invalidates review before any employer form write'
    );
    await store.put(message);
    const retry = await planCurrent(page);
    assert(
      hourly(retry).answer.proposal?.value === formVacancyPayAnswer,
      'replanning reuses the observed vacancy'
    );
    await selection.check();
    assertAppliedReceipts(
      await applyCurrent(page),
      1,
      'one native pay readback receipt'
    );
    const values = await formControlValues(owner.page);
    deepEqual(
      values,
      {
        hourly: formVacancyPayAnswer,
        monthly: '',
        ownerPay: 'Owner keeps this pay answer',
        technical: '',
      },
      'only the selected pay field is filled'
    );
    const reads = payVacancyReads.slice(priorReads);
    deepEqual(
      reads,
      [
        {
          useCase: 'forms',
          slot: 'form-vacancy',
          urls: [vacancyUrl],
          methods: ['GET'],
          closed: true,
        },
      ],
      'one read-only vacancy browser closes and apply needs only the cache'
    );
    console.log(
      '[forms-vacancy-pay]',
      JSON.stringify({
        values,
        reads,
        refused: refused.code,
        receipts: 1,
        submits: fixture.submits - submits,
      })
    );
  } finally {
    await closeFormReview(page, until, 'vacancy pay review closed');
    assert(
      owner.closed && fixture.submits === submits,
      'owned form closes without submission'
    );
    await page.setViewportSize({ width: 1200, height: 800 });
  }
};
