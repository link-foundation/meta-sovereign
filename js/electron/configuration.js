import { parseArgs } from '../src/cli/lino-args.js';
import { startupArguments } from '../src/cli/startup-configuration.js';
import { serveOptions } from '../src/cli/server-options.js';

/** The same user/local files and explicit options as serve, with shell defaults. */
export const desktopConfiguration = async (argv, configuration) => {
  const args = await startupArguments(parseArgs(argv), configuration);
  return {
    port: Number(
      args.port ?? (String(args['local-ui']) === 'false' ? 8787 : 0)
    ),
    localUi: true,
    ...serveOptions(args, { defaultTls: false }),
    ...(args.store !== undefined ? { storeDir: args.store } : {}),
  };
};
