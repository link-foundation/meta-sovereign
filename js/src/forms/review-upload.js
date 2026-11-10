import { formFailure as failure } from './options.js';
import { reviewSnapshotKey } from './review-targets.js';
import {
  resumePdf,
  resumeUploadField,
  readUploadedPdf,
} from './resume-upload.js';

const uploadPlan = (record, input, now) => {
  const state = record.reviewPlan;
  if (!state || state.id !== input.planId || state.expiresAt <= now()) {
    throw failure(
      'form-plan-expired',
      'Plan the current page before attaching a résumé.'
    );
  }
  const field = state.proposed.fields.find((item) => item.id === input.fieldId);
  if (!field || !resumeUploadField(field)) {
    throw failure(
      'form-upload-unavailable',
      'This field has no supported PDF résumé upload.'
    );
  }
  if (field.upload.files.length && input.replaceExisting !== true) {
    throw failure(
      'form-existing-value',
      'Allow replacing the currently attached file.'
    );
  }
  return { state, field };
};

const unchangedFields = (before, after, fieldId, metadata) => {
  const current = after.fields.find((field) => field.id === fieldId);
  const files = current?.upload?.files;
  if (
    files?.length !== 1 ||
    !['name', 'size', 'type'].every((key) => files[0][key] === metadata[key])
  ) {
    return false;
  }
  const previous = before.fields.find((field) => field.id === fieldId);
  const expected = {
    ...before,
    fields: before.fields.map((field) =>
      field.id === fieldId
        ? { ...previous, upload: { ...previous.upload, files } }
        : field
    ),
  };
  return reviewSnapshotKey(expected) === reviewSnapshotKey(after);
};

/** Consume one reviewed attachment before issue; keep actual outcomes without replay. */
export const attachReviewedResume = async ({
  record,
  input,
  check,
  inspect,
  now,
}) => {
  const pdf = resumePdf(input.file);
  const cached = record.lastUpload;
  if (cached?.planId === input.planId) {
    if (
      cached.fieldId !== input.fieldId ||
      JSON.stringify(cached.file) !== JSON.stringify(pdf.metadata)
    ) {
      throw failure(
        'form-upload-conflict',
        'This plan already attempted a different attachment.'
      );
    }
    return cached;
  }
  const { state, field } = uploadPlan(record, input, now);
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
        'The form changed. Plan its current page again.'
      );
    }
    await state.targets.check();
    check();
    const target = state.targets.control(field.id);
    issued = true;
    await target.setInputFiles(
      {
        name: pdf.metadata.name,
        mimeType: pdf.metadata.type,
        buffer: pdf.buffer,
      },
      { timeout: 5000 }
    );
    check();
    await state.targets.check();
    const actual = await target.evaluate(readUploadedPdf);
    check();
    report = await inspect(record.browser, { check });
    result = {
      state:
        JSON.stringify(actual) === JSON.stringify(pdf.metadata) &&
        unchangedFields(state.inspection, report, field.id, pdf.metadata)
          ? 'attached'
          : 'uncertain',
      report,
    };
  } catch (error) {
    result = {
      state: issued ? 'uncertain' : 'refused',
      code: error.code ?? 'form-upload-unknown',
      report: issued ? null : report,
    };
  } finally {
    await state.targets.dispose();
  }
  record.lastUpload = {
    ok: true,
    mode: 'upload-result',
    planId: state.id,
    fieldId: field.id,
    file: pdf.metadata,
    ...result,
  };
  return record.lastUpload;
};
