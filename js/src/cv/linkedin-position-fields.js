import {
  inspectLinkedinPositionForm,
  linkedinPositionLabels,
} from './linkedin-position-dom.js';
import { linkedinPositionFailure } from './linkedin-position-plan.js';
import { evaluateLinkedin } from './linkedin-experience-session.js';

const textNames = ['company', 'title', 'location', 'description'];
const monthNames = new Map();
for (const locale of ['en', 'ru']) {
  for (const month of ['short', 'long']) {
    const format = Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' });
    for (let index = 0; index < 12; index++) {
      const date = new Date(Date.UTC(2020, index, 1));
      const name = format.format(date).toLowerCase().replace(/\.$/u, '');
      monthNames.set(name, String(index + 1).padStart(2, '0'));
    }
  }
}
const monthOption = (name) =>
  monthNames.get(name.toLowerCase().replace(/\.$/u, '')) ??
  (/^(?:0?[1-9]|1[0-2])$/u.test(name) ? name.padStart(2, '0') : null);
const yearOption = (name) => (/^(?:19|20)\d{2}$/u.test(name) ? name : null);
const placeholder =
  /^(?:|(?:select\s+)?(?:month|year)|(?:выберите\s+)?(?:месяц|год))$/iu;

const activeOption = (field, parse) => {
  if (!field) {
    return null;
  }
  const selected = field.options.find((option) => option.value === field.value);
  if (!selected && field.value === '') {
    return null;
  }
  if (
    !selected ||
    (!placeholder.test(selected.label) && !parse(selected.label))
  ) {
    throw linkedinPositionFailure('field');
  }
  return parse(selected.label);
};
const dateValue = (controls, prefix) => {
  const year = activeOption(controls[`${prefix}Year`], yearOption);
  const month = activeOption(controls[`${prefix}Month`], monthOption);
  return year && month ? `${year}-${month}` : year;
};
const matchValue = (name, actual, expected) =>
  name === 'description'
    ? actual.replace(/\r\n?/gu, '\n').trim() ===
      expected.replace(/\r\n?/gu, '\n').trim()
    : actual.trim() === expected.trim();
const verifyBaseline = (controls, { operation, baseline }) => {
  if (
    textNames.some(
      (name) => !matchValue(name, controls[name]?.value ?? '', baseline[name])
    ) ||
    dateValue(controls, 'start') !== baseline.start ||
    dateValue(controls, 'end') !== baseline.end ||
    (operation === 'update' && controls.current.value !== baseline.current)
  ) {
    throw linkedinPositionFailure('conflict');
  }
};

const choice = (control, parse, expected) => {
  const options = (control?.options ?? []).filter(
    (option) =>
      !option.disabled &&
      (expected
        ? parse(option.label) === expected
        : placeholder.test(option.label))
  );
  if (options.length !== 1) {
    throw linkedinPositionFailure('field');
  }
  return options[0].value;
};
const validAction = (control, { kind, value }) => {
  if (
    !control?.editable ||
    (kind === 'text' &&
      control.maxLength >= 0 &&
      value.length > control.maxLength)
  ) {
    throw linkedinPositionFailure('field');
  }
};
const stateMatches = (actual, prior, changed, value) => {
  const known = new Set([...Object.keys(actual), ...Object.keys(prior)]);
  for (const key of known) {
    if (changed === 'current' && (key === 'endYear' || key === 'endMonth')) {
      continue;
    }
    const expected = key === changed ? value : prior[key]?.value;
    if (actual[key]?.value !== expected) {
      return false;
    }
  }
  return true;
};

export const linkedinPositionForm = ({ session, plan, token, check }) => {
  const read = async (extra = {}) => {
    check();
    const state = await evaluateLinkedin(session, inspectLinkedinPositionForm, [
      { url: plan.editor, token, fields: linkedinPositionLabels, ...extra },
    ]);
    check();
    return state;
  };
  const change = async (controls, action) => {
    validAction(controls[action.name], action);
    if (controls[action.name].value === action.value) {
      return controls;
    }
    const result = await read({ expected: controls, action });
    if (result.state !== 'changed') {
      throw linkedinPositionFailure('conflict');
    }
    const next = await read();
    if (
      !next.owned ||
      !stateMatches(next.controls, controls, action.name, action.value)
    ) {
      throw linkedinPositionFailure('conflict');
    }
    return next.controls;
  };
  return { read, change };
};

const setDate = async (form, controls, prefix, date) => {
  const [year, month] = date?.split('-') ?? [];
  for (const [part, parse, wanted] of [
    ['Year', yearOption, year],
    ['Month', monthOption, month],
  ]) {
    const name = `${prefix}${part}`;
    if ((wanted || activeOption(controls[name], parse)) && controls[name]) {
      controls = await form.change(controls, {
        name,
        kind: 'select',
        value: choice(controls[name], parse, wanted),
      });
    } else if (wanted) {
      throw linkedinPositionFailure('field');
    }
  }
  return controls;
};

/** Adopt an unchanged native form and prefill only the separately approved fields. */
export const fillLinkedinPosition = async (form, controls, plan) => {
  verifyBaseline(controls, plan);
  const text = textNames
    .filter((name) => Object.hasOwn(plan.fields, name))
    .map((name) => ({ name, kind: 'text', value: plan.fields[name] }));
  text.forEach((action) => validAction(controls[action.name], action));
  const adopted = await form.read({
    expected: controls,
    action: { kind: 'adopt' },
  });
  if (adopted.state !== 'adopted') {
    throw linkedinPositionFailure('conflict');
  }
  if (controls.notify?.value === true) {
    controls = await form.change(controls, {
      name: 'notify',
      kind: 'check',
      value: false,
    });
  }
  for (const action of text) {
    controls = await form.change(controls, action);
  }
  if (Object.hasOwn(plan.fields, 'current')) {
    controls = await form.change(controls, {
      name: 'current',
      kind: 'check',
      value: plan.fields.current,
    });
  }
  if (Object.hasOwn(plan.fields, 'start')) {
    controls = await setDate(form, controls, 'start', plan.desired.start);
  }
  if (Object.hasOwn(plan.fields, 'end') && plan.desired.current !== true) {
    controls = await setDate(form, controls, 'end', plan.desired.end);
  }
  return controls;
};
