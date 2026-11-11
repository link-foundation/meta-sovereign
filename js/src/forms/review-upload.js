import { formFailure as failure } from './options.js';
import { reviewSnapshotKey } from './review-targets.js';
import { performReviewedEffect } from './review-effect.js';
import { currentFormAssignment } from './assignment-store.js';
import { withConfiguredResume } from './configured-resume.js';
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
const attachResume = async ({ record, input, check, inspect, now }) => {
  const pdf = resumePdf(input.file);
  const cached = record.lastUpload;
  if (cached?.planId === input.planId) {
    if (
      cached.fieldId !== input.fieldId ||
      cached.resumeRevision !== input.resumeRevision ||
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
  const result = await performReviewedEffect({
    record,
    state,
    check,
    inspect,
    unknownCode: 'form-upload-unknown',
    issue: () =>
      state.targets.control(field.id).setInputFiles(
        {
          name: pdf.metadata.name,
          mimeType: pdf.metadata.type,
          buffer: pdf.buffer,
        },
        { timeout: 5000 }
      ),
    readback: async () => {
      const actual = await state.targets
        .control(field.id)
        .evaluate(readUploadedPdf);
      check();
      const report = await inspect(record.browser, { check });
      return {
        state:
          JSON.stringify(actual) === JSON.stringify(pdf.metadata) &&
          unchangedFields(state.inspection, report, field.id, pdf.metadata)
            ? 'attached'
            : 'uncertain',
        report,
      };
    },
  });
  record.lastUpload = {
    ok: true,
    mode: 'upload-result',
    planId: state.id,
    fieldId: field.id,
    file: pdf.metadata,
    ...(input.resumeRevision ? { resumeRevision: input.resumeRevision } : {}),
    ...result,
  };
  return record.lastUpload;
};

const requireAssignmentForUpload = async (store, record) => {
  const reviewed = record.reviewPlan;
  if (reviewed) {
    const assignment = await currentFormAssignment(store, reviewed.inspection);
    if (
      assignment?.state === 'needs-repository' ||
      assignment?.revision !== reviewed.proposed?.planning?.assignment?.revision
    ) {
      throw failure(
        'form-assignment-required',
        'Review the current assignment repository before attaching a résumé.'
      );
    }
  }
};

export const attachReviewedResume = async (options) => {
  const { record, input, store } = options;
  await requireAssignmentForUpload(store, record);
  if (input.resumeRevision === undefined) {
    return attachResume(options);
  }
  if (input.file) {
    throw failure(
      'form-upload-file',
      'Choose either a saved résumé or a selected file.'
    );
  }
  const cached = record.lastUpload;
  if (cached?.planId === input.planId) {
    if (
      cached.fieldId !== input.fieldId ||
      cached.resumeRevision !== input.resumeRevision
    ) {
      throw failure(
        'form-upload-conflict',
        'This plan already attempted a different attachment.'
      );
    }
    return cached;
  }
  const { state } = uploadPlan(record, input, options.now);
  if (!state.resume || state.resume.revision !== input.resumeRevision) {
    throw failure(
      'form-resume-changed',
      'Plan the current page to review this saved PDF.'
    );
  }
  return withConfiguredResume(store, input.resumeRevision, (file) =>
    attachResume({ ...options, input: { ...input, file } })
  );
};
