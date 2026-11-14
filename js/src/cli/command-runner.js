import { defaultStoreDir, resolveUserStore } from '../storage/app-directory.js';
import { parseArgs } from './lino-args.js';
import { SCHEMA_ERROR_CODES } from './errors.js';

/** Share argument, store and handled-error behavior across deferred commands. */
export const runCliCommand = async (
  argv,
  handler,
  { log = console.log } = {}
) => {
  const [cmd, ...rest] = argv;
  try {
    const args = parseArgs(rest);
    if (
      args.store === undefined &&
      ![
        'help',
        '--help',
        '-h',
        'version',
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
    if (error?.code === 'STORE_LOCKED' || SCHEMA_ERROR_CODES.has(error?.code)) {
      log(error.message);
      return 1;
    }
    throw error;
  }
};
