import { planAnswer } from '../automation/question-answers.js';
import { prepareAnswerPreview } from '../automation/question-store.js';
import { withSalaryExchangeEvidence } from '../automation/salary-exchange-policy.js';
import { validateFormInspection } from './plan-validation.js';
import { formProfileFields } from './profile-fields.js';
import { proposalFor } from './proposals.js';
import { formModelDrafts } from './model-drafts.js';
import { formPayProfile } from './pay-profile.js';

const emptyAnswer = (reason) => ({
  source: 'unresolved',
  text: '',
  complete: false,
  requiresReview: true,
  reason,
  rules: [],
  evidence: [],
  missing: [],
  proposal: null,
});
const groupKey = (field) =>
  field.type === 'radio' && field.radioGroup?.id
    ? `${field.frame}:radio:${field.radioGroup.id}`
    : field.group?.id
      ? `${field.frame}:${field.group.id}:${field.type === 'radio' ? (field.name ?? '') : ''}`
      : null;
const choicesFor = (field, fields) => {
  const key = groupKey(field);
  return key
    ? fields.filter(
        (other) => groupKey(other) === key && other.type === field.type
      )
    : [];
};
const questionFor = (field) =>
  ['radio', 'checkbox'].includes(field.type) && field.group?.label
    ? field.group.label
    : field.label;
const profileRule = (question, keys) => ({
  id: 'qa-rule:form-profile',
  question,
  answers: [
    {
      text: keys.map((key) => `{{${key}}}`).join(', '),
      count: 0,
      approved: true,
    },
  ],
});
const provenance = (answer, keys, context) => ({
  source: keys.length
    ? 'profile'
    : answer.match === 'unanswered' || !answer.text
      ? 'unresolved'
      : answer.match,
  match: answer.match,
  similarity: keys.length ? null : (answer.similarity ?? null),
  rules: keys.length
    ? []
    : (answer.rules ?? []).map((id) => {
        const rule = context.rules.find((entry) => entry.id === id);
        return {
          id,
          question: rule?.question ?? '',
          questions: rule?.questions ?? [],
        };
      }),
  evidence: answer.evidence ?? [],
  profileKeys: keys,
  profileSource: context.profileSource ?? null,
});
const proposalReason = ({ limited, proposal, answer, existing }) =>
  limited
    ? 'planning-limit'
    : !proposal
      ? answer.missing?.length
        ? 'missing-profile'
        : answer.optionMismatch
          ? 'choice-mismatch'
          : answer.text
            ? 'field-format'
            : 'no-answer'
      : existing
        ? 'current-value'
        : 'review';
const protectedField = (field) =>
  field.disabled ||
  field.readOnly ||
  field.indeterminate ||
  field.valueOmitted ||
  ['password', 'file'].includes(field.type);
const existingValue = (field) =>
  ['radio', 'checkbox'].includes(field.type)
    ? field.checked === true
    : field.value !== null && field.value !== '';
const unresolvedField = (field, reason) => ({
  ...field,
  answer: { ...emptyAnswer(reason), preserveCurrent: existingValue(field) },
});
const planField = (field, fields, prepared) => {
  if (protectedField(field)) {
    return unresolvedField(field, 'protected-field');
  }
  const question = questionFor(field);
  if (!question.trim()) {
    return unresolvedField(field, 'missing-label');
  }
  const { context, rateState } = prepared;
  const choices = choicesFor(field, fields);
  const keys =
    context.profileId || Object.keys(context.profile).length
      ? formProfileFields({ ...field, label: question }, context.profile)
      : [];
  const options = ['select', 'listbox', 'combobox'].includes(field.type)
    ? field.options
    : field.type === 'radio'
      ? choices
      : [];
  context.matchBudget.exhausted = false;
  const answer = withSalaryExchangeEvidence(
    planAnswer(question, {
      ...context,
      intro:
        prepared.inspection.frames.find((frame) => frame.id === field.frame)
          ?.intro ?? '',
      questionMode: 'field',
      ...(keys.length ? { rules: [profileRule(question, keys)] } : {}),
      options: options
        .filter((option) => !option.disabled)
        .map((option) => option.label),
    }),
    rateState
  );
  const limited =
    context.matchBudget.exhausted &&
    !['exact', 'template', 'salary'].includes(answer.match);
  const proposal = limited ? null : proposalFor(field, answer, choices);
  const existing = existingValue(field);
  const reason = proposalReason({ limited, proposal, answer, existing });
  return {
    ...field,
    answer: {
      ...answer,
      ...provenance(answer, keys, context),
      proposal,
      complete: Boolean(proposal),
      requiresReview: true,
      reason,
      // Existing content is evidence, never an implicit instruction to replace it.
      preserveCurrent: existing,
    },
  };
};

/** Read-only proposals from one bounded knowledge snapshot; never opens a browser. */
export const planFormAnswers = async (store, input = {}, modelOptions = {}) => {
  const inspection = validateFormInspection(input.inspection);
  const prepared = await prepareAnswerPreview(
    store,
    {
      ...input,
      source: input.source ?? 'forms',
      chat: input.chat ?? inspection.url,
    },
    { maxBytes: 4 * 1024 ** 2 }
  );
  prepared.context.matchBudget = { remaining: 4 * 1024 ** 2, exhausted: false };
  prepared.inspection = inspection;
  prepared.context.salary ??= formPayProfile(prepared.context.profile);
  const deterministic = inspection.fields.map((field) =>
    planField(field, inspection.fields, prepared)
  );
  const { fields, model } = await formModelDrafts({
    store,
    input,
    fields: deterministic,
    context: prepared.context,
    ...modelOptions,
  });
  return {
    ...inspection,
    mode: 'answer-plan',
    plannedAt: new Date().toISOString(),
    fields,
    planning: {
      readOnly: true,
      requiresReview: true,
      profileSource: prepared.context.profileSource ?? null,
      proposed: fields.filter((field) => field.answer.proposal).length,
      unresolved: fields.filter((field) => !field.answer.proposal).length,
      preserved: fields.filter((field) => field.answer.preserveCurrent).length,
      model,
      limited: fields.filter(
        (field) => field.answer.reason === 'planning-limit'
      ).length,
    },
  };
};
