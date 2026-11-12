import { prepareCvControlledText } from './cv-prepare-text.js';
import { cvWorkplaceSelectors } from './cv-workplace-controls.js';
import { cvPrepareFailure } from './cv-prepare-record.js';

/** An owner edit in any other field stops the next keystroke; never restore over it. */
export const typeCvWorkplaceField = async ({ context, key, value }) => {
  const { page, check, phase, settleMs, read, guard, wait, expected } = context;
  const initial = await guard();
  const control = initial.controls[key];
  if (
    !control?.writable ||
    !control.controlled ||
    (control.maxLength >= 0 && value.length > control.maxLength)
  ) {
    throw cvPrepareFailure('field');
  }
  await prepareCvControlledText({
    page,
    check,
    phase,
    settleMs,
    selector: cvWorkplaceSelectors[key],
    before: expected[key],
    after: value,
    maxLength: control.maxLength,
    read: async (wanted, controlled = true) => {
      const state = await read();
      await guard({ ...expected, [key]: wanted }, state);
      return (
        state.controls[key].writable &&
        state.controls[key].controlled &&
        (!controlled || state.controls[key].value === wanted)
      );
    },
    wait: () =>
      wait(async () => {
        const state = await read();
        await guard({ ...expected, [key]: value }, state);
        return state.controls[key].value === value;
      }),
  });
  expected[key] = value;
};

/** Native checkbox changes may reveal/hide only their dependent end-date controls. */
export const toggleCvWorkplaceCurrent = async (context, value) => {
  const { page, guard, expected } = context;
  await guard();
  const box = page.locator(cvWorkplaceSelectors.current);
  if ((await box.count()) !== 1 || !(await box.isEnabled())) {
    throw cvPrepareFailure('field');
  }
  await box.setChecked(value, { timeout: 10000 });
  const state = await context.read();
  const next = {
    ...expected,
    current: value,
    endMonth: state.fields.endMonth,
    endYear: state.fields.endYear,
  };
  await guard(next, state);
  Object.assign(expected, next);
};
