import { planFormAnswers } from './answer-plan.js';
import { inspectCurrentFormSession } from './inspection.js';
import { formFailure as failure } from './options.js';
import {
  captureReviewTargets,
  reviewSnapshotKey,
  writableReviewField,
  writeReviewTarget,
} from './review-targets.js';
import { selectedReviewFields, applyReviewedFields } from './review-apply.js';
import { withRadioReview } from './review-radio.js';
import { expandableReviewField } from './review-custom.js';
import { attachReviewedResume } from './review-upload.js';
import { resumeUploadField } from './resume-upload.js';
import { discloseReviewedOptions } from './review-disclosure.js';
import { configuredResume } from './configured-resume.js';
import { automaticReviewFields } from './automatic-prefill.js';

const answerKey = (plan) =>
  JSON.stringify(plan.fields.map((field) => field.answer));
const planOptions = (input) => ({
  profileId: input.profileId ?? '',
  approximate: input.approximate !== false,
  matching: input.matching,
  modelDraft: input.modelDraft === true,
  salary: input.salary,
  vacancy: input.vacancy,
  source: input.source,
  chat: input.chat,
});

const requireAnswerForm = (inspection) => {
  if (inspection.challenge?.active) {
    throw failure('form-captcha', 'Solve verification in the review browser.');
  }
};

const reviewedField = (field, assignment) => ({
  ...field,
  answer: {
    ...field.answer,
    applySupported: writableReviewField(field),
    inspectOptionsSupported: expandableReviewField(field),
    uploadSupported:
      assignment?.state !== 'needs-repository' && resumeUploadField(field),
  },
});

export const createReviewedPrefill = ({
  store,
  now = () => Date.now(),
  inspect = inspectCurrentFormSession,
  capture = captureReviewTargets,
  write = writeReviewTarget,
  modelRunner,
} = {}) => {
  const clear = async (record) => {
    const state = record.reviewPlan;
    record.reviewPlan = null;
    await state?.targets.dispose();
  };
  const plan = async (record, input, check) => {
    if (
      input.modelDraft !== undefined &&
      typeof input.modelDraft !== 'boolean'
    ) {
      throw failure(
        'answer-model-config',
        'Model draft opt-in must be a boolean.'
      );
    }
    await clear(record);
    let snapshot;
    const inspection = await inspect(record.browser, {
      check,
      onSnapshot: (value) => {
        snapshot = value;
      },
    });
    requireAnswerForm(inspection);
    const options = planOptions(input);
    const proposed = withRadioReview(
      await planFormAnswers(
        store,
        { inspection, ...options },
        {
          runner: modelRunner,
          signal: record.operationAbort?.signal,
        }
      )
    );
    const resume = await configuredResume(store);
    check();
    const targets = await capture(snapshot, proposed.fields, {
      trace: record.browser.trace,
    });
    try {
      await targets.check();
      const current = await inspect(record.browser, { check });
      if (reviewSnapshotKey(inspection) !== reviewSnapshotKey(current)) {
        throw failure(
          'form-changed',
          'The form changed during planning. Plan its current page again.'
        );
      }
      const state = {
        id: globalThis.crypto.randomUUID(),
        inspection,
        proposed,
        resume,
        targets,
        options,
        expiresAt: now() + 600000,
      };
      record.reviewPlan = state;
      return {
        ...proposed,
        fields: proposed.fields.map((field) =>
          reviewedField(field, proposed.planning.assignment)
        ),
        reviewPlan: {
          id: state.id,
          sessionId: record.id,
          expiresAt: new Date(state.expiresAt).toISOString(),
          maxSelected: 25,
          resume,
        },
      };
    } catch (error) {
      await targets.dispose();
      throw error;
    }
  };
  const apply = async (record, input, check, select = selectedReviewFields) => {
    if (record.lastApplication?.planId === input.planId) {
      return record.lastApplication;
    }
    const state = record.reviewPlan;
    if (!state || state.id !== input.planId || state.expiresAt <= now()) {
      throw failure(
        'form-plan-expired',
        'Plan the current page again before applying answers.'
      );
    }
    const fields = select(state.proposed, input);
    record.reviewPlan = null;
    const fresh = () => inspect(record.browser, { check });
    const guard = async () => {
      const current = withRadioReview(
        await planFormAnswers(
          store,
          {
            inspection: state.inspection,
            ...state.options,
          },
          { frozen: state.proposed }
        )
      );
      if (
        current.planning.assignment?.revision !==
          state.proposed.planning.assignment?.revision ||
        answerKey(current) !== answerKey(state.proposed)
      ) {
        throw failure(
          'form-answers-changed',
          'Saved answers or profile changed. Review a new plan.'
        );
      }
    };
    try {
      return await applyReviewedFields({
        record,
        state,
        fields,
        fresh,
        guard,
        write,
        check,
      });
    } finally {
      await state.targets.dispose();
    }
  };
  return {
    inspect,
    plan,
    apply,
    applyEmpty: (record, input, check) =>
      apply(record, input, check, automaticReviewFields),
    clear,
    attach: (record, input, check) =>
      attachReviewedResume({ record, input, check, inspect, now, store }),
    disclose: (record, input, check) =>
      discloseReviewedOptions({ record, input, check, inspect, now }),
  };
};
