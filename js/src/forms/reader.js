import { openBrowserSession, browserAvailability } from '../cv/browser.js';
import { browserName } from '../browser/policy.js';
import { planFormAnswers } from './answer-plan.js';
import { formFailure as failure, formUrl } from './options.js';
import { inspectFormSession } from './inspection.js';
import { createFormSessions } from './review-sessions.js';
export { planFormAnswers } from './answer-plan.js';
export { formUrl } from './options.js';
export { inspectFormSession, inspectCurrentFormSession } from './inspection.js';

/** Own launch/read/close, including stop while a lazy browser launch is pending. */
export const createFormReader = ({
  store,
  openSession = openBrowserSession,
  availability = browserAvailability,
  deadlineMs = 60000,
  review = {},
} = {}) => {
  let active = null;
  let stopping = false;
  const planning = new Set();
  const reviews = createFormSessions({ store, openSession, ...review });
  return {
    openReview: reviews.open,
    closeReview: reviews.close,
    listReviews: reviews.list,
    readReview: reviews.read,
    focusReview: reviews.focus,
    async capabilities() {
      const status = await availability();
      return {
        ...status,
        read: status.available,
        plan: true,
        review: status.available,
        fill: false,
        submit: false,
        scope: 'visible-current-pages',
      };
    },
    async plan(input = {}) {
      if (stopping) {
        throw failure('form-stopped', 'Form planning is stopping.');
      }
      if (planning.size) {
        throw failure(
          'form-busy',
          'Another form answer plan is still running.'
        );
      }
      const task = planFormAnswers(store, input);
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
      const url = formUrl(options.url);
      const slot = browserName(options.browserSlot ?? 'forms');
      if (
        options.headless !== undefined &&
        typeof options.headless !== 'boolean'
      ) {
        throw failure('form-options', 'headless must be a boolean.');
      }
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
          return {
            ...(await inspectFormSession(session, { url, check })),
            browserSlot: slot,
            policy: session.policy ?? null,
          };
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
      const task = active;
      const reviewed = reviews.stop();
      await Promise.allSettled([
        reviewed,
        ...planning,
        ...(task ? [task.cancel(), task.done] : []),
      ]);
      await reviewed;
    },
  };
};
