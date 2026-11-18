import { defaultStoreDir } from '../storage/app-directory.js';
import { readRunnerHealth } from '../server/runner-health.js';
import { encodeWire, LINO_TEXT } from '../transport/lino.js';

/** Private control read only: no store open, profile load, install or launch. */
export const runnerHealthCommand = async (args, log) => {
  if (
    args._.length !== 1 ||
    Object.keys(args).some((key) => !['_', 'store'].includes(key)) ||
    (args.store !== undefined &&
      (typeof args.store !== 'string' || !args.store))
  ) {
    log('Use runner health [--store=<directory>].');
    return 1;
  }
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const answer = await readRunnerHealth(args.store ?? defaultStoreDir(), {
      signal: abort.signal,
    });
    log(encodeWire(answer, LINO_TEXT));
    return answer.ok && !abort.signal.aborted ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
};
