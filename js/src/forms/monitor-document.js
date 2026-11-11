/** Passive per-document capture. Serialized with the shared bounded reader. */
export const observeFormDocument = (read, binding, learning) => {
  const doc = globalThis.document;
  const evidence = learning?.();
  let timer;
  let pending = false;
  let latest;
  let last;
  const deliver = async (snapshot, urgent = false) => {
    if (urgent && pending) {
      latest = null;
      try {
        await globalThis[binding](snapshot);
      } catch {
        // The bounded host queue owns a callback once it has been sent.
      }
      return;
    }
    if (pending) {
      latest = snapshot;
      return;
    }
    pending = true;
    try {
      await globalThis[binding](snapshot);
    } catch {
      // Navigation may destroy this document before the acknowledgement.
    } finally {
      pending = false;
      const next = latest;
      latest = null;
      if (next) {
        deliver(next);
      }
    }
  };
  const capture = (urgent = false) => {
    globalThis.clearTimeout(timer);
    try {
      const snapshot = read({ maxFields: 200, maxOptions: 100 });
      if (evidence && !snapshot.challenge?.active) {
        snapshot.learning = evidence.read(snapshot);
      }
      // Observation time changes on every read; only content and new evidence
      // should create another checkpoint.
      const key = JSON.stringify(snapshot, (name, value) =>
        name === 'at' ? undefined : value
      );
      const identity = key.length > 2 * 1024 ** 2 ? 'oversized' : key;
      if (identity === last) {
        if (urgent && latest) {
          deliver(latest, true);
        }
        return;
      }
      last = identity;
      deliver(
        identity === 'oversized'
          ? { omission: 'capture-size-limit' }
          : snapshot,
        urgent
      );
    } catch {
      // A torn-down document has no trustworthy snapshot to report.
    }
  };
  const schedule = () => {
    globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(capture, 250);
  };
  for (const name of ['input', 'change']) {
    doc.addEventListener(name, schedule, { capture: true, passive: true });
  }
  // Read before a click handler can remove this page's questions. No click is
  // synthesized, prevented or interpreted as a successful submission.
  doc.addEventListener('click', () => capture(true), {
    capture: true,
    passive: true,
  });
  doc.addEventListener('submit', () => capture(true), {
    capture: true,
    passive: true,
  });
  globalThis.addEventListener('pagehide', () => capture(true), {
    capture: true,
  });
  const start = () => {
    capture();
    const observer = new globalThis.MutationObserver(schedule);
    observer.observe(doc, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'hidden',
        'aria-hidden',
        'aria-checked',
        'aria-selected',
      ],
    });
  };
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
};
