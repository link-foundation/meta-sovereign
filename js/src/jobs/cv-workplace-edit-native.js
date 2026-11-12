import { setTimeout as delay } from 'node:timers/promises';
import { readCvEditorDocument } from './cv-watch-document.js';
import { readCvSavedWorkplace } from './cv-workplace-readback.js';
import {
  cvSaveAttempt,
  sameCvWorkplace,
  cvWorkplaceMatchesJob,
} from './cv-watch-verification.js';
import { cvPrepareFailure } from './cv-prepare-record.js';
import { cvWorkplacePlanJob } from './cv-workplace-plan.js';
import {
  cvWorkplaceSelectors,
  readCvWorkplaceControls,
} from './cv-workplace-controls.js';
import {
  typeCvWorkplaceField,
  toggleCvWorkplaceCurrent,
} from './cv-workplace-typing.js';
import {
  chooseCvWorkplaceMonth,
  chooseCvWorkplaceArea,
  chooseCvWorkplaceIndustries,
} from './cv-workplace-choices.js';
import { traceCvWatch } from './cv-watch-trace.js';

const contextFor = ({
  session,
  change,
  check,
  phase,
  readinessMs,
  settleMs,
}) => {
  const page = session.page;
  const recordId = change.workplace.recordId;
  const read = async () => {
    check();
    if (page.url() !== `https://hh.ru/profile/edit/experience/${recordId}`) {
      throw cvPrepareFailure('page');
    }
    const state = await session.commander.evaluate({
      fn: readCvWorkplaceControls,
      args: [cvWorkplaceSelectors],
    });
    check();
    if (state.foreign) {
      throw cvPrepareFailure('draft');
    }
    return state;
  };
  return {
    page,
    check,
    phase,
    settleMs,
    read,
    form: async () => {
      const raw = await session.commander.evaluate({
        fn: readCvEditorDocument,
        args: [],
      });
      check();
      if (raw?.kind !== 'workplace' || raw.recordId !== recordId) {
        throw cvPrepareFailure('draft');
      }
      return cvSaveAttempt(raw);
    },
    wait: async (accept) => {
      const deadline = Date.now() + readinessMs;
      do {
        if (await accept()) {
          return;
        }
        await delay(50);
        check();
      } while (Date.now() < deadline);
      throw cvPrepareFailure('hydration');
    },
  };
};
const installGuard = (context, anchor) => {
  context.guard = async (
    expected = context.expected,
    state,
    picker = false
  ) => {
    state ??= await context.read();
    if (
      state.foreign ||
      state.dialogs !== (picker ? 1 : 0) ||
      (picker && state.industryDialogs !== 1) ||
      JSON.stringify(state.fields) !== JSON.stringify(expected) ||
      !(await anchor.evaluate(
        (node) =>
          node.isConnected &&
          node === globalThis.document.querySelector('input[name="company"]')
      ))
    ) {
      throw cvPrepareFailure('draft');
    }
    context.check();
    return state;
  };
};
const readyControls = (state) =>
  [
    'company',
    'position',
    'description',
    'website',
    'startYear',
    'current',
    ...(state.fields.current ? [] : ['endYear']),
  ].every(
    (key) =>
      state.controls[key].writable &&
      state.controls[key].controlled &&
      state.controls[key].value === state.fields[key]
  ) &&
  state.fields.area !== null &&
  state.fields.industryText !== null;
const verifyBaseline = async (context, session, change) => {
  const before = await context.form();
  const selected = before.resumes.filter((row) => row.checked);
  if (selected.length !== 1 || selected[0].hash !== change.hash) {
    throw cvPrepareFailure('shared');
  }
  const saved = await readCvSavedWorkplace({
    session,
    attempt: before,
    check: context.check,
  });
  const expected = cvWorkplacePlanJob(change.plan, 'baseline', before.locale);
  if (
    change.plan.baseline.areaId !== null &&
    change.plan.desired.areaId === null
  ) {
    throw cvPrepareFailure('choice');
  }
  const exactFields = [
    'company',
    'position',
    'description',
    'area',
    'website',
    'industryText',
  ];
  if (
    !sameCvWorkplace(before, saved) ||
    exactFields.some((key) => before[key] !== saved[key]) ||
    !cvWorkplaceMatchesJob(before, expected, expected.industries)
  ) {
    throw cvPrepareFailure('baseline');
  }
  await context.guard();
  return before;
};
const prepareFields = async (context, plan, locale) => {
  const wanted = plan.desired;
  for (const key of ['company', 'position', 'description', 'website']) {
    if (wanted[key] !== context.expected[key]) {
      await typeCvWorkplaceField({ context, key, value: wanted[key] });
    }
  }
  if (wanted.current !== context.expected.current) {
    await toggleCvWorkplaceCurrent(context, wanted.current);
  }
  for (const part of wanted.current ? ['start'] : ['start', 'end']) {
    const date = wanted[part];
    if (date.slice(0, 4) !== context.expected[`${part}Year`]) {
      await typeCvWorkplaceField({
        context,
        key: `${part}Year`,
        value: date.slice(0, 4),
      });
    }
    const original = plan.baseline[part];
    if (!original || original.slice(5) !== date.slice(5)) {
      await chooseCvWorkplaceMonth(context, part, date);
    }
  }
  if (wanted.areaId !== plan.baseline.areaId) {
    await chooseCvWorkplaceArea(
      context,
      plan.metadata.areas.find((row) => row.id === wanted.areaId),
      locale
    );
  }
  if (
    JSON.stringify(wanted.industryIds) !==
    JSON.stringify(plan.baseline.industryIds)
  ) {
    await chooseCvWorkplaceIndustries(context, plan, locale);
  }
};
/** Complete reviewed existing-record draft. Never navigate, save, cancel or edit a shared job. */
export const prepareNativeCvWorkplaceEdit = async ({
  readinessMs = 20000,
  settleMs = 750,
  ...input
}) => {
  const context = contextFor({ ...input, readinessMs, settleMs });
  await context.wait(async () => {
    const state = await context.read();
    return state.ready && !state.dialogs && readyControls(state);
  });
  const anchor = await context.page
    .locator(cvWorkplaceSelectors.company)
    .elementHandle();
  if (!anchor) {
    throw cvPrepareFailure('draft');
  }
  try {
    context.expected = (await context.read()).fields;
    installGuard(context, anchor);
    const before = await verifyBaseline(context, input.session, input.change);
    await context.phase('preparing');
    await context.guard();
    await prepareFields(context, input.change.plan, before.locale);
    await delay(settleMs);
    await context.guard();
    const after = await context.form();
    const wanted = cvWorkplacePlanJob(
      input.change.plan,
      'desired',
      before.locale
    );
    if (
      !sameCvWorkplace(
        { ...before, ...after, resumes: before.resumes },
        after
      ) ||
      !cvWorkplaceMatchesJob(after, wanted, wanted.industries)
    ) {
      throw cvPrepareFailure('field');
    }
    traceCvWatch('workplace-fields-prepared', { state: 'prepared' });
  } finally {
    await anchor.dispose();
  }
};
