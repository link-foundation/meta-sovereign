import { isSyncDeleted } from '../storage/sync-deletions.js';
import { syncWire } from './wire.js';
import {
  reconciliationSource,
  privateSyncId,
  scanReconciliation,
} from './reconcile-records.js';

const controlTypes = new Set([
  'sync-pull',
  'sync-record',
  'sync-finish',
  'sync-ack',
  'sync-abort',
]);
const validId = (id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);
const randomId = () => globalThis.crypto.randomUUID();
const failure = (message, code = 'SYNC_RECONCILE_INVALID') =>
  Object.assign(new Error(message), { code });

// A connection can fan out to many sockets. Every control packet is addressed
// to one negotiated connection session; unrelated recipients ignore it. One
// record per remote awaits durable admission acknowledgement. No archive-sized
// query, replay queue or per-record inventory is retained.
class Reconciliation {
  constructor({ source, schema, send, receive, report, onState, options }) {
    this.source = source;
    this.schema = schema;
    this.sendRaw = send;
    this.receiveMutation = receive;
    this.report = report;
    this.onState = onState;
    this.session = randomId();
    this.states = new Map();
    this.completed = new Set();
    this.closed = false;
    this.wire = syncWire();
    this.maxSessions = options.maxSessions ?? 16;
    this.timeoutMs = options.timeoutMs ?? 30000;
    if (
      !Number.isSafeInteger(this.maxSessions) ||
      this.maxSessions < 1 ||
      this.maxSessions > 128 ||
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 300000
    ) {
      throw failure('Invalid reconciliation limits');
    }
  }

  hello(to) {
    return {
      type: 'hello',
      schema: this.schema,
      session: this.session,
      reconcile: 1,
      ...(to ? { to } : {}),
    };
  }

  addressed(event) {
    return event?.to === undefined || event.to === this.session;
  }

  handles(event) {
    return event?.type === 'hello' || controlTypes.has(event?.type);
  }

  touch(state) {
    globalThis.clearTimeout(state.timer);
    state.timer = globalThis.setTimeout(
      () =>
        this.fail(
          state,
          failure('Reconciliation made no progress', 'SYNC_RECONCILE_TIMEOUT')
        ),
      this.timeoutMs
    );
    state.timer.unref?.();
  }

  send(state, packet) {
    if (state.closed) {
      return;
    }
    try {
      const event = {
        ...packet,
        schema: this.schema,
        from: this.session,
        to: state.remote,
      };
      this.wire.encode(event); // Bound control frames even on custom transports.
      Promise.resolve(this.sendRaw(event)).catch((error) =>
        this.fail(state, error)
      );
    } catch (error) {
      this.fail(state, error);
    }
  }

  retire(state) {
    state.closed = true;
    globalThis.clearTimeout(state.timer);
    this.states.delete(state.remote);
    this.completed.add(state.remote);
    if (this.completed.size > 256) {
      this.completed.delete(this.completed.values().next().value);
    }
  }

  fail(state, error, report = true, notify = true) {
    if (state.closed) {
      return;
    }
    if (notify) {
      // Notify the opposite scan without replaying data or exposing payloads.
      try {
        Promise.resolve(
          this.sendRaw({
            type: 'sync-abort',
            schema: this.schema,
            from: this.session,
            to: state.remote,
          })
        ).catch(() => {});
      } catch {
        // The original failure remains the diagnostic.
      }
    }
    this.retire(state);
    state.tx?.waiting?.reject(error);
    if (report) {
      this.report(error);
      this.onState({ phase: 'reconcile-failed' });
    }
  }

  finish(state) {
    if (state.rx.done && state.tx?.done) {
      this.retire(state);
      this.onState({
        phase: 'reconcile-complete',
        received: state.rx.sequence - 1,
        sent: state.tx.sequence - 1,
      });
    }
  }

  async acceptHello(event) {
    if (
      event.reconcile !== 1 ||
      !validId(event.session) ||
      event.session === this.session ||
      this.completed.has(event.session)
    ) {
      return;
    }
    let state = this.states.get(event.session);
    if (!state) {
      if (this.states.size >= this.maxSessions) {
        throw failure(
          'Too many reconciliation sessions',
          'SYNC_RECONCILE_FULL'
        );
      }
      state = {
        remote: event.session,
        rx: { request: randomId(), sequence: 0, done: false, busy: false },
      };
      this.states.set(state.remote, state);
      this.touch(state);
      this.onState({ phase: 'reconcile-start' });
    }
    // Directed hello replies let a later client discover a shared hub whose
    // initial broadcast hello was already consumed by the first connection.
    if (event.to === undefined) {
      this.send(state, this.hello(state.remote));
    }
    if (!state.requested) {
      state.requested = true;
      this.send(state, { type: 'sync-pull', request: state.rx.request });
    }
  }

