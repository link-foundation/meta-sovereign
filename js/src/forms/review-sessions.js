import { createReviewLifecycle } from './review-lifecycle.js';
import { rememberAssignmentRedirect } from '../assignments/vacancy-association.js';
import { browserName } from '../browser/policy.js';
import { openBrowserSession } from '../cv/browser.js';
import { formFailure as failure, formUrl } from './options.js';
import { inspectCurrentFormSession } from './inspection.js';
import { trackReviewActivity } from './review-activity.js';
import { createReviewedPrefill } from './review-prefill.js';
import { prefillFormReview } from './automatic-prefill.js';
import { createPrefillControl } from './prefill-control.js';
import { pendingPrefill } from './challenge-wait.js';
import { createFormJournal, formReportSnapshot } from './review-journal.js';
import { persistFormReport } from './report-file.js';
import { createFormMonitor } from './review-monitor.js';
import { createFormLearning } from './review-learning.js';
import { learnFormAnswerPairs } from './answer-learning.js';
import path from 'node:path';
import { startFormWatcher } from './watcher-client.js';
import {
  createReviewCapacity,
  reviewCapacityValue,
} from './review-capacity.js';

const bounded = (value, max) =>
  Number.isInteger(value) && value > 0 && value <= max;
const idleExpiry = (record) =>
  record.learning?.watcher?.().idleExpiresAt ??
  new Date(record.lastUsedAt + record.idleMs).toISOString();
const prefillIdentity = (record) =>
  pendingPrefill(record.lastPrefill?.result)
    ? { prefillState: record.lastPrefill.result.state }
    : {};
const identity = (record) => {
  let url = record.url;
  try {
    url = formUrl(record.browser?.page?.url?.() ?? url);
  } catch {
    // Do not expose unsupported/credential-bearing navigation URLs.
  }
  return {
    id: record.id,
    browserSlot: record.slot,
    url,
    title: record.title,
    state: record.state,
    busy: Boolean(record.task),
    headless: record.browser?.policy?.headless ?? null,
    openedAt: new Date(record.openedAt).toISOString(),
    lastUsedAt: new Date(record.lastUsedAt).toISOString(),
    idleExpiresAt: idleExpiry(record),
    activityTracking: record.activityTracking,
    answerLearning: record.learning?.status(),
    watcher: record.learning?.watcher?.(),
    monitoring: record.monitor?.status() ?? {
      state: 'unavailable',
      learning: false,
    },
    error: record.error ?? null,
    ...prefillIdentity(record),
  };
};

const reviewInput = (input) => {
  for (const key of ['headless', 'autoCapture', 'learn']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') {
      throw failure('form-options', `${key} must be a boolean.`);
    }
  }
  return {
    url: formUrl(input.url),
    slot: browserName(input.browserSlot ?? 'form-1'),
  };
};

const reviewLimits = ({
  maxSessions,
  idleMs,
  deadlineMs,
  autoCapture,
  learn,
}) => {
  reviewCapacityValue(maxSessions);
  if (
    !bounded(idleMs, 24 * 60 * 60 * 1000) ||
    !bounded(deadlineMs, 300000) ||
    typeof autoCapture !== 'boolean' ||
    typeof learn !== 'boolean'
  ) {
    throw failure('form-options', 'Use finite form review limits.');
  }
};

const focusBrowser = async (record) => {
  if (
    record.browser.policy?.headless === true ||
    !record.browser.page?.bringToFront
  ) {
    throw failure(
      'form-focus-unavailable',
      'This browser cannot focus a review window.'
    );
  }
  await record.browser.page.bringToFront();
};

const captureReport = async (writer, record, action, result, proposed) => {
  if (record.learning?.detached && action !== 'observe') {
    await record.learning
      .capture(action, formReportSnapshot(result, proposed))
      .catch(() => {
        result.watcherJournal = {
          state: 'failed',
          code: 'form-watcher-journal',
        };
      });
  }
  if (record.journal.capture(action, result, proposed) && writer) {
    result.reportFile = await persistFormReport(
      writer,
      formReportSnapshot(result, proposed)
    );
  }
  return result;
};

const reviewHistory = async (record) => {
  const history = record.learning.detached
    ? await record.learning.history().catch(() => ({
        ...record.journal.read(),
        watcherJournal: { state: 'failed', code: 'form-watcher-journal' },
      }))
    : record.journal.read();
  return {
    ...history,
    monitoring: history.monitoring ?? record.monitor?.status(),
    answerLearning: history.answerLearning ?? record.learning?.status(),
  };
};

const attachLearningWatcher = async (record, store) => {
  if (record.learn && store?.logFile && record.browser.persistent) {
    const watcher = await startFormWatcher({
      directory: path.dirname(store.logFile),
      slot: record.slot,
      id: record.id,
      browser: record.browser.persistent,
      idleMs: record.idleMs,
    });
    await record.learning.stop();
    record.learning = watcher;
  }
};

