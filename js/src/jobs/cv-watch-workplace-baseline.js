import { jobsFailure } from './options.js';
import { traceCvWatch } from './cv-watch-trace.js';
import { readCvSavedWorkplaceIds } from './cv-workplace-created.js';
import { readCvSavedWorkplace } from './cv-workplace-readback.js';
import {
  cvWorkplaceExportBaseline,
  cvWorkplaceMembershipBaseline,
  cvWorkplaceSaveResumes,
} from './cv-watch-verification.js';

export const missingWorkplaceBaseline = () =>
  jobsFailure('cv-record', 'The pre-Save workplace evidence is unavailable.');

export const captureWorkplaceBaseline = async ({
  session,
  store,
  initial,
  signal,
  deadline = globalThis.performance.now() + 30000,
  readExports,
  readIds = readCvSavedWorkplaceIds,
  readWorkplace = readCvSavedWorkplace,
}) => {
  const check = () => {
    signal.throwIfAborted();
    if (session.page.url() !== initial.url) {
      throw jobsFailure('cv-changed', 'The native workplace form changed.');
    }
    if (globalThis.performance.now() >= deadline) {
      throw jobsFailure(
        'cv-readback-timeout',
        'The pre-Save CV reads expired.'
      );
    }
  };
  const resumes = cvWorkplaceSaveResumes(initial);
  check();
  if (initial.recordId !== null) {
    const saved = await readWorkplace({
      session,
      attempt: { recordId: initial.recordId },
      check,
      signal,
    });
    check();
    if (saved.recordId !== initial.recordId) {
      throw missingWorkplaceBaseline();
    }
    const exports = await readExports({
      session,
      store,
      attempt: saved,
      check,
      signal,
    });
    const membership = cvWorkplaceMembershipBaseline(saved, exports);
    if (
      membership.resumes.size !== resumes.length ||
      resumes.some(({ hash }) => !membership.resumes.has(hash))
    ) {
      throw missingWorkplaceBaseline();
    }
    check();
    traceCvWatch('workplace-membership-baseline', {
      resumes: membership.resumes.size,
    });
    return { membership };
  }
  const ids = await readIds({ session, check, signal });
  check();
  const exports = await readExports({
    session,
    store,
    attempt: { kind: 'workplace', resumes },
    check,
    signal,
  });
  const jobs = cvWorkplaceExportBaseline(exports, resumes);
  check();
  traceCvWatch('workplace-list-baseline', {
    records: ids.length,
    resumes: jobs.size,
  });
  return { ids, jobs };
};

/** Bind read-only evidence to one observed instance of the native form. */
export const observeCvWorkplaceBaselines = (options) => {
  let current;
  let tail = Promise.resolve();
  const invalidate = () => {
    current?.controller.abort();
    current = undefined;
  };
  return {
    open({ form, formId }, actualUrl) {
      if (
        options.signal.aborted ||
        form?.url !== actualUrl ||
        !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(formId ?? '')
      ) {
        return;
      }
      if (current?.formId === formId) {
        return tail;
      }
      invalidate();
      const controller = new AbortController();
      const signal = globalThis.AbortSignal.any([
        options.signal,
        controller.signal,
      ]);
      const entry = { controller, formId, url: form.url, baseline: undefined };
      current = entry;
      const deadline = globalThis.performance.now() + 30000;
      tail = tail.then(async () => {
        try {
          const baseline = await captureWorkplaceBaseline({
            ...options,
            initial: form,
            signal,
            deadline,
          });
          signal.throwIfAborted();
          entry.baseline = baseline;
          return true;
        } catch (error) {
          if (!signal.aborted) {
            traceCvWatch('workplace-baseline-unavailable', {
              code: error.code ?? error.name,
            });
          }
        }
      });
      return tail;
    },
    close(formId) {
      if (current?.formId === formId) {
        invalidate();
      }
    },
    take({ formId, form }) {
      if (current && current.formId === formId && current.url === form.url) {
        const result = current.baseline;
        invalidate();
        return result;
      }
      invalidate();
    },
    invalidate,
    async stop() {
      invalidate();
      await tail;
    },
  };
};
