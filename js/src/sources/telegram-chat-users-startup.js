// Own connection/preflight work before a scan or write job has been published.
export const createUsersStartup = (state, publish, errorCode) => {
  const pending = new Set();
  let closed = false;
  let revision = 0;
  const invalidate = () => {
    revision += 1;
  };
  const start = (use) => {
    if (
      closed ||
      state.starting ||
      ['running', 'cancelling'].includes(state.job?.state)
    ) {
      return Promise.resolve({ ok: false, code: closed ? 'stopped' : 'busy' });
    }
    state.starting = true;
    const version = revision;
    const ensure = () => {
      if (closed || revision !== version) {
        const code = closed ? 'stopped' : 'cancelled';
        throw Object.assign(new Error(code), { code });
      }
    };
    const task = Promise.resolve().then(async () => {
      try {
        ensure();
        return await use(ensure);
      } catch (error) {
        if (['running', 'cancelling'].includes(state.job?.state)) {
          state.job.state = ['stopped', 'cancelled'].includes(error.code)
            ? 'cancelled'
            : 'failed';
          state.job.code = errorCode(error);
          await publish().catch(() => {});
        }
        return { ok: false, code: errorCode(error) };
      } finally {
        state.starting = false;
      }
    });
    pending.add(task);
    task.then(
      () => pending.delete(task),
      () => pending.delete(task)
    );
    return task;
  };
  return {
    start,
    invalidate,
    close: async () => {
      closed = true;
      invalidate();
      await Promise.allSettled([...pending]);
    },
  };
};