const attachReviewObservation = async (record, owner, reportWriter) => {
  if (record.learning.detached) {
    record.activityTracking = true;
    record.monitor = {
      status: record.learning.monitoring,
      stop: async () => {},
    };
    return;
  }
  record.activityTracking = await trackReviewActivity(
    record.browser.page,
    record.id,
    () => owner.touch(record)
  );
  record.monitor = await createFormMonitor({
    page: record.browser.page,
    id: record.id,
    slot: record.slot,
    enabled: record.autoCapture || record.learn,
    capture: (report) => captureReport(reportWriter, record, 'observe', report),
    trace: record.browser.trace,
    observed: record.learn ? record.learning.observe : undefined,
    incomplete: (reason) => record.learning.incomplete(reason),
  });
  if (record.learn && record.monitor.status().state !== 'active') {
    record.learning.incomplete('capture-unavailable');
  }
};

const launchReviewBrowser = async ({
  record,
  openSession,
  store,
  input,
  owner,
  reportWriter,
  ready,
}) => {
  if (ready) {
    await ready;
    owner.check(record);
  }
  record.browser = await openSession({
    store,
    platform: 'forms-review',
    useCase: 'forms',
    slot: record.slot,
    headless: input.headless,
    persistent: record.learn && Boolean(store?.logFile),
    idleMs: record.idleMs,
    ...(store?.logFile
      ? {
          profileDir: path.join(
            path.dirname(store.logFile),
            'browser-profiles',
            'forms-review',
            record.slot
          ),
        }
      : {}),
  });
  owner.check(record);
  await attachLearningWatcher(record, store);
  record.browser.page?.once?.('close', () => {
    Promise.resolve()
      .then(() => owner.close(record.id))
      .catch(() => {});
  });
  await attachReviewObservation(record, owner, reportWriter);
  owner.check(record);
  if (record.learning.reused) {
    record.url = formUrl(record.browser.page.url());
  } else {
    await record.browser.commander.goto({
      url: record.url,
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  }
  owner.check(record);
  record.state = 'open';
  await rememberAssignmentRedirect(
    store,
    record.url,
    record.browser.page?.url?.()
  );
  owner.check(record);
};

const reviewLearning = ({
  record,
  now,
  timers,
  check,
  store,
  reportWriter,
  learning,
}) =>
  createFormLearning({
    ...learning,
    enabled: record.learn,
    now,
    timers,
    trace: (event) => record.browser?.trace?.(event),
    read: () =>
      record.cancelled || record.task
        ? null
        : inspectCurrentFormSession(record.browser, {
            check: () => check(record),
          }),
    save: async (pairs, options) => {
      const learned = await learnFormAnswerPairs(store, pairs, options);
      const result = await captureReport(reportWriter, record, 'learn', {
        state: 'learned-proposals',
        report: options.report,
        learning: {
          ...learned,
          kind: options.kind,
          pairs: pairs.map(({ question, text, evidence, url }) => ({
            question,
            text,
            evidence,
            url,
          })),
        },
      });
      return { ...learned, reportFile: result.reportFile };
    },
  });

const reviewAction =
  ({ operate, filling, reportWriter, get, check, challenge }, action) =>
  async (input, onWaiting) => {
    const result = await operate(input.id, async (record) => {
      const perform = async (name, options, arm = true) => {
        const proposed = record.reviewPlan?.proposed;
        const result = await captureReport(
          reportWriter,
          record,
          name === 'applyEmpty' ? 'apply' : name,
          await filling[name](record, options, () => check(record)),
          proposed
        );
        if (name === 'plan' && arm) {
          if (
            record.learning.detached ||
            record.monitor.status().state === 'active'
          ) {
            await record.learning.arm(result, record.reviewPlan?.options);
          } else {
            record.learning.incomplete('capture-unavailable');
          }
        }
        if (['apply', 'applyEmpty'].includes(name)) {
          await record.learning.applied(result);
        }
        return result;
      };
      if (action !== 'prefill') {
        return perform(action, input);
      }
      return captureReport(
        reportWriter,
        record,
        action,
        await prefillFormReview({
          record,
          input,
          perform,
          filling,
          check: () => check(record),
          onWaiting,
          challenge,
        })
      );
    });
    return globalThis.structuredClone({
      ...result,
      reviewSession: identity(get(input.id)),
    });
  };

/** Owned open browsers, separate from transient inspection and application slots. */
const newReviewRecord = ({
  input,
  url,
  slot,
  now,
  idleMs,
  autoCapture,
  learn,
  store,
}) => ({
  id: globalThis.crypto.randomUUID(),
  slot,
  url,
  title: '',
  state: 'opening',
  openedAt: now(),
  lastUsedAt: now(),
  idleMs,
  activityTracking: false,
  autoCapture: input.autoCapture ?? autoCapture,
  learn:
    (input.learn ?? learn) &&
    (input.autoCapture ?? autoCapture) &&
    Boolean(store),
  journal: createFormJournal(),
});

const checkCapacity = (records, slot, maxSessions) => {
  if ([...records.values()].some((record) => record.slot === slot)) {
    throw failure(
      'form-slot-in-use',
      'That review slot is already owned. Focus it or choose another slot.'
    );
  }
  if (records.size >= maxSessions) {
    throw failure(
      'form-session-limit',
      'Close a review session before opening another.'
    );
  }
};

const finishReviews = async (owner, capacity, method) => {
  const results = await Promise.allSettled([owner[method](), capacity.stop()]);
  for (const result of results) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  }
  return results[0].value;
};

const checkReviewOwner = (owner) => {
  if (owner.isStopping()) {
    throw failure('form-stopped', 'Form review is stopping.');
  }
};

const readReviewReport = async ({ record, filling, check, reportWriter }) => {
  await filling.clear(record);
  const report = await inspectCurrentFormSession(record.browser, {
    check: () => check(record),
  });
  record.title = report.title;
  return captureReport(reportWriter, record, 'read', {
    ...report,
    browserSlot: record.slot,
    policy: record.browser.policy ?? null,
  });
};

const reviewOperator =
  ({ get, check, touch, run }) =>
  async (id, operation) => {
    const record = get(id);
    check(record);
    if (record.task || record.closing || record.state !== 'open') {
      throw failure(
        'form-busy',
        'Another operation still owns this review session.'
      );
    }
    touch(record);
    record.task = run(record, async () => {
      await record.learning.pause?.(true);
      try {
        return await operation(record);
      } finally {
        await record.learning.pause?.(false);
      }
    });
    try {
      return await record.task;
    } finally {
      record.task = null;
    }
  };

export const createFormSessions = ({
  store,
  openSession = openBrowserSession,
  maxSessions = 4,
  idleMs = 24 * 60 * 60 * 1000,
  deadlineMs = 60000,
  now = () => Date.now(),
  timers = globalThis,
  prefill = {},
  reportWriter,
  autoCapture = true,
  learn = true,
  learning = {},
  modelRunner,
  ready,
  challenge = {},
} = {}) => {
  reviewLimits({ maxSessions, idleMs, deadlineMs, autoCapture, learn });
  const records = new Map();
  const capacity = createReviewCapacity({
    store,
    defaultLimit: maxSessions,
    count: () => records.size,
  });
  const owner = createReviewLifecycle({
    records,
    idleMs,
    deadlineMs,
    now,
    timers,
  });
  const { get, check, close, run, touch } = owner;
  const filling = createReviewedPrefill({
    store,
    now,
    modelRunner,
    ...prefill,
  });
  const open = async (input = {}) => {
    checkReviewOwner(owner);
    const { url, slot } = reviewInput(input);
    const record = await capacity.reserve((limit) => {
      checkReviewOwner(owner);
      checkCapacity(records, slot, limit);
      const record = newReviewRecord({
        input,
        url,
        slot,
        now,
        idleMs,
        autoCapture,
        learn,
        store,
      });
      record.learning = reviewLearning({
        record,
        now,
        timers,
        check,
        store,
        reportWriter,
        learning,
      });
      records.set(record.id, record);
      return record;
    });
    record.task = run(record, () =>
      launchReviewBrowser({
        record,
        openSession,
        store,
        input,
        owner,
        reportWriter,
        ready,
      })
    );
    try {
      await record.task;
    } catch (error) {
      // Ownership survives a failed close; the owner can explicitly retry it.
      if (records.has(record.id)) {
        await close(record.id);
      }
      throw error;
    } finally {
      record.task = null;
    }
    return { ok: true, session: identity(record) };
  };
  const operate = reviewOperator({ get, check, touch, run });
  const action = (name) =>
    reviewAction(
      {
        operate,
        filling,
        reportWriter,
        get,
        check,
        challenge: { now, timers, ...challenge },
      },
      name
    );
  const automatic = createPrefillControl({
    get,
    check,
    identity,
    action: action('prefill'),
  });
  return {
    open,
    close,
    stop: () => finishReviews(owner, capacity, 'stop'),
    detach: () => finishReviews(owner, capacity, 'detach'),
    capacity: capacity.read,
    configureCapacity: capacity.configure,
    list: () => ({
      ok: true,
      sessions: [...records.values()].map(identity),
      ...capacity.current(),
      idleMs,
    }),
    focus: async (id) => {
      const record = get(id);
      check(record);
      if (record.lastPrefill?.result.state === 'waiting-owner' && record.task) {
        await focusBrowser(record);
      } else {
        await operate(id, focusBrowser);
      }
      return { ok: true, session: identity(get(id)) };
    },
    plan: action('plan'),
    apply: action('apply'),
    prefill: automatic.run,
    prefillStatus: automatic.status,
    attach: action('attach'),
    disclose: action('disclose'),
    history: async (id) => ({
      ...(await operate(id, reviewHistory)),
      reviewSession: identity(get(id)),
    }),
    read: async (id) => {
      const report = await operate(id, (record) =>
        readReviewReport({ record, filling, check, reportWriter })
      );
      return { ...report, reviewSession: identity(get(id)) };
    },
  };
};
