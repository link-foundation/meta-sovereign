/** Observe original foreground prefill tasks without polling or replaying writes. */
export const createFormPrefillWait = ({
  reader,
  show,
  showError,
  onWaiting,
}) => {
  const pending = new Map();

  const start = async (input) => {
    let receiveWait;
    const waiting = new Promise((resolve) => {
      receiveWait = resolve;
    });
    const completion = reader.prefillReview(input, receiveWait);
    const initial = await Promise.race([waiting, completion]);
    if (initial.state !== 'waiting-owner') {
      show(initial);
      return { done: Promise.resolve(initial.ok) };
    }

    const entry = {};
    entry.done = completion
      .then(
        (result) => {
          if (!entry.closing) {
            show(result);
          }
          return Boolean(entry.closing) || result.ok;
        },
        (error) => {
          if (!entry.closing) {
            showError(error, initial.reviewSession.browserSlot);
          }
          return Boolean(entry.closing);
        }
      )
      .finally(() => pending.delete(input.id));
    pending.set(input.id, entry);
    show(initial);
    onWaiting();
    return { done: entry.done };
  };

  const closePending = async (id, done) => {
    try {
      return await reader.closeReview(id);
    } finally {
      await done;
    }
  };

  const close = async (id) => {
    const entry = pending.get(id);
    if (!entry) {
      return reader.closeReview(id);
    }
    entry.closing ??= closePending(id, entry.done);
    return entry.closing;
  };

  const stop = async () => {
    const results = await Promise.allSettled([...pending.keys()].map(close));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      throw failure.reason;
    }
  };

  return { start, close, stop };
};
