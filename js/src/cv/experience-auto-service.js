import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrivateCvJob } from './private-job.js';
import { storedExperienceDocument } from './experience-store.js';
import { confirmedExperiencePlan } from './experience-plan-receipt.js';
import { readExperiencePlan } from './experience-plan-service.js';
import {
  hhAcquisitionRunning,
  storedHhAcquisitionStatus,
} from './experience-hh-acquisition.js';
import { hhAcquisitionOptions } from './experience-hh-acquisition-options.js';
import {
  checkedLinkedinExport,
  linkedinExportKey,
  linkedinExportOptions,
  linkedinExportRunning,
} from './linkedin-experience-record.js';
import {
  experiencePlanKey,
  experiencePlanOptions,
  experiencePlanRunning,
} from './experience-plan-record.js';
import {
  checkedExperienceAuto,
  experienceAutoChildId,
  experienceAutoFailure,
  experienceAutoKey,
  experienceAutoOptions,
  experienceAutoRunning,
  experienceAutoView,
} from './experience-auto-record.js';

const newRecord = (requestId, options = null) => ({
  id: experienceAutoKey(requestId),
  version: 1,
  requestId,
  options,
  token: options ? randomBytes(16).toString('hex') : null,
  phase: options ? 'acquiring-hh' : 'stopped',
  step: null,
  hh: null,
  linkedin: null,
  plan: null,
  code: null,
});

export const sameExperienceChild = (row, input) =>
  row?.requestId === input.requestId &&
  JSON.stringify(row.options) === JSON.stringify(input);

export const workExperienceChild = async (
  getService,
  input,
  running,
  signal,
  { progress, wait, admit = 'start' }
) => {
  signal.throwIfAborted();
  const service = getService();
  const request = { requestId: input.requestId };
  let current;
  try {
    current = await service[admit](input);
    while (sameExperienceChild(current, input) && running(current)) {
      signal.throwIfAborted();
      await progress(current.phase, current);
      await wait(signal);
      const next = await service.status(request);
      if (!sameExperienceChild(next, input)) {
        throw experienceAutoFailure('child-mismatch');
      }
      current = next;
    }
    signal.throwIfAborted();
    if (!sameExperienceChild(current, input) || current.phase !== 'completed') {
      throw Object.assign(experienceAutoFailure('child-unavailable'), {
        code:
          sameExperienceChild(current, input) && current.code
            ? current.code
            : experienceAutoFailure('child-unavailable').code,
      });
    }
    return current;
  } catch (error) {
    // A Start receipt can fail after admission. Recover its identity with a read.
    if (!current) {
      current = await service.status(request).catch(() => null);
    }
    if (sameExperienceChild(current, input) && running(current)) {
      await service.stop(request);
    }
    throw error;
  }
};

export const checkHhSnapshot = async (store, receipt, input) => {
  const { revision, provenance, document } = await storedExperienceDocument(
    store,
    receipt.result?.revision
  );
  const identity = provenance.identity;
  if (
    provenance.kind !== 'hh-export' ||
    document.platform !== 'hh' ||
    !identity ||
    identity.hash !== receipt.result.hash ||
    identity.browserSlot !== input.browserSlot ||
    identity.exportId !== receipt.result.exportId ||
    (input.hash && identity.hash !== input.hash) ||
    (input.refresh && receipt.result.source !== 'native')
  ) {
    throw experienceAutoFailure('hh-snapshot');
  }
  return revision;
};
export const checkLinkedinSnapshot = async (store, receipt, input) => {
  const { revision, provenance, document } = await storedExperienceDocument(
    store,
    receipt.revision
  );
  if (
    provenance.kind !== 'linkedin-native' ||
    provenance.requestId !== input.requestId ||
    provenance.browserSlot !== 'linkedin-experience' ||
    document.platform !== 'linkedin' ||
    document.source.url !== input.url ||
    document.source.language !== input.language
  ) {
    throw experienceAutoFailure('linkedin-snapshot');
  }
  return revision;
};

const autoChildInput = ({ options, token }, name) => ({
  ...options,
  requestId: experienceAutoChildId(token, name),
});
const comparisonInput = (row) =>
  experiencePlanOptions({
    ...autoChildInput(row, 'plan'),
    hh: row.hh,
    linkedin: row.linkedin,
  });
const completedComparison = ({ requestId, fingerprint }) => ({
  phase: 'completed',
  step: null,
  plan: { requestId, fingerprint },
});

const storedComparison = async (store, row) => {
  const input = comparisonInput(row);
  const plan = await confirmedExperiencePlan(
    await readExperiencePlan(store, input),
    input.requestId
  );
  return sameExperienceChild(plan, input) && plan.phase === 'completed'
    ? completedComparison(plan)
    : null;
};

const completedChild = (row, input) => {
  if (!sameExperienceChild(row, input) || row.phase !== 'completed') {
    throw experienceAutoFailure('child-unavailable');
  }
  return row;
};

const acknowledgedHh = async (store, row) => {
  const input = hhAcquisitionOptions(autoChildInput(row, 'hh'));
  const receipt = await storedHhAcquisitionStatus(store, input).catch(
    (error) => {
      if (error.code !== 'cv-hh-acquisition-missing') {
        throw error;
      }
      return null;
    }
  );
  return (
    receipt && checkHhSnapshot(store, completedChild(receipt, input), input)
  );
};

