import { inspectCurrentFormSession } from './inspection.js';
import { createFormMonitor } from './review-monitor.js';
import { createFormLearning } from './review-learning.js';
import { createWatcherJournal } from './watcher-journal.js';
import { saveWatchedFormAnswers } from './watch-store.js';
import { trackReviewActivity } from './review-activity.js';

export const createWatcherCore = async ({
  session,
  config,
  finished,
  stableMs = 60000,
}) => {
  const journal = createWatcherJournal(config.watchDirectory);
  let paused = false;
  let stopped = false;
  let idleTimer;
  let idleExpiresAt;
  const touch = () => {
    globalThis.clearTimeout(idleTimer);
    idleExpiresAt = new Date(Date.now() + config.idleMs).toISOString();
    idleTimer = globalThis.setTimeout(
      () => finished('idle-expired'),
      config.idleMs
    );
  };
  const read = () =>
    stopped || paused ? null : inspectCurrentFormSession(session);
  const learning = createFormLearning({
    stableMs,
    read,
    save: async (pairs, options) => {
      const learned = await saveWatchedFormAnswers(
        config.storeDirectory,
        pairs,
        options
      );
      const result = {
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
      };
      await journal.learned(result);
      return {
        ...learned,
        ...(journal.error()
          ? { reportFile: { state: 'failed', code: journal.error() } }
          : {}),
      };
    },
  });
  let monitor;
  try {
    monitor = await createFormMonitor({
      page: session.page,
      id: config.id,
      slot: config.slot,
      capture: async (report) => {
        journal.capture('observe', report);
      },
      observed: learning.observe,
      incomplete: (reason) => learning.incomplete(reason),
      initializeCurrent: true,
    });
    if (monitor.status().state !== 'active') {
      throw new Error('Form watcher capture is unavailable.');
    }
    await trackReviewActivity(session.page, `watcher${config.id}`, touch, {
      initializeCurrent: true,
    });
    touch();
  } catch (error) {
    globalThis.clearTimeout(idleTimer);
    await learning.stop();
    await monitor?.stop();
    await journal.stop().catch(() => {});
    throw error;
  }
  const status = () => ({
    answerLearning: { ...learning.status(), lifetime: 'detached' },
    monitoring: monitor.status(),
    watcher: {
      state: stopped ? 'stopped' : 'active',
      pid: process.pid,
      idleExpiresAt,
      reportError: journal.error(),
    },
  });
  return {
    status,
    async dispatch(operation, value) {
      if (stopped) {
        throw new Error('Form watcher has stopped.');
      }
      if (operation === 'status') {
        return status();
      }
      if (operation === 'history') {
        return { ...status(), ...journal.read() };
      }
      touch();
      if (operation === 'arm') {
        learning.arm(value.report, value.options);
      } else if (operation === 'applied') {
        learning.applied(value);
      } else if (operation === 'checkpoint') {
        if (
          !['read', 'plan', 'apply', 'disclose', 'attach'].includes(
            value?.action
          ) ||
          !Array.isArray(value.report?.fields) ||
          value.report.fields.length > 200
        ) {
          throw new Error('Invalid form watcher checkpoint.');
        }
        journal.capture(value.action, value.report);
      } else if (operation === 'pause') {
        paused = value === true;
        await learning.pause(paused);
      } else {
        throw new Error('Unknown form watcher operation.');
      }
      return status();
    },
    async stop() {
      stopped = true;
      globalThis.clearTimeout(idleTimer);
      await learning.stop();
      await monitor.stop();
      await journal.stop();
    },
  };
};
