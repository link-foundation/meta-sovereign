import { createFormReader } from '../forms/reader.js';
import { defaultStoreDir } from '../storage/app-directory.js';

export const FORMS_HELP = `  forms-read    --url=<http-url> [--browser-slot=<name>] [--headed|--headless] [--store=<dir>]`;

export const createFormsCommands = ({ openStore, ...readerOptions }) => ({
  'forms-read': async (args, log) => {
    if (
      args.headless !== undefined &&
      ![true, false, 'true', 'false'].includes(args.headless)
    ) {
      throw new Error('--headless must be true or false');
    }
    const store = await openStore(args.store ?? defaultStoreDir());
    const reader = createFormReader({ store, ...readerOptions });
    try {
      log(
        JSON.stringify(
          await reader.read({
            url: args.url,
            browserSlot: args['browser-slot'],
            headless:
              args.headed === true || args.headed === 'true'
                ? false
                : args.headless === undefined
                  ? undefined
                  : args.headless === true || args.headless === 'true',
          }),
          null,
          2
        )
      );
      return 0;
    } finally {
      try {
        await reader.stop();
      } finally {
        await store.close?.();
      }
    }
  },
});
