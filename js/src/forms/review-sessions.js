import { createReviewLifecycle } from './review-lifecycle.js';
import { browserName } from '../browser/policy.js';
import { openBrowserSession } from '../cv/browser.js';
import { formFailure as failure, formUrl } from './options.js';
import { inspectCurrentFormSession } from './inspection.js';
import { trackReviewActivity } from './review-activity.js';
import { createReviewedPrefill } from './review-prefill.js';
import { createFormJournal, formReportSnapshot } from './review-journal.js';
import { persistFormReport } from './report-file.js';
import { createFormMonitor } from './review-monitor.js';
import { createFormLearning } from './review-learning.js';
import { learnFormAnswerPairs } from './answer-learning.js';

const bounded = (value, max) =>
  Number.isInteger(value) && value > 0 && value <= max;
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
    idleExpiresAt: new Date(record.lastUsedAt + record.idleMs).toISOString(),
    activityTracking: record.activityTracking,
    answerLearning: record.learning?.status(),
    monitoring: record.monitor?.status() ?? {
      state: 'unavailable',
      learning: false,
    },
    error: record.error ?? null,
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
  if (
    !bounded(maxSessions, 16) ||
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
  if (record.journal.capture(action, result, proposed) && writer) {
    result.reportFile = await persistFormReport(
      writer,
      formReportSnapshot(result, proposed)
    );
  }
  return result;
};

const launchReviewBrowser = async ({
  record,
  openSession,
  store,
  input,
  owner,
  reportWriter,
}) => {
  record.browser = await openSession({
    store,
    platform: 'forms-review',
    useCase: 'forms',
    slot: record.slot,
    headless: input.headless,
  });
  owner.check(record);
  record.browser.page?.once?.('close', () => {
    Promise.resolve()
      .then(() => owner.close(record.id))
      .catch(() => {});
  });
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
  owner.check(record);
  await record.browser.commander.goto({
    url: record.url,
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  owner.check(record);
  record.state = 'open';
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
  ({ operate, filling, reportWriter, get, check }, action) =>
  async (input) => {
    const result = await operate(input.id, async (record) => {
      const proposed = record.reviewPlan?.proposed;
      const result = await captureReport(
        reportWriter,
        record,
        action,
        await filling[action](record, input, () => check(record)),
        proposed
      );
      if (action === 'plan') {
        if (record.monitor.status().state === 'active') {
          record.learning.arm(result, record.reviewPlan?.options);
        } else {
          record.learning.incomplete('capture-unavailable');
        }
      }
      if (action === 'apply') {
        record.learning.applied(result);
      }
      return result;
    });
    return globalThis.structuredClone({
      ...result,
      reviewSession: identity(get(input.id)),
    });
  };

/** Owned open browsers, separate from transient inspection and application slots. */
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
} = {}) => {
  reviewLimits({ maxSessions, idleMs, deadlineMs, autoCapture, learn });
  const records = new Map();
  const owner = createReviewLifecycle({
    records,
    idleMs,
    deadlineMs,
    now,
    timers,
  });
  const { get, check, close, run, touch } = owner;
  const filling = createReviewedPrefill({ store, now, ...prefill });
  const open = async (input = {}) => {
    if (owner.isStopping()) {
      throw failure('form-stopped', 'Form review is stopping.');
    }
    const { url, slot } = reviewInput(input);
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
    const record = {
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
    };
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
    record.task = run(record, () =>
      launchReviewBrowser({
        record,
        openSession,
        store,
        input,
        owner,
        reportWriter,
      })
    );
    try {
      await record.task;
    } catch (error) {
      // Ownership survives a failed close; the owner can explicitly retry it.
      await close(record.id);
      throw error;
    } finally {
      record.task = null;
    }
    return { ok: true, session: identity(record) };
  };
  const operate = async (id, operation) => {
    const record = get(id);
    check(record);
    if (record.task || record.closing || record.state !== 'open') {
      throw failure(
        'form-busy',
        'Another operation still owns this review session.'
      );
    }
    touch(record);
    record.task = run(record, () => operation(record));
    try {
      return await record.task;
    } finally {
      record.task = null;
    }
  };
  const action = (name) =>
    reviewAction({ operate, filling, reportWriter, get, check }, name);
  return {
    open,
    close,
    stop: owner.stop,
    list: () => ({
      ok: true,
      sessions: [...records.values()].map(identity),
      maxSessions,
      idleMs,
    }),
    focus: async (id) => {
      await operate(id, focusBrowser);
      return { ok: true, session: identity(get(id)) };
    },
    plan: action('plan'),
    apply: action('apply'),
    attach: action('attach'),
    disclose: action('disclose'),
    history: async (id) => ({
      ...(await operate(id, (record) => record.journal.read())),
      monitoring: get(id).monitor?.status(),
      answerLearning: get(id).learning?.status(),
      reviewSession: identity(get(id)),
    }),
    read: async (id) => {
      const report = await operate(id, async (record) => {
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
      });
      return { ...report, reviewSession: identity(get(id)) };
    },
  };
};
