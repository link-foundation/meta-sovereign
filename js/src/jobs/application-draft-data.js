import { jobsFailure } from './options.js';

const text = (value, max) => typeof value === 'string' && value.length <= max;
export const draftFailure = () =>
  jobsFailure(
    'application-draft',
    'Read a complete native questionnaire and review its saved answers before backing up or restoring. Existing answers are preserved.'
  );
const choice = (type) => ['checkbox', 'radio'].includes(type);
const types = [
  'text',
  'search',
  'email',
  'url',
  'tel',
  'number',
  'date',
  'textarea',
  'select',
  'checkbox',
  'radio',
];
const validField = (field) =>
  field &&
  text(field.key, 40000) &&
  field.key.length > 0 &&
  text(field.label, 2000) &&
  field.label.length > 0 &&
  types.includes(field.type) &&
  text(field.value, 10000) &&
  (choice(field.type)
    ? typeof field.checked === 'boolean'
    : field.checked === null);
const validLimit = (limit) =>
  limit === null ||
  limit === undefined ||
  (text(limit.documentKey, 100) &&
    Boolean(limit.documentKey) &&
    text(limit.until, 40) &&
    Number.isFinite(Date.parse(limit.until)) &&
    new Date(limit.until).toISOString() === limit.until);

/** Private values, never an answer-knowledge source or a durable DOM target. */
export const applicationDraft = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    value.version !== 1 ||
    !text(value.id, 100) ||
    !value.id ||
    !text(value.capturedAt, 40) ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    !Array.isArray(value.fields) ||
    !value.fields.length ||
    value.fields.length > 25 ||
    !value.fields.every(validField) ||
    !validLimit(value.limit) ||
    new Set(value.fields.map((field) => field.key)).size !==
      value.fields.length ||
    JSON.stringify(value).length > 512 * 1024
  ) {
    throw draftFailure();
  }
  return globalThis.structuredClone(value);
};

// Answers and option selection change during restoration; question semantics do not.
export const draftFieldKey = (field) =>
  JSON.stringify([
    field.id,
    field.frame,
    field.index,
    field.tag,
    field.type,
    field.nativeId ?? '',
    field.name ?? '',
    field.label,
    field.labelSource,
    field.description,
    field.heading ?? '',
    field.required,
    field.group ?? null,
    field.radioGroup ?? null,
    choice(field.type) ? field.value : null,
    field.options.map(({ selected: _selected, ...option }) => option),
  ]);
export const draftProposal = (field) =>
  choice(field.type) ? { checked: field.checked } : { value: field.value };

export const draftRestoration = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    !['restoring', 'restored', 'refused', 'partial', 'uncertain'].includes(
      value.state
    ) ||
    !['applied', 'unchanged', 'uncertain'].every(
      (key) =>
        Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 25
    ) ||
    !(value.code === null || text(value.code, 100))
  ) {
    throw draftFailure();
  }
  return globalThis.structuredClone(value);
};
