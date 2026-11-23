import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { copyExperienceData } from './experience.js';
import { PrivateCvJob } from './private-job.js';
import { createLinkedinPositionNative } from './linkedin-position-native.js';
import { linkedinPositionEditorUrl } from './linkedin-position-editor-url.js';
import {
  linkedinPositionFingerprint,
  linkedinPositionFailure,
} from './linkedin-position-plan.js';
import { authorizedLinkedinPosition } from './linkedin-position-review.js';
import {
  linkedinPositionOutcome,
  verifyLinkedinPositionSave,
} from './linkedin-position-outcome.js';

const running = ['opening', 'prepared', 'saving', 'skipping', 'verifying'];
const terminal = [
  'saved',
  'skipped',
  'closed',
  'unconfirmed',
  'stopped',
  'failed',
];
const positionCode = /^cv-linkedin-position-[a-z-]{1,60}$/u;
export const linkedinPositionRunning = (row) => running.includes(row.phase);
const key = (id) =>
  `secret:cv-linkedin-position-job:${resumeExportRequestId(id)}`;
const optionsFor = (input) => ({
  requestId: resumeExportRequestId(input.requestId),
  fingerprint: linkedinPositionFingerprint(input.fingerprint),
});
const newRecord = (requestId, options = null) => ({
  id: key(requestId),
  version: 1,
  requestId,
  options,
  phase: options ? 'opening' : 'stopped',
  code: null,
  unapplied: [],
  save: null,
  initiator: null,
});
const verifiedSave = (save) =>
  save?.evidence === 'verified-linkedin-position-export' &&
  /^[a-f0-9]{64}$/u.test(save.sha256) &&
  typeof save.source?.id === 'string' &&
  typeof save.editor === 'string' &&
  linkedinPositionEditorUrl(save.editor, save.source.url, 'update') ===
    save.editor &&
  ['company', 'title', 'location', 'description'].every(
    (key) => typeof save.values?.[key] === 'string'
  ) &&
  [null, true, false].includes(save.values.current) &&
  ['start', 'end'].every(
    (key) =>
      save.values[key] === null ||
      /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u.test(save.values[key])
  );
const checked = (value, id) => {
  const row = copyExperienceData(value);
  if (
    !row ||
    row.id !== key(id) ||
    row.requestId !== id ||
    row.version !== 1 ||
    !running.concat(terminal).includes(row.phase) ||
    (row.options
      ? JSON.stringify(optionsFor(row.options)) !==
          JSON.stringify(row.options) || row.options.requestId !== id
      : row.phase !== 'stopped') ||
    !Array.isArray(row.unapplied) ||
    row.unapplied.length > 2 ||
    row.unapplied.some((name) => !['skills', 'media'].includes(name)) ||
    ![null, 'cli-or-api', 'browser'].includes(row.initiator) ||
    (row.code !== null && !positionCode.test(row.code))
  ) {
    throw linkedinPositionFailure('job-record');
  }
  if (
    row.phase === 'saved'
      ? !verifiedSave(row.save) || !row.initiator
      : row.save !== null
  ) {
    throw linkedinPositionFailure('job-record');
  }
  return row;
};
const view = (row, active) => {
  const { id: _id, version: _version, ...status } = copyExperienceData(row);
  if (linkedinPositionRunning(row) && !active) {
    return {
      ...status,
      lastPhase: row.phase,
      phase: active === null ? 'unknown' : 'interrupted',
      code: 'cv-linkedin-position-ownership',
      providerSaved: false,
    };
  }
  return { ...status, providerSaved: row.phase === 'saved' };
};

const waitForChoice = async (owned, context) => {
  const deadline = context.now() + 30 * 60000;
  let closed = 0;
  for (let attempt = 0; attempt < 1800 && context.now() < deadline; attempt++) {
    const state = await linkedinPositionOutcome(context);
    if (state === 'confirmed') {
      return 'browser';
    }
    if (state === 'away' || (state === 'closed' && ++closed > 2)) {
      return 'closed';
    }
    if (state === 'open') {
      closed = 0;
      if (owned.decision) {
        return owned.decision;
      }
    }
    await context.wait(1000, context.signal);
  }
  return 'stopped';
};

