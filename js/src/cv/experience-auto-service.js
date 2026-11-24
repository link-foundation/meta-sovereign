import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrivateCvJob } from './private-job.js';
import { storedExperienceDocument } from './experience-store.js';
import { confirmedExperiencePlan } from './experience-plan-receipt.js';
import { readExperiencePlan } from './experience-plan-service.js';
import { hhAcquisitionRunning } from './experience-hh-acquisition.js';
import { hhAcquisitionOptions } from './experience-hh-acquisition-options.js';
import {
  linkedinExportOptions,
  linkedinExportRunning,
} from './linkedin-experience-record.js';
import {
  experiencePlanOptions,
  experiencePlanRunning,
} from './experience-plan-record.js';
import {
  checkedExperienceAuto,
  experienceAutoChildId,
  experienceAutoFailure,
  experienceAutoKey,
  experienceAutoOptions,
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
  progress,
  wait
) => {
  signal.throwIfAborted();
  const service = getService();
  const request = { requestId: input.requestId };
  let current;
  try {
    current = await service.start(input);
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

const autoView = async (store, row, active) => {
  if (!active && row.phase === 'planning') {
    const completion = await storedComparison(store, row).catch(() => null);
    if (completion) {
      return experienceAutoView({ ...row, ...completion }, active);
    }
  }
  return experienceAutoView(row, active);
};

const workFor =
  ({ store, getHh, getLinkedin, getPlan, wait }) =>
  async (owned, save) => {
    const { signal } = owned.controller;
    const inputFor = (name) => autoChildInput(owned.row, name);
    const progress = (step) =>
      owned.row.step === step ? undefined : save({ step });
    const run = (getService, input, running) =>
      workExperienceChild(getService, input, running, signal, progress, wait);
    try {
      const hhInput = hhAcquisitionOptions(inputFor('hh'));
      const hh = await checkHhSnapshot(
        store,
        await run(getHh, hhInput, hhAcquisitionRunning),
        hhInput
      );
      signal.throwIfAborted();
      await save({ hh, phase: 'acquiring-linkedin', step: null });

      const linkedinInput = linkedinExportOptions(inputFor('linkedin'));
      const linkedin = await checkLinkedinSnapshot(
        store,
        await run(getLinkedin, linkedinInput, linkedinExportRunning),
        linkedinInput
      );
      signal.throwIfAborted();
      await save({ linkedin, phase: 'planning', step: null });

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

/** Checkpoint the exact two native snapshots and directed comparison in one request. */
export const createExperienceAutoService = ({
  store,
  getHh,
  getLinkedin,
  getPlan,
  wait = (signal) => delay(250, null, { signal }),
}) =>
  new PrivateCvJob({
    store,
    key: experienceAutoKey,
    failure: experienceAutoFailure,
    optionsFor: experienceAutoOptions,
    newRecord,
    checked: checkedExperienceAuto,
    view: (row, active) => autoView(store, row, active),
    work: workFor({ store, getHh, getLinkedin, getPlan, wait }),
  }).controls();

export const storedExperienceAutoStatus = async (store, { requestId }) =>
  autoView(
    store,
    checkedExperienceAuto(
      await store.get(experienceAutoKey(requestId)),
      requestId
    ),
    null
  );
