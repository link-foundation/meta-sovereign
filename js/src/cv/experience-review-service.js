import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrivateCvJob } from './private-job.js';
import {
  checkedExperienceReview,
  experienceReviewCanResume,
  experienceReviewCode,
  experienceReviewFailure as failure,
  experienceReviewKey,
  experienceReviewOptions,
  experienceReviewRunning,
  experienceReviewView,
  newExperienceReview,
  reviewChildId,
} from './experience-review-record.js';
import {
  experienceAutoOptions,
  experienceAutoRunning,
} from './experience-auto-record.js';
import {
  checkHhSnapshot,
  checkLinkedinSnapshot,
  sameExperienceChild,
  storedExperienceAutoStatus,
  workExperienceChild,
} from './experience-auto-service.js';
import { confirmedExperiencePlan } from './experience-plan-receipt.js';
import { readExperiencePlan } from './experience-plan-service.js';
import {
  experiencePlanOptions,
  experiencePlanRunning,
} from './experience-plan-record.js';
import { storedExperienceDocument } from './experience-store.js';
import { hhAcquisitionRunning } from './experience-hh-acquisition.js';
import { hhAcquisitionOptions } from './experience-hh-acquisition-options.js';
import {
  linkedinExportOptions,
  linkedinExportRunning,
} from './linkedin-experience-record.js';

const savedPlan = async (store, comparison) => {
  const row = await confirmedExperiencePlan(
    await readExperiencePlan(store, comparison),
    comparison.requestId
  );
  if (
    row.fingerprint !== comparison.fingerprint ||
    row.options.hh !== comparison.hh ||
    row.options.linkedin !== comparison.linkedin ||
    row.options.to !== comparison.to
  ) {
    throw failure('comparison');
  }
  return row;
};
const pinPlan = ({
  requestId,
  fingerprint,
  options: { hh, linkedin, to },
}) => ({ requestId, fingerprint, hh, linkedin, to });

const queue = ({ plan }) => {
  const pending = [];
  const groupNotes = [];
  if (plan.profile.fields.length) {
    pending.push('about');
  }
  for (const job of plan.jobs) {
    if (['add', 'update'].includes(job.kind) && job.fields.length) {
      pending.push(`position-${job.sourceIndex}`);
    } else if (job.kind === 'review' || job.kind === 'keep') {
      groupNotes.push(
        ...job.notes.map(({ field, reason }) => ({ field, reason }))
      );
    }
  }
  return { pending, groupNotes };
};
const finishItem = (row, outcome, info = {}) => ({
  phase: 'selecting',
  waitingLogin: false,
  pending: row.pending.slice(1),
  current: null,
  freshRevision: null,
  replanRequestId: null,
  code: null,
  history: [
    ...row.history,
    {
      key: row.pending[0],
      outcome,
      code: info.code ?? null,
      revision: info.revision ?? null,
      evidence: info.evidence ?? null,
      notes: row.current?.notes ?? [],
    },
  ],
});
const nativeStatusAfterStart = async (reviewer) => {
  try {
    return await reviewer.start();
  } catch (error) {
    return reviewer.status().catch(() => {
      throw error;
    });
  }
};
const applyChoice = async (owned, save, reviewer, signal) => {
  const { decision, resolve, reject } = owned.choice;
  try {
    await save({ current: { ...owned.row.current, decision } });
    signal.throwIfAborted();
    const result = await reviewer.decide(decision);
    resolve();
    return result;
  } catch (error) {
    reject(error);
    // A failed response can follow admission. Status is safe to read.
    const result = await reviewer.status();
    if (result.phase === 'prepared' && !result.decisionPending) {
      throw failure('decision');
    }
    return result;
  }
};
const finishNative = async ({ owned, save, reviewer, wait, opening }) => {
  const { signal } = owned.controller;
  // The native service admits a request ID once and returns any existing receipt.
  let result = opening
    ? await nativeStatusAfterStart(reviewer)
    : await reviewer.status();
  try {
    while (reviewer.running(result) && !signal.aborted) {
      const waitingLogin = result.phase === 'waiting-login';
      if (waitingLogin !== owned.row.waitingLogin) {
        await save({ waitingLogin });
      }
      if (result.phase === 'prepared' && owned.row.phase !== 'prepared') {
        await save({
          phase: 'prepared',
          current: {
            ...owned.row.current,
            canSave: result.canSave !== false,
          },
        });
      }
      if (
        owned.choice &&
        result.phase === 'prepared' &&
        !owned.row.current.decision
      ) {
        result = await applyChoice(owned, save, reviewer, signal);
      }
      await wait(signal);
      result = await reviewer.status();
    }
  } catch (error) {
    if (!signal.aborted) {
      if (reviewer.running(result)) {
        await reviewer.stop();
      }
      throw error;
    }
  }
  return reviewer.running(result) ? reviewer.stop() : result;
};
const settleNative = (owned, result, save) => {
  const { row } = owned;
  if (result.providerSaved && result.phase === 'saved') {
    return save({
      phase: 'refreshing',
      waitingLogin: false,
      current: { ...row.current, canSave: false },
    });
  }
  if (result.phase === 'skipped') {
    return save(finishItem(row, 'skipped'));
  }
  if (result.phase === 'no-changes') {
    return save(
      finishItem(row, 'manual', { code: failure('native-fields').code })
    );
  }
  const uncertain =
    row.current.decision ||
    ['unconfirmed', 'interrupted', 'unknown'].includes(result.phase);
  return save({
    waitingLogin: false,
    phase: uncertain
      ? 'unconfirmed'
      : ['closed', 'stopped', 'left'].includes(result.phase)
        ? 'left'
        : 'failed',
    code: experienceReviewCode(
      result.code,
      uncertain ? 'unconfirmed' : 'native-ended'
    ),
  });
};

