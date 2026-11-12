import { normalizeAnswerAction } from './question-answers.js';
import { normalizeAnswerEnvironment } from './question-context.js';
import { normalizeUnreadReviewSettings } from './question-browser-unread.js';
import { browserUnreadId, unreadFailure } from './question-unread-state.js';
import { normalizeUnreadPolling } from './question-unread-polling-state.js';
import { UnreadPollingCycle } from './question-unread-polling-cycle.js';

const kind = 'question-unread-polling';

/** Repeated checking is explicit; saved parent IDs only recover status. */
class UnreadPolling {
  constructor({ finite, store, clock, capabilities }) {
    Object.assign(this, { finite, store, clock, capabilities });
    this.runtimes = new Map();
    this.admitting = Promise.resolve();
    this.closed = false;
  }

  async save(runtime, patch = {}) {
    const record = {
      ...runtime.record,
      ...patch,
      updatedAt: this.clock().toISOString(),
    };
    await this.store.put(record);
    await this.store.flush?.();
    runtime.record = record;
  }

  async status(input) {
    const record =
      browserUnreadId(input?.id) && (await this.store.get(input.id));
    if (record?.kind !== kind) {
      return this.finite.status(input);
    }
    const { kind: _kind, tokens: _tokens, input: _input, ...result } = record;
    const owned = this.runtimes.has(record.id);
    result.polling = { ...record.polling, receiptPassId: null };
    for (const id of [
      record.polling.pendingPassId,
      record.polling.lastPassId,
    ].filter(Boolean)) {
      try {
        const child = await this.finite.status({ id });
        Object.assign(result, {
          entries: child.entries,
          coverage: child.coverage,
          restoration: child.restoration,
        });
        result.polling.receiptPassId = id;
        break;
      } catch (error) {
        if (
          error.code !== 'question-unread-missing' ||
          id !== record.polling.pendingPassId
        ) {
          throw error;
        }
      }
    }
    return globalThis.structuredClone({
      ...result,
      mode: 'browser-unread-review',
      owned,
      ...(!owned && record.state === 'active'
        ? {
            state: 'paused',
            polling: {
              ...result.polling,
              phase: 'settled',
              reason: 'owner-unavailable',
              nextAt: null,
            },
          }
        : {}),
    });
  }

  async admit(input) {
    if (this.closed) {
      throw unreadFailure(
        'question-unread-closed',
        'Unread controls are closing.'
      );
    }
    if (browserUnreadId(input?.id) && (await this.store.get(input.id))) {
      return this.status(input);
    }
    if (
      [...this.runtimes.values()].some(
        (runtime) => runtime.record.source === input.source
      )
    ) {
      throw unreadFailure(
        'question-unread-active',
        'Unread polling already owns this provider.'
      );
    }
    if (input.polling === undefined) {
      return this.finite.start(input);
    }
    if (!browserUnreadId(input.id) || input.confirm !== true) {
      throw unreadFailure(
        'confirm-required',
        'Confirm repeated unread checking and supply a new pass ID.'
      );
    }
    return this.open(input);
  }

  async open(input) {
    const settings = normalizeUnreadReviewSettings(input, this.capabilities());
    const polling = normalizeUnreadPolling(input.polling);
    const options = {
      ...normalizeAnswerAction(input),
      ...normalizeAnswerEnvironment(input),
      source: input.source,
      ...settings,
      confirm: true,
      modelDraft: false,
      ...(input.noticeReplies ? { noticeReplies: true } : {}),
    };
    const runtime = {
      controller: new AbortController(),
      input: options,
      record: {
        id: input.id,
        kind,
        tokens: [kind, input.source],
        source: input.source,
        input: options,
        settings,
        state: 'active',
        startedAt: this.clock().toISOString(),
        ...(input.noticeReplies ? { noticeReplies: true } : {}),
        entries: [],
        coverage: null,
        restoration: null,
        polling: {
          settings: polling,
          phase: 'starting',
          passes: 0,
          failures: 0,
          lastPassId: null,
          pendingPassId: null,
          nextAt: null,
          expiresAt: new Date(
            this.clock().getTime() + polling.durationMs
          ).toISOString(),
        },
      },
    };
    await this.save(runtime);
    this.runtimes.set(input.id, runtime);
    const cycle = new UnreadPollingCycle({
      finite: this.finite,
      clock: this.clock,
      runtime,
      save: (patch) => this.save(runtime, patch),
    });
    runtime.work = cycle.run().finally(() => this.runtimes.delete(input.id));
    runtime.work.catch(() => {});
    return this.status(input);
  }

  start(input = {}) {
    const work = this.admitting.then(() => this.admit(input));
    this.admitting = work.catch(() => {});
    return work;
  }

  async stop(input) {
    await this.admitting;
    const runtime = this.runtimes.get(input?.id);
    if (runtime) {
      runtime.reason = 'owner-stopped';
      runtime.controller.abort();
      await runtime.work;
      return this.status(input);
    }
    const record =
      browserUnreadId(input?.id) && (await this.store.get(input.id));
    return record?.kind === kind ? this.status(input) : this.finite.stop(input);
  }

  async close() {
    this.closed = true;
    await this.admitting;
    const results = await Promise.allSettled(
      [...this.runtimes.keys()].map((id) => this.stop({ id }))
    );
    await this.finite.close();
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      throw failed.reason;
    }
  }
}

export const withQuestionUnreadPolling = (options) => {
  const service = new UnreadPolling(options);
  return Object.fromEntries(
    ['start', 'status', 'stop', 'close'].map((name) => [
      name,
      service[name].bind(service),
    ])
  );
};
