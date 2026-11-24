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
    this.skipped = new Map();
    this.checked = new Set();
  }

  async sleep(ms, wake) {
    const stop = this.runtime.controller.signal;
    const signal = wake
      ? globalThis.AbortSignal.any([stop, wake.signal])
      : stop;
    try {
      await this.pause(ms, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) {
        throw error;
      }
    }
  }

  settleSkip(child) {
    const { skip } = this.runtime;
    if (
      !skip ||
      child.state !== 'completed' ||
      !child.restoration?.restored ||
      !child.entries.some(
        ({ chat, answer }) =>
          chat === skip.target.chat &&
          answer?.questionId === skip.target.questionId &&
          answer.phase === 'skipped'
      )
    ) {
      return null;
    }
    return skip.target;
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
    const refreshVersion = runtime.refreshVersion;
    const heldAtStart = runtime.input.heldChat;
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
      const watch = runtime.input.watchWaiting
        ? {
            skipped: this.skipped,
            checked: this.checked,
            skip: runtime.skip?.target,
          }
        : undefined;
      child = await this.finite.start({ ...runtime.input, id }, { watch });
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
    let skipped;
    let phase;
    try {
      child = await this.collect(child);
      skipped = !runtime.controller.signal.aborted && this.settleSkip(child);
      if (runtime.input.answerChats) {
        const held = child.restoration?.heldReview;
        if (held) {
          runtime.input.heldChat = held.chat;
        } else if (child.state === 'completed' && child.restoration?.restored) {
          delete runtime.input.heldChat;
        }
      }
      await this.save({
        entries: child.entries,
        coverage: child.coverage,
        restoration: child.restoration,
        polling: {
          ...runtime.record.polling,
          lastPassId: id,
          pendingPassId: null,
          passes: runtime.record.polling.passes + 1,
          ...(skipped ? { lastSkip: skipped } : {}),
        },
      });
      phase = await this.outcome(child);
      this.recordRefresh(child, phase, { refreshVersion, heldAtStart });
    } finally {
      // An unexpected storage/status failure must still drain issued work.
      await this.finite.stop({ id });
      runtime.childId = null;
    }
    if (skipped) {
      this.skipped.set(skipped.chat, skipped.questionId);
      runtime.skip.resolve(true);
    }
    if (runtime.input.watchWaiting && phase === 'waiting') {
      // Revisit handled chats after new candidates, in least-recently visited order.
      for (const { chat } of child.entries) {
        if (chat !== runtime.input.heldChat) {
          this.checked.delete(chat);
          this.checked.add(chat);
        }
      }
      while (this.checked.size > 5000) {
        this.checked.delete(this.checked.values().next().value);
      }
    }
    return phase;
  }

  recordRefresh(child, phase, { refreshVersion, heldAtStart }) {
    if (
      refreshVersion &&
      !heldAtStart &&
      phase === 'waiting' &&
      child.restoration?.restored
    ) {
      // Only a restored list pass begun after delivery can settle its refresh.
      this.runtime.reviewedVersion = refreshVersion;
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

  async waitForNextPass(phase, { refreshVersion, heldAtStart }) {
    const { runtime } = this;
    const { settings, failures } = runtime.record.polling;
    const ms =
      phase === 'backoff'
        ? Math.min(
            settings.retryMaxMs,
            settings.intervalMs * 2 ** (failures - 1)
          )
        : settings.intervalMs;
    await this.save({
      polling: {
        ...runtime.record.polling,
        nextAt: new Date(this.clock().getTime() + ms).toISOString(),
      },
    });
    const wake = runtime.input.watchWaiting ? new AbortController() : null;
    runtime.wake = wake;
    if (
      phase === 'waiting' &&
      (runtime.refreshVersion !== refreshVersion ||
        (heldAtStart &&
          !runtime.input.heldChat &&
          runtime.refreshVersion > (runtime.reviewedVersion ?? 0)))
    ) {
      wake?.abort();
    }
    try {
      await this.sleep(ms, wake);
    } finally {
      runtime.wake = null;
    }
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
        const refreshVersion = runtime.refreshVersion;
        const heldAtStart = runtime.input.heldChat;
        let phase;
        try {
          phase = await this.visit();
        } finally {
          runtime.skip?.resolve(false);
          runtime.skip = null;
        }
        if (
          runtime.controller.signal.aborted ||
          runtime.record.state !== 'active'
        ) {
          break;
        }
        await this.waitForNextPass(phase, { refreshVersion, heldAtStart });
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
      runtime.skip?.resolve(false);
      globalThis.clearTimeout(expiry);
    }
  }
}
