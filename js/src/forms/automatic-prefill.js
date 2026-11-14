import { createHash } from 'node:crypto';
import { formFailure as failure } from './options.js';
import { writableReviewField, reviewSnapshotKey } from './review-targets.js';
import { proposalMatches } from './review-apply.js';
import { resumePdf, resumeUploadField } from './resume-upload.js';
import { waitForManualChallenge } from './challenge-wait.js';

/** Automatic writes never replace an answer, including a radio peer's value. */
export const automaticReviewFields = (plan) =>
  plan.fields.filter(
    (field) =>
      field.answer.complete &&
      !field.answer.missing?.length &&
      !field.answer.preserveCurrent &&
      !field.answer.effects?.length &&
      writableReviewField(field) &&
      !proposalMatches(field, field.answer.proposal)
  );

const requestSignature = (input) => {
  if (
    typeof input.requestId !== 'string' ||
    !input.requestId.trim() ||
    input.requestId.length > 128
  ) {
    throw failure(
      'form-prefill-request',
      'Supply a distinct prefill request ID.'
    );
  }
  const { file } = input;
  return createHash('sha256')
    .update(
      JSON.stringify({
        profileId: input.profileId,
        approximate: input.approximate,
        matching: input.matching,
        modelDraft: input.modelDraft,
        salary: input.salary,
        vacancy: input.vacancy,
        file: file ? resumePdf(file).metadata : null,
      })
    )
    .digest('hex');
};

export const recoverPrefill = (record, input) => {
  const signature = requestSignature(input);
  if (record.lastPrefill?.result.requestId !== input.requestId) {
    return null;
  }
  if (record.lastPrefill.signature !== signature) {
    throw failure(
      'form-prefill-conflict',
      'This request already attempted a different prefill.'
    );
  }
  return record.lastPrefill.result;
};

const ownerRadio = (field, fields) =>
  field.type === 'radio' &&
  field.radioGroup?.id &&
  fields.some(
    (other) =>
      other.type === 'radio' &&
      other.checked &&
      other.frame === field.frame &&
      other.radioGroup?.id === field.radioGroup?.id
  );

const finish = (result, initial) => {
  const fields = result.report?.fields ?? initial?.fields ?? [];
  result.report = result.report && {
    ...result.report,
    fields: fields.map((field) => ({
      ...field,
      plannedAnswer: initial?.fields.find((item) => item.id === field.id)
        ?.answer,
    })),
  };
  result.unresolved = fields
    .filter((field) => {
      const planned = initial?.fields.find((item) => item.id === field.id);
      return (
        !field.disabled &&
        !field.readOnly &&
        !planned?.answer.preserveCurrent &&
        !ownerRadio(field, fields) &&
        !(field.type === 'file' && field.upload?.files?.length) &&
        !result.receipts.some(
          (receipt) =>
            receipt.fieldId === field.id &&
            ['applied', 'unchanged'].includes(receipt.status)
        ) &&
        !(
          planned?.answer.proposal &&
          proposalMatches(field, planned.answer.proposal)
        )
      );
    })
    .map((field) => ({
      fieldId: field.id,
      label: field.label,
      reason:
        initial?.fields.find((item) => item.id === field.id)?.answer.reason ??
        'not-filled',
    }));
  result.nextPage = Boolean(result.report?.navigation?.nextPage);
  result.complete =
    result.ok &&
    fields.length > 0 &&
    result.report?.coverage === 'inspected' &&
    !result.unresolved.length;
  if (result.ok) {
    result.state = result.complete ? 'prefilled' : 'partial';
  }
  result.note = result.nextPage
    ? 'Review the current answers, open the next page yourself, and run prefill again. Submit the form yourself when finished.'
    : 'Review the current answers and complete open questions. Submit the form yourself when finished.';
  return result;
};