const acknowledgedLinkedin = async (store, row) => {
  const input = linkedinExportOptions(autoChildInput(row, 'linkedin'));
  const receipt = await store.get(linkedinExportKey(input.requestId));
  if (!receipt) {
    return null;
  }
  const checked = checkedLinkedinExport(receipt, input.requestId);
  return checkLinkedinSnapshot(store, completedChild(checked, input), input);
};

const matchesCheckpoint = ({ phase, step }, stage, saved, completed) =>
  (saved === null || saved === completed) &&
  (completed !== null || phase !== stage || step === null);

const recoverablePreparation = async (store, row) => {
  const hh = await acknowledgedHh(store, row);
  if (!matchesCheckpoint(row, 'acquiring-hh', row.hh, hh)) {
    return false;
  }
  const linkedin = await acknowledgedLinkedin(store, row);
  if (
    (linkedin && !hh) ||
    !matchesCheckpoint(row, 'acquiring-linkedin', row.linkedin, linkedin)
  ) {
    return false;
  }
  const planId = experienceAutoChildId(row.token, 'plan');
  if (!(await store.get(experiencePlanKey(planId)))) {
    return matchesCheckpoint(row, 'planning', null, null);
  }
  return Boolean(
    hh && linkedin && (await storedComparison(store, { ...row, hh, linkedin }))
  );
};

const autoView = async (store, row, active) => {
  if (!active && row.phase === 'planning') {
    const completion = await storedComparison(store, row).catch(() => null);
    if (completion) {
      return experienceAutoView({ ...row, ...completion }, active);
    }
  }
  const view = experienceAutoView(row, active);
  return experienceAutoRunning(row) && !active
    ? {
        ...view,
        recoveryAvailable: await recoverablePreparation(store, row).catch(
          () => false
        ),
      }
    : view;
};

const workFor =
  ({ store, getHh, getLinkedin, getPlan, wait }) =>
  async (owned, save) => {
    const { signal } = owned.controller;
    const inputFor = (name) => autoChildInput(owned.row, name);
    const progress = (step) =>
      owned.row.step === step ? undefined : save({ step });
    const run = (getService, input, running) =>
      workExperienceChild(getService, input, running, signal, {
        progress,
        wait,
      });
    try {
      if (owned.row.phase === 'acquiring-hh') {
        const input = hhAcquisitionOptions(inputFor('hh'));
        const hh = await checkHhSnapshot(
          store,
          await run(getHh, input, hhAcquisitionRunning),
          input
        );
        signal.throwIfAborted();
        await save({ hh, phase: 'acquiring-linkedin', step: null });
      }
      if (owned.row.phase === 'acquiring-linkedin') {
        const input = linkedinExportOptions(inputFor('linkedin'));
        const linkedin = await checkLinkedinSnapshot(
          store,
          await run(getLinkedin, input, linkedinExportRunning),
          input
        );
        signal.throwIfAborted();
        await save({ linkedin, phase: 'planning', step: null });
      }

      const input = comparisonInput(owned.row);
      const plan = await confirmedExperiencePlan(
        await run(getPlan, input, experiencePlanRunning),
        input.requestId
      );
      signal.throwIfAborted();
      await save(completedComparison(plan));
    } catch (error) {
      await save({
        phase: signal.aborted ? 'stopped' : 'failed',
        step: null,
        code: signal.aborted
          ? null
          : /^(?:cv|jobs|assignment)-[a-z0-9-]{1,100}$/u.test(error?.code)
            ? error.code
            : experienceAutoFailure('unavailable').code,
      });
    }
  };

const resumePreparation = async (service, { requestId }) => {
  if (service.closing) {
    throw experienceAutoFailure('stopped');
  }
  if (service.current) {
    if (service.current.row.requestId !== requestId) {
      throw experienceAutoFailure('busy');
    }
    return service.view(service.current.row, true);
  }
  const row = checkedExperienceAuto(
    await service.store.get(experienceAutoKey(requestId)),
    requestId
  );
  const view = await service.view(row, false);
  if (view.phase === 'completed') {
    return view;
  }
  if (!view.recoveryAvailable) {
    throw experienceAutoFailure('conflict');
  }
  return service.launch(row);
};

/** Checkpoint the exact two native snapshots and directed comparison in one request. */
export const createExperienceAutoService = ({
  store,
  getHh,
  getLinkedin,
  getPlan,
  wait = (signal) => delay(250, null, { signal }),
}) => {
  const service = new PrivateCvJob({
    store,
    key: experienceAutoKey,
    failure: experienceAutoFailure,
    optionsFor: experienceAutoOptions,
    newRecord,
    checked: checkedExperienceAuto,
    view: (row, active) => autoView(store, row, active),
    work: workFor({ store, getHh, getLinkedin, getPlan, wait }),
  });
  return {
    ...service.controls(),
    resume: (input) => service.serial(() => resumePreparation(service, input)),
  };
};

export const storedExperienceAutoStatus = async (store, { requestId }) =>
  autoView(
    store,
    checkedExperienceAuto(
      await store.get(experienceAutoKey(requestId)),
      requestId
    ),
    null
  );
