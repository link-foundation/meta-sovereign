import { questionKey } from '../automation/question-match.js';
import { validFormLinkAnswer } from './link-answers.js';

const matchingChoice = (text, options) => {
  const matches = options.filter(
    (option) =>
      !option.disabled && questionKey(option.label) === questionKey(text)
  );
  return matches.length === 1 ? matches[0] : null;
};
const checkboxProposal = (field, text, choices) => {
  if (choices.length > 1) {
    const selected = text.split(/\r?\n/u).map(questionKey).filter(Boolean);
    const available = choices
      .filter((choice) => !choice.disabled)
      .map((choice) => questionKey(choice.label));
    return selected.length &&
      selected.every(
        (label) => available.filter((choice) => choice === label).length === 1
      )
      ? { checked: selected.includes(questionKey(field.label)) }
      : null;
  }
  const value = questionKey(text);
  if (['yes', 'true', 'да', 'हाँ', 'हां', '是'].includes(value)) {
    return { checked: true };
  }
  return ['no', 'false', 'нет', 'नहीं', '否'].includes(value)
    ? { checked: false }
    : null;
};
const validDate = (text) =>
  /^\d{4}-\d{2}-\d{2}$/u.test(text) &&
  Number.isFinite(Date.parse(`${text}T00:00:00Z`)) &&
  new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
const validEmail = (value) => {
  if (value.length > 254 || /\s/u.test(value)) {
    return false;
  }
  const parts = value.split('@');
  const domain = parts[1] ?? '';
  const dot = domain.lastIndexOf('.');
  return (
    parts.length === 2 &&
    parts[0].length > 0 &&
    dot > 0 &&
    dot < domain.length - 1
  );
};
const formats = {
  date: validDate,
  number: (value) =>
    /^-?\d+(?:\.\d+)?$/u.test(value) && Number.isFinite(Number(value)),
  email: validEmail,
  url: (value) => {
    try {
      const url = new URL(value);
      return (
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  },
};
const textTypes = new Set([
  'text',
  'textarea',
  'textbox',
  'search',
  'tel',
  'email',
  'url',
  'date',
  'number',
  'contenteditable',
]);

const textProposal = (field, answer) => {
  if (field.type === 'number' && Number.isFinite(answer.salary?.amount)) {
    return { value: String(answer.salary.amount) };
  }
  return textTypes.has(field.type) &&
    validFormLinkAnswer(field, answer.text) &&
    (!formats[field.type] || formats[field.type](answer.text))
    ? { value: answer.text }
    : null;
};

export const proposalFor = (field, answer, choices) => {
  if (!answer.complete || !answer.text?.trim()) {
    return null;
  }
  if (['select', 'listbox', 'combobox'].includes(field.type)) {
    // A multiple select needs an explicit set rather than one guessed option.
    const option =
      !field.multiple && matchingChoice(answer.text, field.options);
    return option ? { value: option.value, option: option.label } : null;
  }
  if (field.type === 'radio') {
    const option = matchingChoice(answer.text, choices);
    return option ? { checked: field.id === option.id } : null;
  }
  if (field.type === 'checkbox') {
    return checkboxProposal(field, answer.text, choices);
  }
  return textProposal(field, answer);
};
