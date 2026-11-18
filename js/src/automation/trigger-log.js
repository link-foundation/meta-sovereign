import { redactLogValue } from '../server/log-value.js';

/** Observe a trigger; diagnostic failures never change its delivery outcome. */
export const traceTrigger = async (log, trigger, work) => {
  const started = globalThis.performance.now();
  const emit = (entry) => {
    try {
      log({ trigger, ...entry });
    } catch {
      // Logging cannot retry or cancel a provider operation.
    }
  };
  emit({ level: 'debug', event: 'trigger_check' });
  try {
    const result = await work();
    emit({
      level: 'debug',
      event: 'trigger_finished',
      durationMs: Math.max(0, globalThis.performance.now() - started),
      skipped: result?.skipped ?? null,
    });
    return result;
  } catch (error) {
    emit({
      level: 'error',
      event: 'trigger_failed',
      durationMs: Math.max(0, globalThis.performance.now() - started),
      // Pass a bounded plain summary to custom sinks too. Raw Error inspection
      // can expose an unredacted provider cause even when its message is safe.
      error: redactLogValue(error),
    });
    throw error;
  }
};
