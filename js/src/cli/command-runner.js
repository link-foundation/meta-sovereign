import { defaultStoreDir, resolveUserStore } from '../storage/app-directory.js';
import { parseArgs } from './lino-args.js';
import { SCHEMA_ERROR_CODES } from './errors.js';

/** Share argument, store and handled-error behavior across deferred commands. */
export const runCliCommand = async (
  argv,
  handler,
  { log = console.log, configuration } = {}
) => {
  const [cmd, ...rest] = argv;
  try {
    let args = parseArgs(rest);
    if (cmd === 'serve') {
      const { startupArguments } = await import('./startup-configuration.js');
      args = await startupArguments(args, configuration);
    }
    if (
      args.store === undefined &&
      ![
        'help',
        '--help',
        '-h',
        'version',
        'runner',
        '--version',
        '-v',
        undefined,
      ].includes(cmd)
    ) {
      args.store =
        ['serve', 'trust'].includes(cmd) &&
        !process.env.META_SOVEREIGN_STORE_DIR
          ? await resolveUserStore({ log })
          : defaultStoreDir();
    }
    return await handler(args, log);
  } catch (error) {
    if (
      [
        'STORE_LOCKED',
        'INVALID_CLI_ARGUMENTS',
        'INVALID_APP_CONFIGURATION',
      ].includes(error?.code) ||
      SCHEMA_ERROR_CODES.has(error?.code)
    ) {
      log(error.message);
      return 1;
    }
    throw error;
  }
};
