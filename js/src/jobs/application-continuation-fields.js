import { automaticReviewFields } from '../forms/automatic-prefill.js';
import { proposalMatches } from '../forms/review-apply.js';
import { nativeApplicationFields } from './application-review.js';
import { applicationFailure as fail } from './application-options.js';

const unavailableResume = (page) =>
  page.resumeChooser?.open ||
  page.resumeChooser?.ambiguous ||
  page.resumeIndices?.length;

export const continuationFields = (record) => {
  const { report, page } = record;
  if (
    !report ||
    unavailableResume(page) ||
    report.coverage !== 'inspected' ||
    report.navigation.nextPage ||
    report.navigation.limited ||
    report.omissions?.length ||
    report.fields.some((field) => field.frame !== 'frame-1')
  ) {
    throw fail('incomplete');
  }
  const fields = nativeApplicationFields(report, page);
  if (fields.length !== page.fieldIndices.length || fields.length > 25) {
    throw fail('incomplete');
  }
  return fields.filter((field) => field.index !== page.letter?.index);
};
export const continuationWrites = (record) => {
  const native = new Set(continuationFields(record).map((field) => field.id));
  return automaticReviewFields(record.report).filter(
    (field) => native.has(field.id) && field.answer.source === 'exact'
  );
};
const selected = (field, fields) =>
  field.type === 'radio'
    ? field.radioGroup?.complete &&
      fields.some(
        (peer) => peer.radioGroup?.id === field.radioGroup.id && peer.checked
      )
    : field.checked;
export const continuationAnswered = (field, fields) => {
  if (
    field.disabled ||
    field.readOnly ||
    field.valueOmitted ||
    field.indeterminate ||
    field.multiple ||
    (field.tag === 'input' &&
      ![
        'text',
        'search',
        'email',
        'url',
        'tel',
        'number',
        'date',
        'checkbox',
        'radio',
      ].includes(field.type))
  ) {
    return false;
  }
  if (
    field.answer.source === 'exact' &&
    field.answer.complete &&
    field.answer.proposal &&
    proposalMatches(field, field.answer.proposal)
  ) {
    return true;
  }
  return ['checkbox', 'radio'].includes(field.type)
    ? Boolean(selected(field, fields))
    : ['input', 'textarea', 'select'].includes(field.tag) &&
        typeof field.value === 'string' &&
        Boolean(field.value.trim());
};
export const continuationEmpty = (field) =>
  ['checkbox', 'radio'].includes(field.type)
    ? !field.checked
    : field.value === '';
