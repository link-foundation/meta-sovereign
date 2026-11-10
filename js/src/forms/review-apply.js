import { formFailure as failure } from './options.js';
import { reviewSnapshotKey, writableReviewField } from './review-targets.js';

export const proposalMatches = (field, proposal) =>
  proposal.checked === undefined
    ? field.value === proposal.value
    : field.checked === proposal.checked;

const populated = (field) =>
  ['checkbox', 'radio'].includes(field.type)
    ? field.checked === true
    : field.value !== null && field.value !== '';

export const selectedReviewFields = (plan, input) => {
  const ids = input.fields;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 25 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string')
  ) {
    throw failure(
      'form-selection',
      'Select one to 25 distinct reviewed fields.'
    );
  }
  const fields = ids.map((id) => plan.fields.find((field) => field.id === id));
  if (fields.some((field) => !field || !writableReviewField(field))) {
    throw failure(
      'form-selection',
      'Only supported proposed fields can be selected.'
    );
  }
  const changes = fields.filter(
    (field) => !proposalMatches(field, field.answer.proposal)
  );
  if (changes.some(populated) && input.replaceExisting !== true) {
    throw failure(
      'form-existing-value',
      'Explicitly allow replacement of selected existing answers.'
    );
  }
  return fields;
};

const verifyReadback = (before, after, field, proposal) => {
  const changed = after.fields.find((item) => item.id === field.id);
  if (!changed || !proposalMatches(changed, proposal)) {
    throw failure(
      'form-readback',
      'The selected field did not retain the proposed value.'
    );
  }
  const expected = globalThis.structuredClone(before);
  const updated = expected.fields.find((item) => item.id === field.id);
  if (proposal.checked === undefined) {
    updated.value = proposal.value;
    if (updated.tag === 'select') {
      updated.options = updated.options.map((option) => ({
        ...option,
        selected: option.value === proposal.value,
      }));
    }
  } else {
    updated.checked = proposal.checked;
  }
  if (reviewSnapshotKey(expected) !== reviewSnapshotKey(after)) {
    throw failure(
      'form-changed',
      'The page changed beyond the selected field. Review it again.'
    );
  }
};

/** Each attempted write is recorded before awaiting it; uncertain results never replay. */
export const applyReviewedFields = async ({
  record,
  state,
  fields,
  fresh,
  guard,
  write,
  check,
}) => {
  const result = {
    ok: false,
    mode: 'apply-result',
    planId: state.id,
    state: 'applying',
    receipts: fields.map((field) => ({
      fieldId: field.id,
      label: field.label || field.id,
      status: 'not-attempted',
    })),
    report: state.inspection,
  };
  record.lastApplication = result;
  let expected = state.inspection;
  try {
    for (const [index, field] of fields.entries()) {
      check();
      // Storage guards can await a concurrent writer. Read the actual DOM only
      // after that wait so an owner edit made meanwhile cannot be overwritten.
      await guard();
      check();
      await state.targets.check();
      const current = await fresh();
      result.report = current;
      if (reviewSnapshotKey(current) !== reviewSnapshotKey(expected)) {
        throw failure(
          'form-changed',
          'Current answers changed. Plan the current page again.'
        );
      }
      check();
      const receipt = result.receipts[index];
      if (
        proposalMatches(
          current.fields.find((entry) => entry.id === field.id),
          field.answer.proposal
        )
      ) {
        receipt.status = 'unchanged';
        continue;
      }
      receipt.status = 'uncertain';
      await write(record.browser, state.targets.get(field.id), field);
      check();
      const after = await fresh();
      result.report = after;
      verifyReadback(expected, after, field, field.answer.proposal);
      receipt.status = 'applied';
      expected = after;
    }
    await guard();
    check();
    result.ok = true;
    result.state = 'applied';
  } catch (error) {
    result.code = error.code ?? 'form-write-uncertain';
    result.state = result.receipts.some(
      (receipt) => receipt.status === 'uncertain'
    )
      ? 'uncertain'
      : result.receipts.some((receipt) => receipt.status === 'applied')
        ? 'partial'
        : 'refused';
    try {
      result.report = await fresh();
    } catch {
      /* Keep the last confirmed snapshot. */
    }
  }
  return result;
};
