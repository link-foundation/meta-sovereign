import { questionKey } from '../automation/question-match.js';

const excluded = (field) =>
  !field.label?.trim() ||
  field.disabled ||
  field.readOnly ||
  field.valueOmitted ||
  ['password', 'file', 'hidden'].includes(field.type) ||
  field.indeterminate ||
  field.optionsComplete === false;

export const formFieldIdentity = (field, report) =>
  JSON.stringify([
    report.frames.find((frame) => frame.id === field.frame)?.url ?? report.url,
    field.nativeId,
    field.name,
    field.index,
    field.type,
    field.label,
    field.group?.label ?? '',
  ]);

const groupIdentity = (field) =>
  ['radio', 'checkbox'].includes(field.type) && field.group?.label
    ? `${field.frame}:${field.type}:${field.radioGroup?.id ?? field.group.id}`
    : null;

const choiceText = (field) => {
  if (['select', 'listbox', 'combobox'].includes(field.type)) {
    return field.options
      .filter((option) => option.selected)
      .map((option) => option.label)
      .join(', ');
  }
  return field.type === 'checkbox'
    ? field.checked
      ? 'Yes'
      : 'No'
    : field.value;
};

/** Actual visible answers only; proposals never enter the observed value. */
export const formAnswerPairs = (report) => {
  const groups = new Set();
  const pairs = [];
  for (const field of report.fields) {
    if (excluded(field)) {
      continue;
    }
    const group = groupIdentity(field);
    if (group && groups.has(group)) {
      continue;
    }
    groups.add(group);
    const members = group
      ? report.fields.filter((other) => groupIdentity(other) === group)
      : [field];
    if (
      members.some(excluded) ||
      members.some(
        (member) => member.type === 'radio' && !member.radioGroup?.complete
      )
    ) {
      continue;
    }
    const question = group ? field.group.label : field.label;
    const text = group
      ? members
          .filter((member) => member.checked)
          .map((member) => member.label)
          .join(', ')
      : choiceText(field);
    if (!questionKey(question) || typeof text !== 'string') {
      continue;
    }
    pairs.push({
      key: formFieldIdentity(field, report),
      question,
      text: text.trim(),
      field: { type: field.type, label: field.label, group: field.group },
      members: members.map((member) => formFieldIdentity(member, report)),
      controls: members.map((member) => member.index),
      url:
        report.frames.find((frame) => frame.id === field.frame)?.url ??
        report.url,
    });
  }
  return pairs;
};
