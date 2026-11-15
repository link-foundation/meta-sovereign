import { defaultStoreDir } from '../storage/app-directory.js';
import { safeMessage } from '../server/redact.js';

export const createVkReadCommands = ({
  openStore,
  openReadOnly = openStore,
  command,
  makeInput,
  create,
  exportData,
  filter,
}) => ({
  [command]: async (args, log) => {
    const action = args._?.[0] ?? 'inspect';
    if (
      !['inspect', 'refresh', 'export', ...(filter ? ['filter'] : [])].includes(
        action
      )
    ) {
      return 1;
    }
    const storeDir = args.store ?? defaultStoreDir();
    let store;
    try {
      const input = await makeInput(args);
      if (action !== 'filter') {
        store = await (action === 'refresh' ? openStore : openReadOnly)(
          storeDir
        );
      }
      const result =
        action === 'export'
          ? await exportData(store, input, { storeDir })
          : action === 'filter'
            ? filter(input.attachments)
            : await create({ store })[action](input);
      log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      log(
        JSON.stringify({
          ok: false,
          code: error.code ?? 'failed',
          error: safeMessage(error),
        })
      );
      return 1;
    } finally {
      await store?.close();
    }
  },
});
