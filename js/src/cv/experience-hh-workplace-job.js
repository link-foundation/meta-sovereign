import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { createHhExperienceWorkplaceNative } from '../jobs/cv-experience-workplace-native.js';
import { hhExperienceWorkplacePreparationSource } from '../jobs/cv-workplace-review-service.js';
import { hhExperienceAboutSource } from '../jobs/cv-experience-about-source.js';
import { traceCvWatch } from '../jobs/cv-watch-trace.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { PrivateCvJob } from './private-job.js';
import {
  HH_EXPERIENCE_SLOT,
  hhExperienceWorkplaceRunning,
  hhWorkplaceRunningPhases,
  hhWorkplaceFinalPhases,
  verifiedHhWorkplaceSave,
  verifiedHhAboutSave,
} from './experience-hh-workplace-receipt.js';

const sha256 = /^[a-f\d]{64}$/u;
const codePattern = /^(?:cv-hh-workplace|jobs-cv)-[a-z-]{1,60}$/u;
const failure = (reason) =>
  Object.assign(
    new Error('The HeadHunter experience review was not confirmed.'),
    {
      code: `cv-hh-workplace-${reason}`,
      status:
        { missing: 404, busy: 409, conflict: 409, decision: 409, stopped: 503 }[
          reason
        ] ?? 400,
    }
  );
const key = (id) => `secret:cv-hh-workplace-job:${resumeExportRequestId(id)}`;
const attemptKey = ({ fingerprint, planRequestId }) =>
  `secret:cv-hh-workplace-attempt:${planRequestId ? 'about:' : ''}${fingerprint}`;
const optionsFor = (input) => {
  const about = input.planRequestId !== undefined;
  if (
    !sha256.test(input.fingerprint ?? '') ||
    (about && input.browserSlot !== undefined)
  ) {
    throw failure('input');
  }
  return {
    requestId: resumeExportRequestId(input.requestId),
    fingerprint: input.fingerprint,
    ...(about
      ? { planRequestId: resumeExportRequestId(input.planRequestId) }
      : { browserSlot: browserName(input.browserSlot ?? 'jobs') }),
  };
};
const newRecord = (requestId, options = null) => ({
  id: key(requestId),
  version: 1,
  requestId,
  options,
  phase: options ? 'opening' : 'stopped',
  code: null,
  save: null,
  initiator: null,
});
const checked = (row, id) => {
  if (!row) {
    throw failure('missing');
  }
  const verified = row.options?.planRequestId
    ? verifiedHhAboutSave
    : verifiedHhWorkplaceSave;
  if (
    row.id !== key(id) ||
    row.requestId !== id ||
    row.version !== 1 ||
    (row.options
      ? row.options.requestId !== id ||
        JSON.stringify(optionsFor(row.options)) !== JSON.stringify(row.options)
      : row.phase !== 'stopped') ||
    !hhWorkplaceRunningPhases
      .concat(hhWorkplaceFinalPhases)
      .includes(row.phase) ||
    ![null, 'cli-or-api', 'browser'].includes(row.initiator) ||
    (row.phase === 'saved'
      ? !row.initiator || !verified(row.save)
      : row.save !== null) ||
    (row.code !== null && !codePattern.test(row.code))
  ) {
    throw failure('record');
  }
  return row;
};
const view = (row, active, decisionPending = false) => ({
  requestId: row.requestId,
  phase: row.phase,
  options: row.options ? optionsFor(row.options) : null,
  initiator: row.initiator,
  code: row.code,
  save: row.save
    ? {
        evidence: row.save.evidence,
        exports: row.save.exports.map(({ hash, sha256, workplace }) => ({
          hash,
          sha256,
          ...(workplace && {
            workplace: {
              recordId: workplace.recordId,
              sha256: workplace.sha256,
              checked: workplace.checked,
            },
          }),
        })),
      }
    : null,
  ...(hhExperienceWorkplaceRunning(row) && !active
    ? {
        phase: active === null ? 'unknown' : 'interrupted',
        lastPhase: row.phase,
        code: 'cv-hh-workplace-ownership',
      }
    : {}),
  experienceSlot: HH_EXPERIENCE_SLOT,
  providerSaved: row.phase === 'saved',
  decisionPending,
});

const runJob =
  ({ store, artifactRoot, authorize, prepare }) =>
  async (owned, save) => {
    const { options } = owned.row;
    const { signal } = owned.controller;
    const id = attemptKey(options);
    let recorded = false;
    const update = async (patch) => {
      if (['saving', 'verifying'].includes(patch.phase) && !recorded) {
        signal.throwIfAborted();
        await saveAcknowledgedRecord(store, {
          id,
          version: 1,
          requestId: options.requestId,
        });
        recorded = true;
      }
      await save(patch);
    };
    try {
      if (await store.get(id)) {
        throw failure('attempted');
      }
      const change = await authorize({ store, artifactRoot }, options);
      signal.throwIfAborted();
      const result = await prepare(
        change,
        signal,
        update,
        () => owned.decision
      );
      await update(result);
    } catch (error) {
      const pending = ['saving', 'verifying', 'skipping'].includes(
        owned.row.phase
      );
      const phase = pending
        ? 'unconfirmed'
        : signal.aborted
          ? 'stopped'
          : 'failed';
      const code = codePattern.test(error.code ?? '')
        ? error.code
        : 'cv-hh-workplace-unavailable';
      traceCvWatch('experience-workplace-ended', { phase, code });
      await save({ phase, code: phase === 'stopped' ? null : code });
    }
  };

export const readHhExperienceWorkplaceJob = async (store, input) => {
  const id = resumeExportRequestId(input.requestId);
  return view(checked(await store.get(key(id)), id), null);
};

export const createHhExperienceWorkplaceJobs = (context) => {
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
    failure,
    work: runJob({
      ...context,
      authorize:
        context.authorize ??
        ((source, input) =>
          (input.planRequestId
            ? hhExperienceAboutSource
            : hhExperienceWorkplacePreparationSource)(source, input)),
      prepare: context.prepareJob ?? createHhExperienceWorkplaceNative(context),
    }),
  });
  return {
    ...service.controls(),
    decide: (input) =>
      service.serial(async () => {
        const { requestId, fingerprint, browserSlot, planRequestId } =
          optionsFor(input);
        const active = service.current;
        if (
          !['save', 'skip'].includes(input.decision) ||
          active?.row.requestId !== requestId ||
          active.row.options.fingerprint !== fingerprint ||
          active.row.options.browserSlot !== browserSlot ||
          active.row.options.planRequestId !== planRequestId ||
          active.row.phase !== 'prepared' ||
          active.decision
        ) {
          throw failure('decision');
        }
        active.decision = input.decision;
        return view(active.row, true, true);
      }),
  };
};