  async acknowledged(state, packet) {
    const waiting = Promise.withResolvers();
    waiting.promise.catch(() => {});
    state.tx.waiting = { ...waiting, sequence: state.tx.sequence };
    this.send(state, {
      ...packet,
      request: state.tx.request,
      sequence: state.tx.sequence,
    });
    await waiting.promise;
    state.tx.waiting = null;
    state.tx.sequence++;
  }

  async stream(state) {
    try {
      await scanReconciliation(
        this.source,
        (link) =>
          this.acknowledged(state, {
            type: 'sync-record',
            mutation: { type: isSyncDeleted(link) ? 'delete' : 'put', link },
          }),
        () => state.closed
      );
      if (!state.closed) {
        await this.acknowledged(state, { type: 'sync-finish' });
        state.tx.done = true;
        this.finish(state);
      }
    } catch (error) {
      this.fail(state, error);
    }
  }

  pull(state, event) {
    if (!validId(event.request)) {
      throw failure('Invalid reconciliation request');
    }
    if (!state.tx) {
      state.tx = { request: event.request, sequence: 0, done: false };
      void this.stream(state);
    } else if (state.tx.request !== event.request) {
      throw failure('A reconciliation scan is already active');
    }
  }

  ack(state, event) {
    const tx = state.tx;
    if (
      tx?.request === event.request &&
      tx.waiting?.sequence === event.sequence
    ) {
      this.touch(state);
      tx.waiting.resolve();
    }
  }

  async admit(event) {
    const mutation = event.mutation;
    if (
      !['put', 'delete'].includes(mutation?.type) ||
      typeof mutation.link?.id !== 'string' ||
      privateSyncId(mutation.link.id) ||
      (mutation.type === 'delete') !== isSyncDeleted(mutation.link)
    ) {
      throw failure('Invalid reconciliation record');
    }
    this.wire.encode(event);
    await this.receiveMutation(mutation);
  }

  async record(state, event) {
    const rx = state.rx;
    if (rx.request !== event.request || rx.done || rx.busy) {
      return;
    }
    if (
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 0 ||
      event.sequence > rx.sequence
    ) {
      throw failure('Invalid reconciliation sequence');
    }
    if (event.sequence === rx.sequence) {
      rx.busy = true;
      try {
        if (event.type === 'sync-record') {
          await this.admit(event);
        } else {
          rx.done = true;
        }
        if (state.closed) {
          return;
        }
        rx.sequence++;
      } finally {
        rx.busy = false;
      }
    }
    this.touch(state);
    this.send(state, {
      type: 'sync-ack',
      request: rx.request,
      sequence: event.sequence,
    });
    this.finish(state);
  }

  async receive(event) {
    if (this.closed || !this.addressed(event)) {
      return;
    }
    if (event.type === 'hello') {
      await this.acceptHello(event);
      return;
    }
    if (event.to !== this.session || !validId(event.from)) {
      throw failure('Reconciliation requires an addressed session');
    }
    const state = this.states.get(event.from);
    if (!state || state.closed) {
      return;
    }
    try {
      if (event.type === 'sync-pull') {
        this.pull(state, event);
      } else if (event.type === 'sync-ack') {
        this.ack(state, event);
      } else if (event.type === 'sync-abort') {
        this.fail(
          state,
          failure(
            'Remote reconciliation was aborted',
            'SYNC_RECONCILE_ABORTED'
          ),
          true,
          false
        );
      } else {
        await this.record(state, event);
      }
    } catch (error) {
      this.fail(state, error);
    }
  }

  close() {
    this.closed = true;
    for (const state of this.states.values()) {
      this.fail(
        state,
        failure('Reconciliation disconnected', 'SYNC_RECONCILE_CANCELLED'),
        false
      );
    }
    this.completed.clear();
  }
}

export const createReconciliation = ({ store, ...options }) => {
  const source = reconciliationSource(store);
  return source
    ? new Reconciliation({
        ...options,
        source,
        receive: async (event) => {
          await options.receive(event);
          // Text log admission precedes group fsync. ACK means the destination's
          // persistence barrier completed, including browser snapshot saves.
          await store.flush?.();
        },
      })
    : null;
};
