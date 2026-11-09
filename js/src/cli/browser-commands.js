import { defaultStoreDir } from '../storage/app-directory.js';
import {
  listBrowserPolicies,
  resolveBrowserPolicy,
  saveBrowserPolicy,
} from '../browser/policy.js';

export const BROWSER_HELP = `  browser-policies [--platform=hh] [--slot=main] [--case=cv] [--store=<dir>]
  browser-configure --scope=default|case|slot [--key=cv|hh/forms] --mode=visible|headless|inherit [--store=<dir>]`;

const modeValue = (mode) => {
  if (!['visible', 'headless', 'inherit'].includes(mode)) {
    throw new Error('--mode must be visible, headless or inherit');
  }
  return mode === 'inherit' ? null : mode === 'headless';
};

export const createBrowserCommands = ({
  openStore,
  openReadOnly = openStore,
}) => {
  const run = (open, action) => async (args, log) => {
    const store = await open(args.store ?? defaultStoreDir());
    try {
      log(JSON.stringify(await action(store, args), null, 2));
      return 0;
    } finally {
      await store.close?.();
    }
  };
  return {
    'browser-policies': run(openReadOnly, async (store, args) => ({
      policies: await listBrowserPolicies(store),
      resolved: await resolveBrowserPolicy(store, {
        platform: args.platform ?? 'shared',
        slot: args.slot ?? 'main',
        useCase: args.case ?? 'general',
      }),
    })),
    'browser-configure': run(openStore, (store, args) =>
      saveBrowserPolicy(store, {
        scope: args.scope,
        key: args.key,
        headless: modeValue(args.mode),
      })
    ),
  };
};
