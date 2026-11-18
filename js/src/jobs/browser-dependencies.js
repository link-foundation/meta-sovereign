import { openBrowserSession } from '../cv/browser.js';
import { attachCvWatchBrowser } from './cv-watch-browser.js';
import { jobBrowserProfile } from './browser-profile.js';
import { defaultStoreDir } from '../storage/app-directory.js';

/** Readers, held forms and connect-only CV work share the same named account. */
export const jobBrowserDependencies = (input) => {
  const open = input.openSession ?? openBrowserSession;
  const storeDir = input.storeDir ?? defaultStoreDir();
  const profile = (browserSlot) =>
    jobBrowserProfile({
      storeDir,
      browserSlot,
    });
  const attach = async (options) =>
    attachCvWatchBrowser({
      ...options,
      profileDir: options.profileDir ?? (await profile(options.browserSlot)),
    });
  return {
    ...input,
    storeDir,
    openSession: async (options) =>
      open({
        ...options,
        ...(options.platform === 'hh'
          ? { profileDir: options.profileDir ?? (await profile(options.slot)) }
          : {}),
      }),
    cvWatch: { attach, ...input.cvWatch },
    cvPrepare: { attach, ...input.cvPrepare },
  };
};