const postSaveChild = async ({
  row,
  child,
  checkpoint,
  inputFor,
  getService,
  running,
  run,
  save,
}) => {
  let requestId = row[checkpoint];
  if (requestId) {
    const status = await getService()
      .status({ requestId })
      .catch(() => null);
    if (sameExperienceChild(status, inputFor(requestId))) {
      if (status.phase === 'completed') {
        return status;
      }
      if (['failed', 'stopped', 'interrupted'].includes(status.phase)) {
        requestId = null;
      }
    }
  }
  if (!requestId) {
    requestId = reviewChildId(row, child, randomBytes(8).toString('hex'));
    await save({ [checkpoint]: requestId });
  }
  return run(getService, inputFor(requestId), running);
};

const readFresh = async (context, row, plan, result, run, save) => {
  const target = plan.plan.target;
  const { store } = context;
  const before = await storedExperienceDocument(store, target.revision);
  const hh = target.platform === 'hh';
  const inputFor = (requestId) =>
    hh
      ? hhAcquisitionOptions({
          ...row.auto,
          requestId,
          hash: before.provenance.identity.hash,
          browserSlot: before.provenance.identity.browserSlot,
          refresh: true,
        })
      : linkedinExportOptions({
          requestId,
          url: target.url,
          language: target.language,
        });
  const receipt = await postSaveChild({
    row,
    child: 'refresh',
    checkpoint: 'refreshRequestId',
    inputFor,
    getService: hh ? context.getHh : context.getLinkedin,
    running: hh ? hhAcquisitionRunning : linkedinExportRunning,
    run,
    save,
  });
  const checkSnapshot = hh ? checkHhSnapshot : checkLinkedinSnapshot;
  try {
    const revision = await checkSnapshot(
      store,
      receipt,
      inputFor(receipt.requestId)
    );
    await context.native.confirmFresh(
      row.current,
      plan,
      result,
      before,
      await storedExperienceDocument(store, revision)
    );
    return revision;
  } catch (error) {
    if (
      [
        'cv-experience-review-readback',
        'cv-experience-auto-hh-snapshot',
        'cv-experience-auto-linkedin-snapshot',
      ].includes(error.code)
    ) {
      await save({ refreshRequestId: null });
    }
    throw error;
  }
};

