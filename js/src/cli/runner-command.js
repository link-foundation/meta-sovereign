import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { encodeWire, LINO_TEXT } from '../transport/lino.js';
import { createRunnerController } from '../server/runner-controller.js';

const appDirectory = () =>
  path.dirname(
    defaultStoreDir({
      env: { ...process.env, META_SOVEREIGN_STORE_DIR: '' },
    })
  );

/** Do not open the application's store or install/launch anything on a read. */
export const createRunnerCommand =
  (options = {}) =>
  async (args, log) => {
    const [action, mode, extra] = args._;
    if (
      extra ||
      !['status', 'start', 'stop'].includes(action) ||
      (action === 'status'
        ? mode !== undefined
        : !['local', 'server'].includes(mode)) ||
      Object.keys(args).some((key) => !['_', 'profile'].includes(key)) ||
      (args.profile !== undefined &&
        (typeof args.profile !== 'string' || !args.profile))
    ) {
      log(
        'Use runner status|start local|start server|stop local|stop server --profile=<file>.'
      );
      return 1;
    }
    const abort = new AbortController();
    const cancel = () => abort.abort();
    process.on('SIGINT', cancel);
    process.on('SIGTERM', cancel);
    try {
      const control = createRunnerController({
        directory: appDirectory,
        ...options,
      });
      const answer = await control.execute({
        action,
        mode,
        profile: args.profile,
        signal: abort.signal,
      });
      log(encodeWire(answer, LINO_TEXT));
      return answer.ok && !abort.signal.aborted ? 0 : 1;
    } catch {
      // Never print SSH stderr, supplied profile content or local private paths.
      log(
        'Runner operation was not confirmed. Read status before trying again.'
      );
      return 1;
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    }
  };
