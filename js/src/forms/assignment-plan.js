import { assignmentResultField } from './assignment-recognition.js';

const existingValue = (field) =>
  ['radio', 'checkbox'].includes(field.type)
    ? Boolean(field.checked)
    : Boolean(field.value);
export const assignmentHeldFields = (fields) =>
  fields.map((field) => ({
    ...field,
    answer: {
      source: 'unresolved',
      text: '',
      complete: false,
      requiresReview: true,
      reason: 'assignment-required',
      rules: [],
      evidence: [],
      missing: [],
      proposal: null,
      preserveCurrent: existingValue(field),
    },
  }));

export const assignmentLinkField = (field, assignment) => {
  if (!assignment?.repository || !assignmentResultField(field)) {
    return null;
  }
  const supported =
    ['text', 'textarea', 'textbox', 'url', 'contenteditable'].includes(
      field.type
    ) &&
    !field.disabled &&
    !field.readOnly &&
    !field.indeterminate &&
    !field.valueOmitted;
  return {
    ...field,
    answer: {
      source: 'assignment',
      text: assignment.repository.url,
      complete: supported,
      requiresReview: true,
      reason: !supported
        ? 'protected-field'
        : existingValue(field)
          ? 'current-value'
          : 'review',
      rules: [],
      missing: [],
      evidence: [assignment.id],
      assignmentRevision: assignment.revision,
      proposal: supported ? { value: assignment.repository.url } : null,
      preserveCurrent: existingValue(field),
    },
  };
};
