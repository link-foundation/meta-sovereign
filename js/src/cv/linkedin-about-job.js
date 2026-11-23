import { readExperiencePlan } from './experience-plan-service.js';
import { copyExperienceData } from './experience.js';
import { PrivateCvJob } from './private-job.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import {
  linkedinAboutRunning,
  linkedinAboutTerminal,
} from './linkedin-about-receipt.js';
import {
  linkedinPositionFingerprint,
  nativeLinkedinExperienceTarget,
} from './linkedin-position-plan.js';
import {
  createLinkedinAboutNative,
  linkedinAboutFailure,
  linkedinAboutText,
} from './linkedin-about-native.js';

const key = (id) =>
  `secret:cv-linkedin-about-review:${resumeExportRequestId(id)}`;
const optionsFor = (input) => ({
  requestId: resumeExportRequestId(input.requestId),
  planRequestId: resumeExportRequestId(input.planRequestId),
  fingerprint: linkedinPositionFingerprint(input.fingerprint),
});
const newRecord = (requestId, options = null) => ({
  id: key(requestId),
  version: 1,
  requestId,
  options,
  phase: options ? 'opening' : 'left',
  code: null,
  canSave: options !== null,
  save: null,
});

const checkedSave = async (save) => {
  if (save?.evidence !== 'verified-linkedin-about-profile') {
    return false;
  }
  const { sha256, ...payload } = save;
  return (
    typeof save.about === 'string' &&
    typeof save.source?.url === 'string' &&
    typeof save.source?.id === 'string' &&
    Number.isFinite(Date.parse(save.capturedAt)) &&
    (await modelFingerprint(payload)) === sha256
  );
};
const sameOptions = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);
const checked = async (value, id) => {
  const row = copyExperienceData(value);
  if (
    row?.id !== key(id) ||
    row.requestId !== id ||
    row.version !== 1 ||
    !(linkedinAboutRunning(row) || linkedinAboutTerminal.includes(row.phase)) ||
    typeof row.canSave !== 'boolean' ||
    (row.options
      ? row.options.requestId !== id ||
        !sameOptions(optionsFor(row.options), row.options)
      : row.phase !== 'left') ||
    (row.code !== null &&
      !/^cv-linkedin-about-[a-z-]{1,60}$/u.test(row.code)) ||
    !(row.phase === 'saved' ? await checkedSave(row.save) : row.save === null)
  ) {
    throw linkedinAboutFailure('record');
  }
  return row;
};
const view = (row, active, decisionPending = false) => {
  const { id: _id, version: _version, ...status } = copyExperienceData(row);
  if (linkedinAboutRunning(row) && !active) {
    return {
      ...status,
      phase: 'interrupted',
      lastPhase: row.phase,
      code: linkedinAboutFailure('ownership').code,
      providerSaved: false,
      decisionPending,
    };
  }
  return { ...status, providerSaved: row.phase === 'saved', decisionPending };
};

export const linkedinAboutPlan = async (
  context,
  { planRequestId, fingerprint }
) => {
  const row = await readExperiencePlan(context.store, {
    requestId: planRequestId,
  });
  const field = row.plan?.profile.fields.find(({ field }) => field === 'about');
  if (
    row.phase !== 'completed' ||
    row.fingerprint !== fingerprint ||
    row.plan.target.platform !== 'linkedin' ||
    !field?.ready ||
    typeof field.before !== 'string' ||
    typeof field.after !== 'string' ||
    !field.after.trim() ||
    field.after.length > 24000
  ) {
    throw linkedinAboutFailure('plan');
  }
  const { document } = await nativeLinkedinExperienceTarget(
    context,
    row.plan.target
  ).catch(() => {
    throw linkedinAboutFailure('source');
  });
  const after = linkedinAboutText(field.after);
  if (
    document.profile.aboutAcquisition?.observed !== true ||
    document.profile.about !== field.before ||
    field.before === after
  ) {
    throw linkedinAboutFailure('baseline');
  }
  const { url, id, language } = document.source;
  return {
    browserSlot: 'linkedin-experience',
    target: { url, id, language },
    before: field.before,
    after,
  };
};

