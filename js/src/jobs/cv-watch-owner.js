import { runCvWatch } from './cv-watch-runtime.js';
import { cvWatchResult } from './cv-watch-record.js';
import { saveTechnologyRecord } from './technology-storage.js';

export const ownCvWatch = async ({
  signal,
  owned,
  save,
  options,
  store,
  attach,
  readExports,
  verification,
  resolveStart,
  rejectStart,
}) => {
  let session;
  let runtime;
  let timer;
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });
  owned.stop = () => finish('stopped');
  const abort = () => finish('stopped');
  signal.addEventListener('abort', abort, { once: true });
  try {
    await save({});
    await saveTechnologyRecord(store, {
      id: `jobs-cv-watch-latest:${options.browserSlot}`,
      requestId: options.requestId,
    });
    signal.throwIfAborted();
    session = await attach(options);
    signal.throwIfAborted();
    runtime = await runCvWatch({
      session,
      store,
      options,
      signal,
      save,
      readExports,
      verification,
    });
    signal.throwIfAborted();
    await save({ state: 'watching' });
    timer = globalThis.setTimeout(
      () => finish('expired'),
      Math.max(1, owned.expiresAt - Date.now())
    );
    session.page.once('close', abort);
    resolveStart({ watch: cvWatchResult(await store.get(owned.id)) });
    const state = await finished;
    await runtime.stop();
    await save({ state, active: false });
  } catch (error) {
    const code = /^jobs-[a-z\d-]+$/u.test(error.code ?? '')
      ? error.code
      : 'jobs-cv-browser';
    await runtime?.stop();
    await save({
      state: signal.aborted ? 'stopped' : 'failed',
      active: false,
      code,
    });
    rejectStart(error);
  } finally {
    globalThis.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    session?.page.off('close', abort);
    await session?.detach();
  }
};