const acquisitionInput = (row) =>
  row.options.autoRequestId
    ? null
    : experienceAutoOptions({
        ...row.options,
        requestId: reviewChildId(row, 'auto'),
      });

const acquiredComparison = async (store, auto) => {
  if (auto.phase !== 'completed' || !auto.plan) {
    throw failure('preparation');
  }
  const comparison = {
    ...auto.plan,
    hh: auto.hh,
    linkedin: auto.linkedin,
    to: auto.options.to,
  };
  const plan = await savedPlan(store, comparison);
  return {
    ...queue(plan),
    auto: auto.options,
    comparison,
    phase: 'selecting',
    waitingLogin: false,
  };
};

const startComparison = async (context, row, run, signal) => {
  const input = acquisitionInput(row);
  const auto = input
    ? await run(context.getAuto, input, experienceAutoRunning)
    : await context.getAuto().status({ requestId: row.options.autoRequestId });
  signal.throwIfAborted();
  return acquiredComparison(context.store, auto);
};

const recoverAcquisition = async (store, row) => {
  const input = acquisitionInput(row);
  const requestId = input?.requestId ?? row.options.autoRequestId;
  const auto = await storedExperienceAutoStatus(store, { requestId });
  if (input && !sameExperienceChild(auto, input)) {
    throw failure('preparation');
  }
  return acquiredComparison(store, auto);
};

const reviewView = async (store, row, active) => {
  const view = experienceReviewView(row, active);
  if (view.phase !== 'interrupted' || row.phase !== 'acquiring') {
    return view;
  }
  const preparation = await recoverAcquisition(store, row).catch(() => null);
  return { ...view, preparationAvailable: Boolean(preparation) };
};

const replan = async (context, row, plan, run, save) => {
  const receipt = await postSaveChild({
    row,
    child: 'plan',
    checkpoint: 'replanRequestId',
    inputFor: (requestId) =>
      experiencePlanOptions({
        ...plan.options,
        requestId,
        [plan.options.to]: row.freshRevision,
      }),
    getService: context.getPlan,
    running: experiencePlanRunning,
    run,
    save,
  });
  return confirmedExperiencePlan(receipt, receipt.requestId);
};

const snapshotAfterSave = async (context, row, plan, run, save) => {
  const result = await context.native.reviewer(row.current).status();
  if (!result.providerSaved || result.phase !== 'saved') {
    throw failure('native-receipt');
  }
  if (row.phase === 'refreshing') {
    const freshRevision = await readFresh(
      context,
      row,
      plan,
      result,
      run,
      save
    );
    return {
      phase: 'replanning',
      freshRevision,
      refreshRequestId: null,
      waitingLogin: false,
    };
  }
  const next = await replan(context, row, plan, run, save);
  return {
    ...finishItem(row, 'saved', {
      revision: row.freshRevision,
      evidence: result.save.evidence,
    }),
    comparison: pinPlan(next),
  };
};

