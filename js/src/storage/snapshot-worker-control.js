// A cancellation request retains ownership until the encoder has closed its
// files. In particular, Deno's terminate/exit acknowledgement does not join the
// worker thread or guarantee that its pending native operations have drained.
export const awaitSnapshotWorker = (worker, { signal, progress }) =>
  new Promise((resolve, reject) => {
    let completing = false;
    const trace = (event) => {
      if (process.env.MS_STORAGE_DEBUG === '1') {
        console.debug(`[storage-snapshot] ${event}`);
      }
    };
    const finish = (error, result) => {
      if (completing) {
        return;
      }
      completing = true;
      signal?.removeEventListener('abort', abort);
      worker.removeListener('message', message);
      worker.removeListener('error', failed);
      worker.removeListener('exit', exited);
      // Final messages follow cleanup. Terminate only the now idle worker:
      // Deno can otherwise leave its parent port alive indefinitely.
      Promise.resolve()
        .then(() => worker.terminate())
        .then(() => (error ? reject(error) : resolve(result)), reject);
    };
    const abort = () => {
      trace('awaiting cancellation cleanup');
      try {
        worker.postMessage({ type: 'snapshot-cancel' });
      } catch (error) {
        finish(error);
      }
    };
    const message = (value) => {
      if (value.progress) {
        progress(value);
        return;
      }
      trace('cleanup acknowledged');
      const error = value.error
        ? Object.assign(new Error(value.error.message), {
            name: value.error.name,
            code: value.error.code,
          })
        : signal?.aborted
          ? signal.reason
          : null;
      finish(error, value);
    };
    const failed = (error) => finish(error);
    const exited = (code) =>
      finish(new Error(`doublets snapshot worker exited with ${code}`));
    worker.on('message', message);
    worker.once('error', failed);
    worker.once('exit', exited);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
  });
