import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { boundedBrowserText } from './question-browser-state.js';
import { unreadPollingOutcome } from './question-unread-polling-state.js';

const codeOf = (error) =>
  boundedBrowserText(error?.code, 120)
    ? error.code
    : 'question-unread-polling-failed';

/** One owner awaits each finite child; cancellation never abandons that child. */
export class UnreadPollingCycle {
  constructor({ finite, clock, save, runtime, pause = delay }) {
    Object.assign(this, { finite, clock, save, runtime, pause });
  }

  async sleep(ms) {
    try {
      await this.pause(ms, undefined, {
        signal: this.runtime.controller.signal,
      });
    } catch (error) {
      if (!this.runtime.controller.signal.aborted) {
        throw error;
      }
    }
  }

  async collect(child) {
    while (child.state === 'active') {
      if (this.runtime.controller.signal.aborted) {
        return this.finite.stop({ id: child.id });
      }
      await this.sleep(50);
      child = await this.finite.status({ id: child.id });
    }
    return child;
  }

  async visit() {
    const { runtime } = this;
    const id = `question-unread:${randomUUID()}`;
    await this.save({
      polling: {
        ...runtime.record.polling,
        phase: 'visiting',
        pendingPassId: id,
        nextAt: null,
      },
    });
    let child;
    try {
      child = await this.finite.start({ ...runtime.input, id });
    } catch (error) {
      if (error.code === 'question-unread-active') {
        return this.outcome(
          { state: 'failed', code: error.code, entries: [] },
          true
        );
      }
      // A failed response may follow admission. Recover and drain its saved ID.
      try {
        child = await this.finite.stop({ id });
      } catch (recovery) {
        if (recovery.code !== 'question-unread-missing') {
          throw recovery;
        }
        return this.outcome(
          { state: 'failed', code: codeOf(error), entries: [] },
          true
        );
      }
    }
    runtime.childId = id;
    try {
      child = await this.collect(child);
      await this.save({
        entries: child.entries,
        coverage: child.coverage,
        restoration: child.restoration,
        polling: {
          ...runtime.record.polling,
          lastPassId: id,
          pendingPassId: null,
          passes: runtime.record.polling.passes + 1,
        },
      });
      return this.outcome(child);
    } finally {
      // An unexpected storage/status failure must still drain issued work.
      await this.finite.stop({ id });
      runtime.childId = null;
    }
  }

  async outcome(child, unissued = false) {
    const { runtime } = this;
    const phase = unreadPollingOutcome(child, unissued);
    const failures =
      phase === 'backoff' ? runtime.record.polling.failures + 1 : 0;
    const exhausted = failures >= runtime.record.polling.settings.maxFailures;
    await this.save({
      ...(phase === 'settled' || exhausted ? { state: 'paused' } : {}),
      polling: {
        ...runtime.record.polling,
        phase: exhausted ? 'settled' : phase,
        pendingPassId: null,
        failures,
        reason: child.code ?? child.state,
      },
    });
    return phase;
  }

  async run() {
    const { runtime } = this;
    const { settings } = runtime.record.polling;
    const expiry = globalThis.setTimeout(() => {
      runtime.reason = 'expired';
      runtime.controller.abort();
    }, settings.durationMs);
    try {
      while (
        !runtime.controller.signal.aborted &&
        runtime.record.state === 'active'
      ) {
        if (
          this.clock().getTime() >= Date.parse(runtime.record.polling.expiresAt)
        ) {
          runtime.reason = 'expired';
          runtime.controller.abort();
          break;
        }
        const phase = await this.visit();
        if (
          runtime.controller.signal.aborted ||
          runtime.record.state !== 'active'
        ) {
          break;
        }
        const ms =
          phase === 'backoff'
            ? Math.min(
                settings.retryMaxMs,
                settings.intervalMs * 2 ** (runtime.record.polling.failures - 1)
              )
            : settings.intervalMs;
        await this.save({
          polling: {
            ...runtime.record.polling,
            nextAt: new Date(this.clock().getTime() + ms).toISOString(),
          },
        });
        await this.sleep(ms);
      }
      if (runtime.controller.signal.aborted) {
        await this.save({
          state: 'stopped',
          polling: {
            ...runtime.record.polling,
            phase: 'settled',
            nextAt: null,
            pendingPassId: null,
            reason: runtime.reason,
          },
        });
      }
    } catch (error) {
      await this.save({
        state: 'paused',
        polling: {
          ...runtime.record.polling,
          phase: 'settled',
          nextAt: null,
          reason: codeOf(error),
        },
      });
    } finally {
      globalThis.clearTimeout(expiry);
    }
  }
}