const dispatchDecision = async (choice, context, update) => {
  await update({
    phase: choice === 'save' ? 'saving' : 'skipping',
    initiator: 'cli-or-api',
  });
  const result = await context.form.read({
    expected: context.controls,
    action: { kind: choice },
  });
  if (result.state !== 'dispatched') {
    throw linkedinPositionFailure('owner-draft');
  }
  const deadline = context.now() + 45000;
  let discarded = false;
  for (let count = 0; count < 45 && context.now() < deadline; count++) {
    const state = await linkedinPositionOutcome(context);
    if (choice === 'save' && state === 'confirmed') {
      return 'cli-or-api';
    }
    if (choice === 'skip' && state === 'closed') {
      return 'skipped';
    }
    if (choice === 'skip' && state === 'discard' && !discarded) {
      discarded = await linkedinPositionOutcome(context, true);
      if (!discarded) {
        break;
      }
    }
    if (state === 'away') {
      break;
    }
    await context.wait(1000, context.signal);
  }
  return 'unconfirmed';
};

const observePrepared = async (owned, update, context) => {
  const { plan } = context;
  const unapplied = [
    ...(plan.skills.length ? ['skills'] : []),
    ...(plan.media ? ['media'] : []),
  ];
  await update({ phase: 'prepared', unapplied });
  const choice = await waitForChoice(owned, context);
  if (choice === 'save' && !Object.keys(plan.fields).length) {
    throw linkedinPositionFailure('note');
  }
  const outcome = ['save', 'skip'].includes(choice)
    ? await dispatchDecision(choice, context, update)
    : choice;
  if (!['browser', 'cli-or-api'].includes(outcome)) {
    return { phase: outcome };
  }
  await update({ phase: 'verifying', initiator: outcome });
  const save = await verifyLinkedinPositionSave(context);
  return { phase: save ? 'saved' : 'unconfirmed', save };
};

const work = (context, open) => async (owned, update) => {
  try {
    const plan = await authorizedLinkedinPosition(
      context,
      owned.row.options.fingerprint
    );
    const signal = owned.controller.signal;
    signal.throwIfAborted();
    const result = await open(plan, signal, (native) =>
      observePrepared(owned, update, { ...native, plan })
    );
    return await update(result);
  } catch (error) {
    const pending = ['saving', 'verifying'].includes(owned.row.phase);
    if (owned.controller.signal.aborted && !pending) {
      return update({ phase: 'stopped' });
    }
    const code = positionCode.test(error.code ?? '')
      ? error.code
      : 'cv-linkedin-position-unavailable';
    if (process.env.MS_CV_LINKEDIN_DEBUG === '1') {
      console.error({
        event: 'linkedin-position',
        phase: owned.row.phase,
        code,
      });
    }
    await update({
      phase: pending ? 'unconfirmed' : 'failed',
      code,
    });
  }
};

export const readLinkedinPositionJob = async (store, input) => {
  const id = resumeExportRequestId(input.requestId);
  return view(checked(await store.get(key(id)), id), null);
};

export const createLinkedinPositionJobs = (context) => {
  const open = context.open ?? createLinkedinPositionNative(context);
  const service = new PrivateCvJob({
    store: context.store,
    key,
    optionsFor,
    newRecord,
    checked,
    view,
    failure: linkedinPositionFailure,
    work: work(context, open),
  });
  return {
    ...service.controls(),
    decide: (input) =>
      service.serial(async () => {
        const { requestId, fingerprint } = optionsFor(input);
        const { decision } = input;
        const active = service.current;
        if (
          !['save', 'skip'].includes(decision) ||
          active?.row.requestId !== requestId ||
          active.row.options.fingerprint !== fingerprint ||
          active.row.phase !== 'prepared' ||
          active.decision
        ) {
          throw linkedinPositionFailure('decision');
        }
        active.decision = decision;
        return view(active.row, true);
      }),
  };
};
