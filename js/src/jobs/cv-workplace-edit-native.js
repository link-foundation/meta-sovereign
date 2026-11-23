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
import { sameCvMembership } from './cv-workplace-membership.js';
import { prepareCvWorkplaceMembership } from './cv-workplace-membership-native.js';
import { traceCvWatch } from './cv-watch-trace.js';
import { cvWorkplaceEditorUrl } from './cv-workplace-open.js';

const contextFor = ({
  session,
  change,
  check,
  phase,
  readinessMs,
  settleMs,
}) => {
  const page = session.page;
  const copy = change.plan?.operation === 'copy';
  const recordId = copy ? null : change.workplace.recordId;
  const checkPage = () => {
    check();
    if (!cvWorkplaceEditorUrl(page.url(), recordId, change.hash)) {
      throw cvPrepareFailure('page');
    }
  };
  const read = async () => {
    checkPage();
    const state = await session.commander.evaluate({
      fn: readCvWorkplaceControls,
      args: [cvWorkplaceSelectors],
    });
    checkPage();
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
    copy,
    read,
    rawForm: async () => {
      checkPage();
      const raw = await session.commander.evaluate({
        fn: readCvEditorDocument,
        args: [],
      });
      checkPage();
      if (raw?.kind !== 'workplace' || raw.recordId !== recordId) {
        throw cvPrepareFailure('draft');
      }
      return raw;
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
const blankMetadata = ['website', 'area', 'industryText'];
const installGuard = (context, anchor) => {
  context.guard = async (
    expected = context.expected,
    state,
    picker = false
  ) => {
    state ??= await context.read();
    if (context.copy) {
      for (const key of blankMetadata) {
        if (expected[key] === null && state.fields[key] === '') {
          expected[key] = '';
          context.expected[key] = '';
        }
      }
    }
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
const textControls = (state, keys) =>
  keys.every(
    (key) =>
      state.controls[key].writable &&
      state.controls[key].controlled &&
      state.controls[key].value === state.fields[key]
  );
const readyControls = (state) =>
  textControls(state, [
    'company',
    'position',
    'description',
    'website',
    'startYear',
    'current',
    ...(state.fields.current ? [] : ['endYear']),
  ]) &&
  state.fields.area !== null &&
  state.fields.industryText !== null;
const verifyBaseline = async (context, session, change) => {
  const before = cvSaveAttempt(await context.rawForm());
  const selected = before.resumes.filter((row) => row.checked);
  if (
    change.plan.operation === 'detach'
      ? !sameCvMembership(before.resumes, change.plan.membership.before)
      : selected.length !== 1 || selected[0].hash !== change.hash
  ) {
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
const verifyCopySource = async (context, session, change) => {
  const saved = await readCvSavedWorkplace({
    session,
    attempt: change.workplace,
    check: context.check,
  });
  const plan = change.plan;
  const expected = cvWorkplacePlanJob(plan, 'baseline', saved.locale);
  if (
    saved.recordId !== plan.recordId ||
    !sameCvMembership(saved.resumes, plan.membership.before) ||
    !cvWorkplaceMatchesJob(saved, expected, expected.industries)
  ) {
    throw cvPrepareFailure('baseline');
  }
  const form = await context.rawForm();
  await context.guard();
  return /^ru\b/iu.test(form.locale ?? '') ? 'ru' : 'en';
};
const blankCopyForm = (state, plan) => {
  const { fields } = state;
  const { after } = plan.membership;
  return (
    ['company', 'position', 'description', 'startYear', 'endYear'].every(
      (key) => fields[key] === ''
    ) &&
    [fields.startMonth, fields.endMonth].every(
      (value) => value === null || /^(?:month|месяц)?$/iu.test(value)
    ) &&
    blankMetadata.every((key) => fields[key] === null || fields[key] === '') &&
    fields.current === false &&
    (sameCvMembership(fields.resumes, after) ||
      sameCvMembership(
        fields.resumes,
        after.map((row) => ({ ...row, checked: false }))
      ))
  );
};
const prepareFields = async (context, plan, locale) => {
  const wanted = plan.desired;
  const baseline = context.copy
    ? { start: null, end: null, areaId: null, industryIds: [] }
    : plan.baseline;
  for (const key of ['company', 'position', 'description']) {
    if (wanted[key] !== context.expected[key]) {
      await typeCvWorkplaceField({ context, key, value: wanted[key] });
    }
  }
  if (context.copy) {
    await context.wait(async () => readyControls(await context.guard()));
  }
  if (wanted.website !== context.expected.website) {
    await typeCvWorkplaceField({
      context,
      key: 'website',
      value: wanted.website,
    });
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
    const original = baseline[part];
    if (!original || original.slice(5) !== date.slice(5)) {
      await chooseCvWorkplaceMonth(context, part, date);
    }
  }
  if (wanted.areaId !== baseline.areaId) {
    await chooseCvWorkplaceArea(
      context,
      plan.metadata.areas.find((row) => row.id === wanted.areaId),
      locale
    );
  }
  if (
    JSON.stringify(wanted.industryIds) !== JSON.stringify(baseline.industryIds)
  ) {
    await chooseCvWorkplaceIndustries(context, plan, locale);
  }
};
/** Prepare the reviewed fields in an existing editor or a new native copy. */
export const prepareNativeCvWorkplaceEdit = async ({
  readinessMs = 20000,
  settleMs = 750,
  ...input
}) => {
  const context = contextFor({ ...input, readinessMs, settleMs });
  const { change, session } = input;
  const { plan } = change;
  await context.wait(async () => {
    const state = await context.read();
    const ready = context.copy
      ? textControls(state, [
          'company',
          'position',
          'description',
          'startYear',
          'endYear',
          'current',
        ])
      : readyControls(state);
    if (ready && context.copy && !blankCopyForm(state, plan)) {
      throw cvPrepareFailure('draft');
    }
    return state.ready && !state.dialogs && ready;
  });
  const anchor = await context.page
    .locator(cvWorkplaceSelectors.company)
    .elementHandle();
  if (!anchor) {
    throw cvPrepareFailure('draft');
  }
  try {
    const state = await context.read();
    if (context.copy && !blankCopyForm(state, plan)) {
      throw cvPrepareFailure('draft');
    }
    context.expected = state.fields;
    installGuard(context, anchor);
    const before = context.copy
      ? null
      : await verifyBaseline(context, session, change);
    const locale =
      before?.locale ?? (await verifyCopySource(context, session, change));
    await context.phase('preparing');
    await context.guard();
    if (plan.operation !== 'detach') {
      await prepareFields(context, plan, locale);
    }
    if (plan.membership) {
      await prepareCvWorkplaceMembership(context, plan);
    }
    await delay(settleMs);
    await context.guard();
    const after = cvSaveAttempt(await context.rawForm());
    const wanted = cvWorkplacePlanJob(plan, 'desired', locale);
    if (
      after.recordId !== (before?.recordId ?? null) ||
      !sameCvMembership(
        plan.membership?.after ?? before.resumes,
        after.resumes
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

/** Read one unchanged owner-opened form and its fresh saved membership; never edit. */
export const inspectNativeCvWorkplace = async ({
  session,
  recordId,
  hash,
  check,
  readinessMs = 20000,
}) => {
  const context = contextFor({
    session,
    change: { workplace: { recordId }, hash },
    check,
    readinessMs,
  });
  await context.wait(async () => {
    const state = await context.read();
    return state.ready && !state.dialogs && readyControls(state);
  });
  const before = cvSaveAttempt(await context.rawForm());
  const controls = await context.read();
  const saved = await readCvSavedWorkplace({ session, attempt: before, check });
  if (
    !sameCvWorkplace(before, saved) ||
    [
      'company',
      'position',
      'description',
      'area',
      'website',
      'industryText',
    ].some((key) => before[key] !== saved[key]) ||
    JSON.stringify(controls.fields) !==
      JSON.stringify((await context.read()).fields) ||
    JSON.stringify(before) !==
      JSON.stringify(cvSaveAttempt(await context.rawForm()))
  ) {
    throw cvPrepareFailure('baseline');
  }
  return before;
};
