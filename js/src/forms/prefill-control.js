import { recoverPrefill } from './automatic-prefill.js';
import { pendingPrefill } from './challenge-wait.js';
import { formFailure as failure } from './options.js';

/** A waiting receipt is a snapshot. Only the original task may keep filling. */
export const createPrefillControl = ({ get, check, identity, action }) => {
  const snapshot = (record, result) =>
    globalThis.structuredClone({ ...result, reviewSession: identity(record) });
  return {
    status: ({ id, requestId }) => {
      const record = get(id);
      check(record);
      const result = record.lastPrefill?.result;
      if (!requestId || result?.requestId !== requestId) {
        throw failure(
          'form-prefill-missing',
          'This request is not recoverable.'
        );
      }
      try {
        record.browser?.trace?.({
          event: 'form-prefill-status',
          state: result.state,
          ok: result.ok,
          complete: result.complete,
          busy: Boolean(record.task),
          receipts: result.receipts.length,
          uploads: result.uploads.length,
        });
      } catch {
        // Optional status-shape diagnostics must never affect recovery.
      }
      return snapshot(record, result);
    },
    run: async (input) => {
      const record = get(input.id);
      check(record);
      if (record.task && pendingPrefill(record.lastPrefill?.result)) {
        const cached = recoverPrefill(record, input);
        if (cached) {
          return snapshot(record, cached);
        }
      }
      let waiting;
      const firstWait = new Promise((resolve) => {
        waiting = resolve;
      });
      // Attach both branches immediately; cleanup/cancellation remains owned by
      // record.task even after the initial response returns to its caller.
      const completion = action(input, (result) =>
        waiting(snapshot(record, result))
      );
      return Promise.race([completion, firstWait]);
    },
  };
};
