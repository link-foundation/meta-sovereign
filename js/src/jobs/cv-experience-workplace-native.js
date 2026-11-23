import { setTimeout as delay } from 'node:timers/promises';
import { cvPrepareFailure } from './cv-prepare-record.js';
import { prepareNativeCvWorkplace } from './cv-prepare-workplace.js';
import { monitorCvSaves } from './cv-watch-monitor.js';
import { readCvSavedExports } from './cv-watch-export.js';
import { verifyOwnerCvSave } from './cv-save-cycle.js';
import { captureWorkplaceBaseline } from './cv-watch-workplace-baseline.js';
import { hhExperienceWorkplaceControls } from './cv-experience-workplace-controls.js';
import { withHhExperienceBrowser } from './cv-experience-browser.js';
import { cvWorkplacePlanJob } from './cv-workplace-plan.js';
import { cvWorkplaceExportJobFingerprint } from './cv-watch-verification.js';
import { resolveHhExperienceWorkplace } from './cv-experience-workplace-resolve.js';

const captureBaselineForChange = async (context, change) => {
  const baseline = await captureWorkplaceBaseline(context);
  if (change.plan.operation === 'add') {
    const language = /^ru\b/iu.test(context.initial.locale ?? '') ? 'ru' : 'en';
    const fingerprint = cvWorkplaceExportJobFingerprint({
      ...cvWorkplacePlanJob(change.plan, 'desired', language),
      areaId: change.plan.desired.areaId,
    });
    if (baseline.jobs.get(change.hash)?.includes(fingerprint)) {
      throw cvPrepareFailure('experience-duplicate');
    }
  }
  return baseline;
};

const watchDecision = async ({ page, raw, observe }) => {
  let formId;
  return monitorCvSaves({
    page,
    receive(value) {
      if (
        value.event === 'workplace-opened' &&
        !formId &&
        value.form.url === raw.url
      ) {
        formId = value.formId;
        return true;
      }
      if (['save', 'cancel', 'edit', 'overflow'].includes(value.event)) {
        observe(
          value.event,
          value.formId === formId &&
            JSON.stringify(value.form) === JSON.stringify(raw)
        );
      }
      return false;
    },
    failed: () => observe('unavailable'),
  });
};

const discardWorkplace = async ({ page, controls, signal, wait, now }) => {
  let dialogPending = true;
  const handleDialog = (dialog) => {
    const operation =
      dialogPending && !signal.aborted && dialog.type() === 'beforeunload'
        ? dialog.accept()
        : dialog.dismiss();
    operation.catch(() => {});
  };
  page.on('dialog', handleDialog);
  try {
    if ((await controls.read('skip')) !== 'dispatched') {
      throw cvPrepareFailure('draft');
    }
    const deadline = now() + 15000;
    let confirmation = false;
    do {
      const state = await controls.read();
      if (state === 'closed') {
        return 'skipped';
      }
      if (state === 'discard' && !confirmation) {
        confirmation = true;
        if ((await controls.read('discard')) !== 'dispatched') {
          return 'unconfirmed';
        }
      }
      if (state === 'changed' || state === 'away') {
        return 'unconfirmed';
      }
      await wait(200, signal);
    } while (now() < deadline);
    return 'unconfirmed';
  } finally {
    dialogPending = false;
    page.off('dialog', handleDialog);
  }
};

const awaitChoice = async ({ controls, decision, signal, wait, now }) => {
  const deadline = now() + 30 * 60000;
  let closed = 0;
  do {
    const choice = decision();
    if (choice) {
      return choice;
    }
    const state = await controls.read();
    if (state === 'away' || (state === 'closed' && ++closed > 2)) {
      return 'closed';
    }
    if (state === 'open') {
      closed = 0;
    }
    await wait(300, signal);
  } while (now() < deadline);
  return 'stopped';
};

/** The prepared native tab, passive owner clicks and verification share one lease. */
export const createHhExperienceWorkplaceNative =
  ({
    store,
    storeDir,
    browser = withHhExperienceBrowser,
    prepare = prepareNativeCvWorkplace,
    readExports = readCvSavedExports,
    verify = verifyOwnerCvSave,
    wait = (ms, signal) => delay(ms, undefined, { signal }),
    now = Date.now,
  }) =>
  (change, signal, update, selection) =>
    browser({
      store,
      storeDir,
      sourceSlot: change.plan.browserSlot,
      hash: change.hash,
      language: change.language,
      signal,
      phase: (phase) => update({ phase }),
      run: async (session, check) =>
        prepare({
          session,
          change: await resolveHhExperienceWorkplace({
            session,
            change,
            check,
          }),
          check,
          phase: (phase) => update({ phase }),
          captureBaseline: (initial) =>
            captureBaselineForChange(
              { session, store, initial, signal, readExports },
              change
            ),
          withPrepared: async ({ raw, after, anchor, baseline }) => {
            const { page } = session;
            const controls = await hhExperienceWorkplaceControls({
              page,
              anchor,
              raw,
              hash: change.hash,
              check,
            });
            let ownerSave;
            let invalidated = false;
            let watcher;
            try {
              watcher = await watchDecision({
                page,
                raw,
                observe(event, exact) {
                  if (event === 'save') {
                    if (ownerSave || !exact) {
                      invalidated = true;
                    }
                    ownerSave = true;
                  } else if (ownerSave) {
                    invalidated = true;
                  }
                },
              });
              await update({ phase: 'prepared' });
              const decision = await awaitChoice({
                controls,
                decision: () => (ownerSave ? 'browser' : selection()),
                signal,
                wait,
                now,
              });
              if (decision === 'skip') {
                await update({ phase: 'skipping' });
                const phase = await discardWorkplace({
                  page,
                  controls,
                  signal,
                  wait,
                  now,
                });
                return { phase: ownerSave ? 'unconfirmed' : phase };
              }
              if (decision === 'save') {
                if (ownerSave || (await controls.read()) !== 'open') {
                  throw cvPrepareFailure('draft');
                }
                await update({ phase: 'saving', initiator: 'cli-or-api' });
                if (
                  ownerSave ||
                  (await controls.read('save')) !== 'dispatched'
                ) {
                  throw cvPrepareFailure('draft');
                }
              } else if (decision !== 'browser') {
                return { phase: decision };
              }
              await update({
                phase: 'verifying',
                initiator: decision === 'browser' ? 'browser' : 'cli-or-api',
              });
              const confirm = () => {
                check();
                if (invalidated || (decision === 'save' && ownerSave)) {
                  throw cvPrepareFailure('draft');
                }
              };
              confirm();
              const result = await verify({
                session,
                store,
                attempt: after,
                check: confirm,
                signal,
                readExports,
                workplaceBaseline: baseline.ids,
                workplaceBaselineJobs: baseline.jobs,
                workplaceMembership: baseline.membership,
              });
              confirm();
              return {
                phase: 'saved',
                save: {
                  evidence: 'verified-hh-workplace-export',
                  exports: result.exports.map(
                    ({ hash, sha256, workplace }) => ({
                      hash,
                      sha256,
                      workplace,
                    })
                  ),
                },
              };
            } finally {
              try {
                await watcher?.stop();
              } finally {
                await controls.close();
              }
            }
          },
        }),
    });
