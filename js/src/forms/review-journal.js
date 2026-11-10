const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

export const formReportSnapshot = (result, proposed) => {
  const report = result.fields ? result : (result.report ?? proposed);
  if (!report?.fields) {
    return null;
  }
  const { reviewSession: _session, reviewPlan: _plan, ...snapshot } = report;
  return {
    ...snapshot,
    fields: snapshot.fields.map((field) => {
      const prior = proposed?.fields.find((item) => item.id === field.id);
      return prior &&
        ['label', 'type', 'nativeId', 'frame'].every(
          (key) => prior[key] === field[key]
        )
        ? { ...field, plannedAnswer: prior.answer }
        : field;
    }),
    ...(!result.fields
      ? {
          observation: result.report
            ? 'returned-snapshot'
            : 'last-reviewed-snapshot',
          outcome: {
            state: result.state,
            code: result.code,
            planId: result.planId,
            receipts: result.receipts,
            fieldId: result.fieldId,
            file: result.file,
            learning: result.learning,
          },
        }
      : {}),
  };
};

/** Public snapshots only: no browser handles, fill authority or attachment bytes. */
export const createFormJournal = ({
  maxCheckpoints = 32,
  maxBytes = 4 * 1024 ** 2,
} = {}) => {
  if (
    !Number.isInteger(maxCheckpoints) ||
    maxCheckpoints < 1 ||
    maxCheckpoints > 100 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1024 ||
    maxBytes > 8 * 1024 ** 2
  ) {
    throw new Error('Use finite form journal limits.');
  }
  const checkpoints = [];
  const seen = new WeakSet();
  let sequence = 0;
  let omitted = 0;
  let size = 0;
  return {
    capture(action, result, proposed) {
      if (seen.has(result)) {
        return false;
      }
      seen.add(result);
      const snapshot = formReportSnapshot(result, proposed);
      if (!snapshot) {
        return false;
      }
      const entry = globalThis.structuredClone({
        sequence: ++sequence,
        action,
        capturedAt: new Date().toISOString(),
        report: snapshot,
      });
      const length = bytes(entry);
      if (length > maxBytes) {
        omitted++;
        return true;
      }
      while (checkpoints.length >= maxCheckpoints || size + length > maxBytes) {
        size -= checkpoints.shift().bytes;
        omitted++;
      }
      checkpoints.push({ entry, bytes: length });
      size += length;
      return true;
    },
    read() {
      return globalThis.structuredClone({
        ok: true,
        version: 1,
        mode: 'review-journal',
        capturedAt: new Date().toISOString(),
        scope: 'captured-checkpoints',
        coverage: omitted ? 'partial' : 'captured',
        omittedCheckpoints: omitted,
        maxCheckpoints,
        maxBytes,
        checkpoints: checkpoints.map(({ entry }) => entry),
      });
    },
  };
};
