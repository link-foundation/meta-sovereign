import { defaultStoreDir } from '../storage/app-directory.js';
import {
  manageFormWatcher,
  listFormWatchers,
} from '../forms/watcher-management.js';

export const FORMS_WATCHERS_HELP =
  '  forms-watchers [--action=list|status|history|stop] [--browser-slot=<name>] [--store=<dir>]';
export const formWatcherCommands = {
  'forms-watchers': async (args, log) => {
    const action = args.action ?? 'list';
    if (!['list', 'status', 'history', 'stop'].includes(action)) {
      throw new Error('--action must be list, status, history or stop.');
    }
    const directory = args.store ?? defaultStoreDir();
    const result =
      action === 'list'
        ? await listFormWatchers(directory)
        : await manageFormWatcher({
            directory,
            slot: args['browser-slot'] ?? 'form-1',
            action,
          });
    log(JSON.stringify(result));
    return result.ok ? 0 : 1;
  },
};
