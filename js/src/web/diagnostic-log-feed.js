import { isDiagnosticBatch } from '../transport/diagnostic-batch.js';

/** One owned read at a time; hiding the view aborts its request and timer. */
export const followDiagnosticLogs = ({
  read,
  update,
  fail,
  intervalMs = 2000,
  clock = globalThis,
}) => {
  const controller = new AbortController();
  let timer;
  let failures = 0;
  let snapshot = { session: null, cursor: 0, items: [], gap: false };
  const tick = async () => {
    try {
      const answer = await read(snapshot, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      if (!isDiagnosticBatch(answer)) {
        throw new Error('diagnostics unavailable');
      }
      const reset = snapshot.session !== answer.session;
      const items = [...(reset ? [] : snapshot.items), ...answer.items];
      const unique = [
        ...new Map(items.map((item) => [item.id, item])).values(),
      ];
      snapshot = {
        session: answer.session,
        cursor: answer.cursor,
        items: unique.slice(-300),
        gap: answer.dropped || (!reset && snapshot.gap),
      };
      failures = 0;
      update(snapshot);
    } catch {
      if (!controller.signal.aborted) {
        failures++;
        fail();
      }
    }
    if (!controller.signal.aborted) {
      timer = clock.setTimeout(
        tick,
        Math.min(30000, intervalMs * 2 ** Math.max(0, failures - 1))
      );
    }
  };
  void tick();
  return () => {
    controller.abort();
    clock.clearTimeout(timer);
  };
};
