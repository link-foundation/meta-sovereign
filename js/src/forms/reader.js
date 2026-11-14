import { openBrowserSession, browserAvailability } from '../cv/browser.js';
import { browserName } from '../browser/policy.js';
import { planFormAnswers } from './answer-plan.js';
import { formFailure as failure, formUrl } from './options.js';
import { inspectFormSession } from './inspection.js';
import { createFormSessions } from './review-sessions.js';
import { withFormReportFile } from './report-file.js';
import path from 'node:path';
import { createFormKnowledgeBridge } from './knowledge-bridge.js';
import { createAssignmentRepositoryService } from './assignment-service.js';
import { createAssignmentPublisher } from '../assignments/service.js';
import { rememberAssignmentRedirect } from '../assignments/vacancy-association.js';
export { planFormAnswers } from './answer-plan.js';
export { formUrl } from './options.js';
export { inspectFormSession, inspectCurrentFormSession } from './inspection.js';

const formCapabilities = async (availability) => {
  const status = await availability();
  return {
    ...status,
    read: status.available,
    plan: true,
    review: status.available,
    fill: status.available,
    prefill: status.available,
    inspectChoices: status.available,
    attachResume: status.available,
    fillScope: 'reviewed-native-and-exposed-aria-controls',
    prefillScope: 'supported-empty-current-page-controls',
    submit: false,
    assignmentPublish: true,
    scope: 'visible-current-pages',
  };
};

const stopReader = async (reviews, planning, task, bridge) => {
  const reviewed = reviews.stop();
  await Promise.allSettled([
    reviewed,
    ...planning,
    ...(task ? [task.cancel(), task.done] : []),
  ]);
  try {
    await reviewed;
  } finally {
    await (await bridge)?.close();
  }
};
const detachReader = async (reviews, bridge) => {
  try {
    return await reviews.detach();
  } finally {
    await (await bridge)?.close();
  }
};

const startKnowledgeBridge = (store) => {
  if (!store?.logFile) {
    return null;
  }
  const bridge = createFormKnowledgeBridge({
    store,
    directory: path.dirname(store.logFile),
  });
  bridge.catch(() => {});
  return bridge;
};

const checkPlanning = (stopping, planning) => {
  if (stopping) {
    throw failure('form-stopped', 'Form planning is stopping.');
  }
  if (planning.size) {
    throw failure('form-busy', 'Another form answer plan is still running.');
  }
};

const reviewReaderApi = (reviews) => ({
  openReview: reviews.open,
  closeReview: reviews.close,
  listReviews: reviews.list,
  reviewCapacity: reviews.capacity,
  configureReviewCapacity: reviews.configureCapacity,
  readReview: reviews.read,
  focusReview: reviews.focus,
  planReview: reviews.plan,
  applyReview: reviews.apply,
  prefillReview: reviews.prefill,
  prefillStatus: reviews.prefillStatus,
  discloseReview: reviews.disclose,
  attachReview: reviews.attach,
  historyReview: reviews.history,
});

const assignmentServices = ({
  store,
  modelRunner,
  verifyAssignmentRepository,
  assignmentGithub,
  readAssignmentVacancy,
  readAssignmentSource,
}) => {
  const assignments = createAssignmentRepositoryService({
    store,
    verifyRepository: verifyAssignmentRepository,
  });
  const publisher = createAssignmentPublisher({
    store,
    modelRunner,
    github: assignmentGithub,
    readVacancy: readAssignmentVacancy,
    readSource: readAssignmentSource,
  });
  return { assignments, publisher };
};

const readerOptions = (options) => {
  const url = formUrl(options.url);
  const slot = browserName(options.browserSlot ?? 'forms');
  if (options.headless !== undefined && typeof options.headless !== 'boolean') {
    throw failure('form-options', 'headless must be a boolean.');
  }
  return { url, slot };
};

/** Own launch/read/close, including stop while a lazy browser launch is pending. */
export const createFormReader = ({
  store,
  openSession = openBrowserSession,
  availability = browserAvailability,
  deadlineMs = 60000,
  review = {},
  reportWriter,
  modelRunner,
  verifyAssignmentRepository,
  assignmentGithub,
  readAssignmentVacancy,
  readAssignmentSource,
} = {}) => {
  const { assignments, publisher } = assignmentServices({
    store,
    modelRunner,
    verifyAssignmentRepository,
    assignmentGithub,
    readAssignmentVacancy,
    readAssignmentSource,
  });
  let active = null;
  let stopping = false;
  const planning = new Set();
  const modelAbort = new AbortController();
  const bridge = startKnowledgeBridge(store);
  const reviews = createFormSessions({
    store,
    openSession,
    reportWriter,
    modelRunner,
    ...review,
    ready: bridge,
  });
  return {
    registerAssignmentRepository: assignments.register,
    draftAssignment: publisher.draft,
    restoreAssignment: publisher.restore,
    publishAssignment: publisher.publish,
    ...reviewReaderApi(reviews),
    detachReviews: async () => {
      stopping = true;
      modelAbort.abort();
      await assignments.stop();
      await publisher.stop();
      await Promise.allSettled(planning);
      return detachReader(reviews, bridge);
    },
    capabilities: () => formCapabilities(availability),
    async plan(input = {}) {
      checkPlanning(stopping, planning);
      const task = planFormAnswers(store, input, {
        runner: modelRunner,
        signal: modelAbort.signal,
      }).then((result) => withFormReportFile(reportWriter, result));
      planning.add(task);
      try {
        return await task;
      } finally {
        planning.delete(task);
      }
    },
    async read(options = {}) {
      if (stopping) {
        throw failure('form-stopped', 'Form inspection is stopping.');
      }
      if (active) {
        throw failure('form-busy', 'Another form inspection is still running.');
      }
      const { url, slot } = readerOptions(options);
      let session;
      let closing;
      let cancelled = false;
      let expired = false;
      const close = () =>
        session
          ? (closing ??= Promise.resolve().then(() => session.close()))
          : Promise.resolve();
      const check = () => {
        if (expired) {
          throw failure(
            'form-timeout',
            'Form inspection reached its time limit. Read the current page again.'
          );
        }
        if (cancelled || stopping) {
          throw failure(
            'form-stopped',
            'Form inspection stopped before a snapshot was completed.'
          );
        }
      };
      const task = {
        cancel: () => {
          cancelled = true;
          return close();
        },
      };
      active = task;
      const timer = globalThis.setTimeout(() => {
        expired = true;
        close().catch(() => {});
      }, deadlineMs);
      timer.unref?.();
      task.done = (async () => {
        try {
          session = await openSession({
            store,
            platform: 'shared',
            useCase: 'forms',
            slot,
            headless: options.headless,
          });
          check();
          const report = {
            ...(await inspectFormSession(session, { url, check })),
            browserSlot: slot,
            policy: session.policy ?? null,
          };
          await rememberAssignmentRedirect(store, url, report.url);
          return await withFormReportFile(reportWriter, report);
        } catch (error) {
          check();
          throw error;
        } finally {
          try {
            await close();
          } finally {
            globalThis.clearTimeout(timer);
          }
        }
      })();
      try {
        return await task.done;
      } finally {
        if (active === task) {
          active = null;
        }
      }
    },
    async stop() {
      stopping = true;
      modelAbort.abort();
      await assignments.stop();
      await publisher.stop();
      await stopReader(reviews, planning, active, bridge);
    },
  };
};
