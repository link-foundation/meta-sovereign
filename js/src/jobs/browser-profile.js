import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { browserName } from '../browser/policy.js';
import { slotProfileDir } from '../cv/browser.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { jobsFailure } from './options.js';

const exists = async (file) => {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return false;
  }
};
const hasProfile = async (directory) => {
  for (const marker of [
    'Local State',
    'Default',
    'SingletonLock',
    '.browser-commander-session.json',
  ]) {
    if (await exists(path.join(directory, marker))) {
      return true;
    }
  }
  return false;
};
const trace = (selection) => {
  if (process.env.MS_JOBS_BROWSER_DEBUG === '1') {
    console.error({ event: 'jobs-browser-profile', selection });
  }
};

/** Resolve existing cookies without moving, copying or overwriting a profile. */
export const jobBrowserProfile = async ({
  storeDir = defaultStoreDir(),
  browserSlot = 'jobs',
} = {}) => {
  const slot = browserName(browserSlot);
  const base = path.join(path.resolve(storeDir), 'browser-profiles', 'hh');
  const canonical = slotProfileDir(base, slot);
  const legacy = path.join(base, slot);
  const current = await hasProfile(canonical);
  const previous = await hasProfile(legacy);
  if (
    current &&
    previous &&
    (await realpath(canonical)) !== (await realpath(legacy))
  ) {
    trace('conflict');
    throw jobsFailure(
      'browser-profile-conflict',
      'Two HH profiles exist for this workspace and slot. Close both browsers and preserve the intended profile at browser-profiles/hh/slots/<slot> (browser-profiles/hh for main); archive the other profile before retrying.'
    );
  }
  const selected = !current && previous ? legacy : canonical;
  trace(!current && previous ? 'legacy' : current ? 'canonical' : 'new');
  return selected;
};