const workFor = (context) => async (owned, save) => {
  const { signal } = owned.controller;
  const progress = (phase, child) => {
    const waitingLogin =
      phase === 'waiting-login' || child.step === 'waiting-login';
    if (waitingLogin !== owned.row.waitingLogin) {
      return save({ waitingLogin });
    }
  };
  const run = (getService, input, running) =>
    workExperienceChild(
      getService,
      input,
      running,
      signal,
      progress,
      context.wait
    );
  try {
    if (owned.row.phase === 'acquiring') {
      await save(await startComparison(context, owned.row, run, signal));
    }
    while (!signal.aborted && experienceReviewRunning(owned.row)) {
      const row = owned.row;
      if (row.phase === 'selecting' && !row.pending.length) {
        await save({ phase: 'completed' });
        break;
      }
      const plan = await savedPlan(context.store, row.comparison);
      signal.throwIfAborted();
      if (row.phase === 'selecting') {
        const key = row.pending[0];
        const item = await context.native.prepare(
          plan,
          key,
          reviewChildId(row, 'native')
        );
        signal.throwIfAborted();
        if (item.code || item.unchanged) {
          await save(
            finishItem(row, item.unchanged ? 'unchanged' : 'manual', item)
          );
          continue;
        }
        await save({
          phase: 'opening',
          current: { ...item, key, canSave: false, decision: null },
        });
      } else if (['opening', 'prepared'].includes(row.phase)) {
        const reviewer = context.native.reviewer(row.current);
        const result = await finishNative({
          owned,
          save,
          reviewer,
          wait: context.wait,
          opening: row.phase === 'opening' && row.current.decision === null,
        });
        await settleNative(owned, result, save);
        owned.choice?.reject(failure('decision'));
        owned.choice = null;
      } else {
        const checkpoint = await snapshotAfterSave(
          context,
          row,
          plan,
          run,
          save
        );
        signal.throwIfAborted();
        await save(checkpoint);
      }
    }
    if (
      signal.aborted &&
      ['selecting', 'acquiring'].includes(owned.row.phase)
    ) {
      await save({ phase: 'left', waitingLogin: false });
    }
  } catch (error) {
    const { phase } = owned.row;
    if (['refreshing', 'replanning'].includes(phase)) {
      await save({
        waitingLogin: false,
        code: experienceReviewCode(error.code, 'readback'),
      });
    } else {
      const native = ['opening', 'prepared'].includes(phase);
      await save({
        phase: native ? 'unconfirmed' : signal.aborted ? 'left' : 'failed',
        waitingLogin: false,
        code: experienceReviewCode(
          error.code,
          native ? 'unconfirmed' : 'unavailable'
        ),
      });
    }
  } finally {
    owned.choice?.reject(failure('decision'));
  }
};

const resume = async (service, input) => {
  if (service.closing || service.current) {
    throw failure(service.closing ? 'stopped' : 'busy');
  }
  const { requestId } = input;
  const row = checkedExperienceReview(
    await service.store.get(experienceReviewKey(requestId)),
    requestId
  );
  if (row.phase === 'acquiring') {
    const preparation = await recoverAcquisition(service.store, row).catch(
      () => null
    );
    if (!preparation) {
      throw failure('conflict');
    }
    const owned = { row };
    await service.save(owned, preparation);
    return service.launch(owned.row);
  }
  if (!experienceReviewCanResume(row.phase)) {
    throw failure('conflict');
  }
  return service.launch(row);
};

/** Run one explicitly started review. Only a current native editor receives decisions. */
export const createExperienceReviewService = (context) => {
  const service = new PrivateCvJob({
    store: context.store,
    key: experienceReviewKey,
    failure,
    optionsFor: experienceReviewOptions,
    newRecord: (requestId, options) =>
      newExperienceReview(
        requestId,
        options,
        options ? randomBytes(16).toString('hex') : null
      ),
    checked: checkedExperienceReview,
    view: (row, active) => reviewView(context.store, row, active),
    work: workFor({
      ...context,
      wait: context.wait ?? ((signal) => delay(250, null, { signal })),
    }),
  });
  return {
    ...service.controls(),
    resume: (input) => service.serial(() => resume(service, input)),
    decide: (input) =>
      service.serial(async () => {
        const active = service.current;
        const row = active?.row;
        if (
          row?.requestId !== input.requestId ||
          row.phase !== 'prepared' ||
          row.current.key !== input.key ||
          row.current.input.requestId !== input.nativeRequestId ||
          row.current.decision ||
          active.choice ||
          !['save', 'skip'].includes(input.decision) ||
          (input.decision === 'save' && !row.current.canSave)
        ) {
          throw failure('decision');
        }
        await new Promise((resolve, reject) => {
          active.choice = { decision: input.decision, resolve, reject };
        });
        return experienceReviewView(active.row, true);
      }),
  };
};

export const storedExperienceReviewStatus = async (store, { requestId }) =>
  reviewView(
    store,
    checkedExperienceReview(
      await store.get(experienceReviewKey(requestId)),
      requestId
    ),
    false
  );
