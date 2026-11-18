import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';

const KEY = 'diagnostics:settings';
const serialize = createStoreQueue();

export const verboseFlag = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if ([true, 'true', '1'].includes(value)) {
    return true;
  }
  if ([false, 'false', '0', ''].includes(value)) {
    return false;
  }
  throw new Error('verbose must be true or false');
};

export const createLogSettings = async ({
  store,
  journal,
  verbose,
  session,
}) => {
  const saved = await store.get(KEY);
  const apply = (value) => {
    journal.setVerbose(value);
    session?.setVerbose(value);
  };
  apply(verbose ?? saved?.verbose !== false);
  const read = () => ({
    ok: true,
    verbose: journal.isVerbose(),
    session: session?.metadata() ?? { persisted: false, file: null },
  });
  return {
    read,
    save: (input) =>
      serialize(store, async () => {
        if (typeof input?.verbose !== 'boolean') {
          throw new Error('verbose must be true or false');
        }
        await saveAcknowledgedRecord(store, {
          id: KEY,
          verbose: input.verbose,
        });
        apply(input.verbose);
        journal.log({
          event: 'diagnostics_settings_saved',
          verbose: input.verbose,
        });
        return read();
      }),
  };
};
