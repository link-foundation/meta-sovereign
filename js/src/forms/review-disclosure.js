import { formFailure as failure } from './options.js';
import { expandableReviewField } from './review-custom.js';
import { reviewSnapshotKey } from './review-targets.js';

const unchangedAnswers = (before, after, fieldId) => {
  if (before.fields.length !== after.fields.length) {
    return false;
  }
  return before.fields.every((previous, index) => {
    const current = after.fields[index];
    const a = { ...previous };
    const b = { ...current };
    if (previous.id === fieldId) {
      for (const key of [
        'options',
        'optionsComplete',
        'optionsExpanded',
        'optionsDisclosure',
      ]) {
        delete a[key];
        delete b[key];
      }
      // Lazy options can reveal a selected value; retain the actual display guard.
      if (!previous.options.length) {
        delete a.value;
        delete b.value;
      }
    }
    return JSON.stringify(a) === JSON.stringify(b);
  });
};

const disclosurePlan = (record, input, now) => {
  const state = record.reviewPlan;
  if (!state || state.id !== input.planId || state.expiresAt <= now()) {
    throw failure(
      'form-plan-expired',
      'Plan the current page before inspecting choices.'
    );
  }
  const field = state.proposed.fields.find((item) => item.id === input.fieldId);
  if (!field || !expandableReviewField(field)) {
    throw failure(
      'form-choices-unavailable',
      'This field has no supported closed choice menu.'
    );
  }
  return { state, field };
};

/** A disclosure is an explicit single click, consumed before issue and never replayed. */
export const discloseReviewedOptions = async ({
  record,
  input,
  check,
  inspect,
  now,
}) => {
  const cached = record.lastDisclosure;
  if (cached?.planId === input.planId && cached.fieldId === input.fieldId) {
    return cached;
  }
  const { state, field } = disclosurePlan(record, input, now);
  record.reviewPlan = null;
  let issued = false;
  let report = null;
  let result;
  try {
    await state.targets.check();
    report = await inspect(record.browser, { check });
    if (reviewSnapshotKey(report) !== reviewSnapshotKey(state.inspection)) {
      throw failure(
        'form-changed',
        'The reviewed form changed. Plan the current page again.'
      );
    }
    await state.targets.check();
    check();
    issued = true;
    await state.targets.control(field.id).click({ timeout: 5000 });
    check();
    await state.targets.check();
    report = await inspect(record.browser, { check });
    const current = report.fields.find((item) => item.id === field.id);
    const opened =
      current?.optionsExpanded === true &&
      current.options.some((option) => option.visible) &&
      unchangedAnswers(state.inspection, report, field.id);
    result = { state: opened ? 'opened' : 'uncertain', report };
  } catch (error) {
    result = {
      state: issued ? 'uncertain' : 'refused',
      code: error.code ?? 'form-choices-unknown',
      report: issued ? null : report,
    };
  } finally {
    await state.targets.dispose();
  }
  record.lastDisclosure = {
    ok: true,
    mode: 'choices-result',
    planId: state.id,
    fieldId: field.id,
    ...result,
  };
  return record.lastDisclosure;
};
