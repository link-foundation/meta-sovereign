import { createReviewLifecycle } from './review-lifecycle.js';
import { browserName } from '../browser/policy.js';
import { openBrowserSession } from '../cv/browser.js';
import { formFailure as failure, formUrl } from './options.js';
import { inspectCurrentFormSession } from './inspection.js';
import { trackReviewActivity } from './review-activity.js';
import { createReviewedPrefill } from './review-prefill.js';

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
    error: record.error ?? null,
  };
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

const launchReviewBrowser = async ({
  record,
  openSession,
  store,
  input,
  owner,
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
  owner.check(record);
  await record.browser.commander.goto({
    url: record.url,
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  owner.check(record);
  record.state = 'open';
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
} = {}) => {
  if (
    !bounded(maxSessions, 16) ||
    !bounded(idleMs, 24 * 60 * 60 * 1000) ||
    !bounded(deadlineMs, 300000)
  ) {
    throw failure('form-options', 'Use finite form review limits.');
  }
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
    const url = formUrl(input.url);
    const slot = browserName(input.browserSlot ?? 'form-1');
    if (input.headless !== undefined && typeof input.headless !== 'boolean') {
      throw failure('form-options', 'headless must be a boolean.');
    }
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
    };
    records.set(record.id, record);
    record.task = run(record, () =>
      launchReviewBrowser({ record, openSession, store, input, owner })
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
    plan: async (input) => {
      const result = await operate(input.id, (record) =>
        filling.plan(record, input, () => check(record))
      );
      return globalThis.structuredClone({
        ...result,
        reviewSession: identity(get(input.id)),
      });
    },
    apply: async (input) => {
      const result = await operate(input.id, (record) =>
        filling.apply(record, input, () => check(record))
      );
      return globalThis.structuredClone({
        ...result,
        reviewSession: identity(get(input.id)),
      });
    },
    disclose: async (input) => {
      const result = await operate(input.id, (record) =>
        filling.disclose(record, input, () => check(record))
      );
      return globalThis.structuredClone({
        ...result,
        reviewSession: identity(get(input.id)),
      });
    },
    read: async (id) => {
      const report = await operate(id, async (record) => {
        await filling.clear(record);
        const report = await inspectCurrentFormSession(record.browser, {
          check: () => check(record),
        });
        record.title = report.title;
        return {
          ...report,
          browserSlot: record.slot,
          policy: record.browser.policy ?? null,
        };
      });
      return { ...report, reviewSession: identity(get(id)) };
    },
  };
};
