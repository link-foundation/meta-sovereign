import {
  prepareAnswerModelContext,
  modelFingerprint,
} from '../automation/answer-model-context.js';
import { runAnswerModelDrafts } from '../automation/answer-model-drafts.js';
import { answerModelFailure } from '../automation/answer-model-config.js';
import { proposalFor } from './proposals.js';

const group = (field) => field.radioGroup?.id ?? field.group?.id;
const choicesFor = (field, fields) =>
  ['radio', 'checkbox'].includes(field.type) && group(field)
    ? fields.filter(
        (other) =>
          other.type === field.type &&
          other.frame === field.frame &&
          group(other) === group(field)
      )
    : [];
const requestFor = (field, fields) => ({
  id: field.id,
  question: field.group?.label || field.label,
  type: field.type,
  options: (['radio', 'checkbox'].includes(field.type)
    ? choicesFor(field, fields)
    : field.options
  )
    .filter((option) => !option.disabled)
    .map((option) => option.label),
});
const candidates = (fields) => {
  const groups = new Set();
  return fields
    .filter((field) => {
      if (
        field.answer.proposal ||
        !['no-answer', 'choice-mismatch', 'field-format'].includes(
          field.answer.reason
        )
      ) {
        return false;
      }
      const key =
        group(field) && `${field.frame}:${field.type}:${group(field)}`;
      if (key && groups.has(key)) {
        return false;
      }
      if (key) {
        groups.add(key);
      }
      return true;
    })
    .map((field) => requestFor(field, fields));
};

const modelField = (field, fields, draft, model) => {
  const answer = {
    ...field.answer,
    text: draft.text,
    source: 'model',
    match: 'model',
    complete: !draft.missing.length && Boolean(draft.text),
    requiresReview: true,
    missing: draft.missing,
    evidence: draft.evidence,
    rules: [],
    similarity: null,
    reason: draft.missing.length ? 'model-clarification' : 'model-review',
    model: {
      provider: model.provider,
      name: model.model,
      revision: model.revision,
    },
  };
  const proposal = proposalFor(field, answer, choicesFor(field, fields));
  return {
    ...field,
    answer: {
      ...answer,
      proposal,
      complete: Boolean(proposal),
      reason: answer.complete && !proposal ? 'field-format' : answer.reason,
    },
  };
};

/** Frozen model proposals bind current context, never repeat a model at apply. */
export const formModelDrafts = async ({
  store,
  input,
  fields,
  context,
  runner,
  signal,
  frozen,
}) => {
  if (input.modelDraft !== undefined && typeof input.modelDraft !== 'boolean') {
    throw answerModelFailure(
      'answer-model-config',
      'Model draft opt-in must be a boolean.'
    );
  }
  if (!input.modelDraft) {
    return { fields, model: { available: false, used: false } };
  }
  const pending = candidates(fields);
  const requests = pending.slice(0, 25);
  const prepared = await prepareAnswerModelContext(
    store,
    context,
    requests.map((request) => request.question)
  );
  prepared.fingerprint = await modelFingerprint({
    context: prepared.fingerprint,
    fields,
  });
  if (frozen) {
    if (prepared.fingerprint !== frozen.planning.model.fingerprint) {
      throw answerModelFailure(
        'form-answers-changed',
        'Model context changed. Review a new plan.'
      );
    }
    return {
      fields: fields.map((field) => {
        const saved = frozen.fields.find((entry) => entry.id === field.id);
        return saved?.answer.source === 'model'
          ? { ...field, answer: saved.answer }
          : field;
      }),
      model: frozen.planning.model,
    };
  }
  const result = await runAnswerModelDrafts({
    prepared,
    requests,
    runner,
    signal,
    policy: context.policy,
  });
  return {
    fields: fields.map((field) => {
      const draft = result.drafts.find((entry) => {
        const requested = fields.find((item) => item.id === entry.id);
        return (
          entry.id === field.id ||
          (requested &&
            group(requested) &&
            requested.frame === field.frame &&
            requested.type === field.type &&
            group(requested) === group(field))
        );
      });
      return draft &&
        !field.answer.proposal &&
        ['no-answer', 'choice-mismatch', 'field-format'].includes(
          field.answer.reason
        )
        ? modelField(field, fields, draft, result.model)
        : field;
    }),
    model: {
      ...result.model,
      requested: requests.length,
      omitted: pending.length - requests.length,
    },
  };
};
