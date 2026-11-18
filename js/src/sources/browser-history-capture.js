import { randomBytes } from 'node:crypto';
import { browserChoicePage, browserChoiceSpec } from './browser-choices.js';

const failure = (code = 'question-history-save-failed') =>
  Object.assign(new Error('Browser history capture stopped.'), {
    code,
    fallback: false,
  });

/** Serial durable writes; a page snapshot is never replaced by a later read. */
export const openBrowserHistoryCapture = async ({
  document,
  ui,
  target,
  onHistoryWindow,
}) => {
  const token = randomBytes(24).toString('hex');
  let tail = Promise.resolve();
  let error;
  let closed = false;
  let closing;
  let queued = 0;
  let bytes = 0;
  const debug = (phase, code) => {
    if (process.env.MS_BROWSER_HISTORY_DEBUG === '1') {
      console.error('[browser-history-capture]', {
        source: ui.id,
        phase,
        queued,
        code,
      });
    }
  };
  const onSnapshot = (snapshot) => {
    if (closed || error) {
      return Promise.reject(error ?? failure());
    }
    const size = JSON.stringify(snapshot).length * 2;
    if (
      snapshot?.chat !== String(target) ||
      !Array.isArray(snapshot.rows) ||
      snapshot.rows.length > 500 ||
      queued >= 64 ||
      bytes + size > 2097152
    ) {
      error = failure('question-history-capture-gap');
      return Promise.reject(error);
    }
    queued++;
    bytes += size;
    const pending = tail.then(() => onHistoryWindow(snapshot));
    tail = pending.catch(() => {
      if (!error) {
        debug('failed', 'question-history-save-failed');
      }
      error ??= failure();
    });
    return pending
      .catch(() => {
        throw error ?? failure();
      })
      .finally(() => {
        queued--;
        bytes -= size;
      });
  };
  const subscription = await document.bindHistory(token, onSnapshot);
  const spec = browserChoiceSpec(ui);
  const control = (operation) =>
    document.evaluate({
      fn: browserChoicePage,
      args: [{ spec, target, token, binding: subscription.binding, operation }],
    });
  const flush = async (operation = 'flushHistory') => {
    const result = await control(operation);
    await tail;
    if (error || result?.code) {
      debug('refused', error?.code ?? result.code);
      throw error ?? failure(result.code);
    }
    return result;
  };
  const close = () => {
    closing ??= (async () => {
      try {
        const result = await control('releaseHistory');
        if (result?.code?.startsWith('question-history-')) {
          error ??= failure(result.code);
        }
      } catch {
        // Detached old documents cannot admit more snapshots; writes still drain.
      } finally {
        closed = true;
        await tail;
        subscription.release();
        debug('closed', error?.code);
      }
      if (error) {
        throw error;
      }
    })();
    return closing;
  };
  try {
    await flush('observeHistory');
    debug('opened');
  } catch (cause) {
    await close().catch(() => {});
    throw cause;
  }
  return { flush, close, writeWindow: onSnapshot };
};
