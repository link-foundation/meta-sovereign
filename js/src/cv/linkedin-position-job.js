import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { copyExperienceData } from './experience.js';
import { PrivateCvJob } from './private-job.js';
import { createLinkedinPositionNative } from './linkedin-position-native.js';
import { linkedinPositionEditorUrl } from './linkedin-position-editor-url.js';
import { linkedinPositionPending } from './linkedin-position-receipt.js';
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
  'no-changes',
];
const positionCode = /^cv-linkedin-position-[a-z-]{1,60}$/u;
export const linkedinPositionRunning = linkedinPositionPending;
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
  preparedSkills: [],
  unresolvedSkills: [],
  canSave: false,
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
const validUnapplied = (fields) =>
  Array.isArray(fields) &&
  fields.length <= 2 &&
  fields.every((name) => ['skills', 'media'].includes(name));
const validOptions = ({ options, phase }, id) =>
  options
    ? options.requestId === id &&
      JSON.stringify(optionsFor(options)) === JSON.stringify(options)
    : phase === 'stopped';
const validSkillNames = (names) =>
  Array.isArray(names) &&
  names.length <= 100 &&
  names.every((name) => typeof name === 'string' && name.length <= 100);
const validPreparation = ({
  preparedSkills = [],
  unresolvedSkills = [],
  canSave = false,
}) =>
  typeof canSave === 'boolean' &&
  validSkillNames(preparedSkills) &&
  validSkillNames(unresolvedSkills);
const validJobSave = ({ save, phase, initiator, preparedSkills = [] }) =>
  phase === 'saved'
    ? verifiedSave(save) &&
      Boolean(initiator) &&
      JSON.stringify(save.skills ?? []) === JSON.stringify(preparedSkills)
    : save === null;
const checked = (value, id) => {
  const row = copyExperienceData(value);
  if (
    !row ||
    row.id !== key(id) ||
    row.requestId !== id ||
    row.version !== 1 ||
    !running.concat(terminal).includes(row.phase) ||
    !validOptions(row, id) ||
    !validUnapplied(row.unapplied) ||
    !validPreparation(row) ||
    !validJobSave(row) ||
    ![null, 'cli-or-api', 'browser'].includes(row.initiator) ||
    (row.code !== null && !positionCode.test(row.code))
  ) {
    throw linkedinPositionFailure('job-record');
  }
  return row;
};
const view = (row, active, decisionPending = false) => {
  const { id: _id, version: _version, ...status } = copyExperienceData(row);
  if (linkedinPositionRunning(row) && !active) {
    return {
      ...status,
      lastPhase: row.phase,
      phase: active === null ? 'unknown' : 'interrupted',
      code: 'cv-linkedin-position-ownership',
      providerSaved: false,
      decisionPending,
    };
  }
  return { ...status, providerSaved: row.phase === 'saved', decisionPending };
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

const dispatchDecision = async (
  choice,
  context,
  update,
  initiator = 'cli-or-api'
) => {
  await update({
    phase: choice === 'save' ? 'saving' : 'skipping',
    initiator,
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
  const { plan, skills = { applied: [], unapplied: plan.skills } } = context;
  const unapplied = [
    ...(skills.unapplied.length ? ['skills'] : []),
    ...(plan.media ? ['media'] : []),
  ];
  const canSave = Boolean(
    Object.keys(plan.fields).length || skills.applied.length
  );
  const preparation = {
    unapplied,
    canSave,
    preparedSkills: skills.applied,
    unresolvedSkills: skills.unapplied,
  };
  if (!canSave && !plan.media) {
    const disposition = await dispatchDecision('skip', context, update, null);
    if (disposition !== 'skipped') {
      throw linkedinPositionFailure('skill-review');
    }
    return {
      phase: 'no-changes',
      code: 'cv-linkedin-position-note',
      ...preparation,
    };
  }
  await update({ phase: 'prepared', ...preparation });
  const choice = await waitForChoice(owned, context);
  if (choice === 'save') {
    await context.skills?.confirm();
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
    view: (row, active) =>
      view(
        row,
        active,
        Boolean(active && row.phase === 'prepared' && service.current?.decision)
      ),
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
          active.decision ||
          (decision === 'save' && !active.row.canSave)
        ) {
          throw linkedinPositionFailure('decision');
        }
        active.decision = decision;
        return view(active.row, true, true);
      }),
  };
};