const uploadEmptyResumes = async ({
  initial,
  record,
  input,
  anchor,
  result,
  perform,
  check,
}) => {
  if (!input.file && !initial.reviewPlan.resume) {
    return true;
  }
  const uploads = initial.fields.filter(
    (field) => resumeUploadField(field) && !field.upload.files.length
  );
  // Plans expose answers separately from the original inspection fields.
  let expected = {
    ...result.report,
    fields: result.report.fields.map(({ answer: _answer, ...field }) => field),
  };
  for (const field of uploads) {
    check();
    await anchor.check();
    const plan = await perform('plan', { ...input, modelDraft: false }, false);
    await anchor.check();
    const current = record.reviewPlan.inspection;
    result.report = current;
    if (reviewSnapshotKey(expected) !== reviewSnapshotKey(current)) {
      throw failure(
        'form-changed',
        'Answers changed before the next attachment. Review the current page again.'
      );
    }
    const attached = await perform('attach', {
      planId: plan.reviewPlan.id,
      fieldId: field.id,
      ...(input.file
        ? { file: input.file }
        : { resumeRevision: initial.reviewPlan.resume.revision }),
    });
    const { report: _report, reviewSession: _session, ...receipt } = attached;
    result.uploads.push(receipt);
    result.report = attached.report ?? result.report;
    if (attached.state !== 'attached') {
      result.state = attached.state;
      result.code = attached.code;
      return false;
    }
    expected = attached.report;
  }
  return true;
};

const requireAutomaticFields = (initial, cleared) => {
  if (initial.planning?.assignment?.state === 'needs-repository') {
    throw failure(
      'form-assignment-required',
      'Create the test-assignment repository, verify its link, then prefill again.'
    );
  }
  if (cleared && cleared.url !== initial.url) {
    throw failure(
      'form-changed',
      'The verified form navigated before planning.'
    );
  }
  if (!initial.fields.length) {
    throw failure('form-no-fields', 'No answer fields were inspected.');
  }
};

/** One owned operation, one initial document boundary, and no automatic replay. */
export const prefillFormReview = async ({
  record,
  input,
  perform,
  filling,
  check,
  onWaiting,
  challenge = {},
}) => {
  const signature = requestSignature(input);
  const cached = recoverPrefill(record, input);
  if (cached) {
    return cached;
  }
  record.prefillRequests ??= new Set();
  if (
    record.prefillRequests.has(input.requestId) ||
    record.prefillRequests.size >= 1000
  ) {
    throw failure(
      'form-prefill-expired',
      'This receipt is no longer recoverable, or the session request limit was reached. Read the current page and use a fresh request or review session.'
    );
  }
  record.prefillRequests.add(input.requestId);
  const result = {
    ok: false,
    mode: 'prefill-result',
    requestId: input.requestId,
    state: 'planning',
    complete: false,
    unresolved: [],
    requiresReview: true,
    submissionAttempted: false,
    receipts: [],
    uploads: [],
    report: null,
  };
  record.lastPrefill = { signature, result };
  let initial;
  let anchor;
  let succeeded = false;
  try {
    const cleared = await waitForManualChallenge({
      ...challenge,
      record,
      result,
      inspect: filling.inspect,
      check,
      onWaiting,
    });
    initial = await perform('plan', input);
    result.report = initial;
    requireAutomaticFields(initial, cleared);
    anchor = record.reviewPlan.targets;
    // Keep the initial document/control bindings across subsequent upload plans.
    record.reviewPlan.targets = { ...anchor, dispose: async () => {} };
    if (automaticReviewFields(initial).length) {
      const applied = await perform('applyEmpty', {
        planId: initial.reviewPlan.id,
      });
      result.receipts = applied.receipts;
      result.report = applied.report;
      if (!applied.ok) {
        result.state = applied.state;
        result.code = applied.code;
        return finish(result, initial);
      }
    }
    if (
      !(await uploadEmptyResumes({
        initial,
        record,
        input,
        anchor,
        result,
        perform,
        check,
      }))
    ) {
      return finish(result, initial);
    }
    check();
    await anchor.check();
    succeeded = true;
  } catch (error) {
    result.state =
      result.receipts.some((receipt) => receipt.status === 'applied') ||
      result.uploads.some((upload) => upload.state === 'attached')
        ? 'partial'
        : 'refused';
    result.code = error.code ?? 'form-prefill-failed';
  } finally {
    await filling.clear(record);
    await anchor?.dispose();
  }
  result.ok = succeeded;
  return finish(result, initial);
};