const awaitDecision = async (owned, plan, { read, now, wait, signal }) => {
  const deadline = now() + 30 * 60000;
  let missing = 0;
  for (let count = 0; count < 1800 && now() < deadline; count++) {
    const state = await read();
    if (state.issued === 'browser') {
      return 'browser';
    }
    if (['away', 'closed'].includes(state.state)) {
      return 'closed';
    }
    if (state.state === 'missing' && ++missing > 2) {
      return 'closed';
    }
    if (owned.choice && ['unavailable', 'ambiguous'].includes(state.state)) {
      throw linkedinAboutFailure('draft');
    }
    if (state.state === 'ready') {
      missing = 0;
      if (owned.choice) {
        if (!state.owned || state.changed || state.value !== plan.after) {
          throw linkedinAboutFailure('draft');
        }
        return owned.choice;
      }
    }
    await wait(1000, signal);
  }
  return 'left';
};

const awaitClose = async (choice, { read, now, wait, signal }) => {
  const deadline = now() + 45000;
  let discarded = false;
  let missing = 0;
  for (let count = 0; count < 45 && now() < deadline; count++) {
    const { state } = await read();
    missing = state === 'missing' ? missing + 1 : 0;
    if (missing >= 2 || (choice !== 'skip' && state === 'closed')) {
      return true;
    }
    if (['away', 'closed'].includes(state)) {
      break;
    }
    if (
      choice === 'skip' &&
      !discarded &&
      ['unavailable', 'ambiguous'].includes(state)
    ) {
      discarded =
        (await read(undefined, { kind: 'discard' })).state === 'dispatched';
    }
    await wait(1000, signal);
  }
  return false;
};

const ownPrepared = async (owned, plan, update, native) => {
  await update({ phase: 'prepared' });
  const choice = await awaitDecision(owned, plan, native);
  if (choice === 'closed' || choice === 'left') {
    return { phase: choice };
  }
  await update({ phase: choice === 'skip' ? 'skipping' : 'saving' });
  if (choice !== 'browser') {
    const result = await native.read(plan.after, { kind: choice });
    if (result.state !== 'dispatched') {
      throw linkedinAboutFailure('draft');
    }
  }
  if (!(await awaitClose(choice, native))) {
    throw linkedinAboutFailure('readback');
  }
  if (choice === 'skip') {
    return { phase: 'skipped' };
  }
  await update({ phase: 'verifying' });
  return { phase: 'saved', save: await native.verify() };
};

const failureResult = (owned, error) => {
  const uncertain = ['saving', 'skipping', 'verifying'].includes(
    owned.row.phase
  );
  if (owned.controller.signal.aborted && !uncertain) {
    return { phase: 'left', code: null };
  }
  const known = /^cv-linkedin-about-[a-z-]{1,60}$/u.test(error.code);
  return {
    phase: uncertain ? 'unconfirmed' : 'failed',
    code: known ? error.code : linkedinAboutFailure('provider').code,
  };
};

export const createLinkedinAboutJobs = (context) => {
  const native = createLinkedinAboutNative(context);
  const service = new PrivateCvJob({
    store: context.store,
    key,
    optionsFor,
    newRecord,
    checked,
    view,
    failure: linkedinAboutFailure,
    work: async (owned, update) => {
      let result;
      try {
        const plan = await linkedinAboutPlan(context, owned.row.options);
        result = await native(plan, owned.controller.signal, (prepared) =>
          ownPrepared(owned, plan, update, prepared)
        );
      } catch (error) {
        result = failureResult(owned, error);
      }
      await update({ ...result, canSave: false });
    },
  });
  return {
    ...service.controls(),
    status: async (input) => {
      const row = await service.status(input);
      return {
        ...row,
        decisionPending:
          service.current?.row.requestId === row.requestId &&
          Boolean(service.current.choice),
      };
    },
    decide: (input) =>
      service.serial(async () => {
        const options = optionsFor(input);
        const owned = service.current;
        if (
          owned?.row.phase !== 'prepared' ||
          !sameOptions(options, owned.row.options) ||
          !['save', 'skip'].includes(input.decision) ||
          (owned.choice && owned.choice !== input.decision)
        ) {
          throw linkedinAboutFailure('decision');
        }
        owned.choice = input.decision;
        return view(owned.row, true, true);
      }),
  };
};
