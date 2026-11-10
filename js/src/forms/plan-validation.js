const fail = () => {
  throw Object.assign(new Error('Use a bounded form inspection report.'), {
    code: 'form-report',
  });
};
const text = (value, max) => typeof value === 'string' && value.length <= max;
const id = (value) => text(value, 120) && value.length > 0;
const validUrl = (value, child = false) => {
  if (child && ['about:blank', 'about:srcdoc'].includes(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
const list = (values, max, check) =>
  Array.isArray(values) && values.length <= max && values.every(check);
const reason = (value) => text(value, 80);
const option = (value) =>
  value &&
  text(value.label, 2000) &&
  text(value.value, 2000) &&
  typeof value.disabled === 'boolean' &&
  (value.index === undefined ||
    (Number.isInteger(value.index) &&
      value.index >= 0 &&
      value.index < 10000)) &&
  ['visible', 'clickable', 'selected'].every(
    (key) => value[key] === undefined || typeof value[key] === 'boolean'
  );
const validState = (field) =>
  ['required', 'disabled', 'readOnly'].every(
    (key) => typeof field[key] === 'boolean'
  ) &&
  ['multiple', 'indeterminate'].every(
    (key) => field[key] === undefined || typeof field[key] === 'boolean'
  ) &&
  (field.value === null || text(field.value, 10000)) &&
  (field.checked === null || typeof field.checked === 'boolean') &&
  [null, 'password', 'file'].includes(field.valueOmitted) &&
  (!field.group ||
    (text(field.group.label, 2000) && text(field.group.id ?? '', 120)));
const validRadioGroup = (group) =>
  group === undefined ||
  (group &&
    id(group.id) &&
    Number.isInteger(group.size) &&
    group.size > 0 &&
    group.size <= 2000 &&
    typeof group.complete === 'boolean');
const validCustomState = (field) =>
  (field.optionsDisclosure === undefined ||
    typeof field.optionsDisclosure === 'boolean') &&
  (field.optionsExpanded === undefined ||
    field.optionsExpanded === null ||
    typeof field.optionsExpanded === 'boolean') &&
  (field.optionsComplete === undefined ||
    typeof field.optionsComplete === 'boolean') &&
  (field.displayValue === undefined || text(field.displayValue, 10000)) &&
  (!field.custom ||
    ['editable', 'clickable', 'checkedKnown'].every(
      (key) => typeof field.custom[key] === 'boolean'
    ));
const validField = (field, frames) =>
  field &&
  id(field.id) &&
  frames.has(field.frame) &&
  text(field.label, 2000) &&
  text(field.labelSource, 80) &&
  text(field.type, 40) &&
  text(field.description ?? '', 2000) &&
  validState(field) &&
  validRadioGroup(field.radioGroup) &&
  validCustomState(field) &&
  list(field.options, 100, option);
const validFrame = (frame) =>
  frame &&
  id(frame.id) &&
  validUrl(frame.url, frame.parent !== null) &&
  list(frame.reasons, 30, reason);
const reportIdentity = (input) =>
  input?.ok === true &&
  input.version === 1 &&
  input.mode === 'read-only' &&
  input.targetLifetime === 'snapshot-only' &&
  input.scope === 'visible-current-pages' &&
  ['inspected', 'partial'].includes(input.coverage) &&
  validUrl(input.url) &&
  text(input.title, 2000) &&
  text(input.capturedAt, 40) &&
  Number.isFinite(Date.parse(input.capturedAt));
const validShape = (input) =>
  reportIdentity(input) &&
  list(input.frames, 10, validFrame) &&
  input.frames.length > 0 &&
  list(input.omissions, 30, (item) => item && reason(item.reason)) &&
  Array.isArray(input.fields) &&
  input.fields.length <= 200;
const boundedJson = (input) => {
  try {
    return JSON.stringify(input).length <= 2 * 1024 ** 2;
  } catch {
    return false;
  }
};

/** Reject oversized/unrelated input before reading private answer knowledge. */
export const validateFormInspection = (input) => {
  if (!validShape(input) || !boundedJson(input)) {
    fail();
  }
  const frames = new Set(input.frames.map((frame) => frame.id));
  if (
    frames.size !== input.frames.length ||
    input.fields.some((field) => !validField(field, frames)) ||
    new Set(input.fields.map((field) => field.id)).size !== input.fields.length
  ) {
    fail();
  }
  return input;
};
