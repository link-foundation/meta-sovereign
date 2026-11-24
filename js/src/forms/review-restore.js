import { formFailure as failure } from './options.js';
import {
  applyReviewedFields,
  selectedReviewFields,
  proposalMatches,
} from './review-apply.js';
import { reviewSnapshotKey } from './review-targets.js';
import { withRadioReview } from './review-radio.js';

export const createDraftRestorer =
  (dependencies) => (record, fields, check, guard) =>
    restoreReviewedFields({ ...dependencies, record, fields, check, guard });

/** Explicit draft values reuse owned targets and the full-document write/readback guard. */
export const restoreReviewedFields = async ({
  record,
  fields,
  check,
  guard,
  inspect,
  capture,
  write,
  clear,
  now,
}) => {
  const previous = record.reviewPlan;
  if (!previous || previous.expiresAt <= now()) {
    throw failure(
      'form-plan-expired',
      'Read the native page again before restoring.'
    );
  }
  let snapshot;
  const inspection = await inspect(record.browser, {
    check,
    onSnapshot: (value) => {
      snapshot = value;
    },
  });
  if (
    reviewSnapshotKey(inspection) !== reviewSnapshotKey(previous.inspection)
  ) {
    throw failure(
      'form-changed',
      'Current answers changed. Read the native page again.'
    );
  }
  const proposed = withRadioReview({ fields });
  const changes = proposed.fields.filter(
    (field) => !proposalMatches(field, field.answer.proposal)
  );
  const selected = changes.length
    ? selectedReviewFields(proposed, {
        fields: changes.map((field) => field.id),
      })
    : [];
  const targets = await capture(snapshot, proposed.fields, {
    trace: record.browser.trace,
  });
  const state = {
    id: globalThis.crypto.randomUUID(),
    inspection,
    proposed,
    targets,
  };
  try {
    await clear(record);
    await guard();
    await targets.check();
    const current = await inspect(record.browser, { check });
    if (reviewSnapshotKey(current) !== reviewSnapshotKey(inspection)) {
      throw failure(
        'form-changed',
        'The native form changed before restoration.'
      );
    }
    return await applyReviewedFields({
      record,
      state,
      fields: selected,
      fresh: () => inspect(record.browser, { check }),
      guard,
      write,
      check,
    });
  } finally {
    await targets.dispose();
  }
};
