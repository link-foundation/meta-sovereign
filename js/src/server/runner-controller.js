import path from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import { acquireStoreLock } from '../storage/store-lock.js';
import { writeFileDurable } from '../storage/durable.js';
import { readReadableConfiguration } from '../cli/readable-configuration.js';
import {
  readRunnerProfile,
  runnerProfileData,
  validateRunnerProfile,
} from '../cli/runner-profile.js';
import { createRunnerControl } from './runner-control.js';

const readBinding = async (file) => {
  try {
    const value = await readReadableConfiguration(file);
    if (
      value.version !== 1 ||
      Object.keys(value).some((key) => !['version', 'profile'].includes(key))
    ) {
      throw new Error('Invalid runner binding.');
    }
    return validateRunnerProfile(value.profile);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};
const stopped = (states) =>
  Object.values(states).every((state) =>
    ['stopped', 'unconfigured'].includes(state)
  );
const same = (a, b) =>
  JSON.stringify(runnerProfileData(a)) === JSON.stringify(runnerProfileData(b));
const loadDesired = async (file, load, bound, optional) => {
  try {
    return await load(file, { optional });
  } catch (error) {
    if (!bound) {
      throw error;
    }
    return null;
  }
};
const validAction = (action, mode) =>
  action === 'status'
    ? mode === undefined
    : ['start', 'stop'].includes(action) && ['local', 'server'].includes(mode);

/** Serialize all callers and retain target identity across profile edits/crashes. */
export const createRunnerController = ({
  directory,
  run,
  load = readRunnerProfile,
  lock = acquireStoreLock,
}) => ({
  async execute({ action, mode, profile, signal }) {
    if (!validAction(action, mode)) {
      return { ok: false, code: 'invalid-runner-action' };
    }
    const dir = path.join(directory(), 'runner-control');
    const lease = await lock(dir, { exclusive: true });
    try {
      const file = path.join(dir, 'binding.lino');
      const bound = await readBinding(file);
      const desired = await loadDesired(
        profile ?? path.join(directory(), 'runner.lino'),
        load,
        bound,
        profile === undefined
      );
      let control = createRunnerControl({ targets: bound ?? desired, run });
      const observed = await control.status({ signal });
      const mismatch =
        !desired ||
        (bound && !same(bound, desired) && !stopped(observed.states));
      if (mismatch && action !== 'stop') {
        return {
          ...observed,
          ok: action === 'status',
          code: desired
            ? 'runner-profile-change-blocked'
            : 'runner-profile-unavailable',
          scope: 'isolated-session',
        };
      }
      const targets = mismatch ? bound : desired;
      control = createRunnerControl({ targets, run });
      if (action === 'status') {
        return {
          ...(targets === (bound ?? desired)
            ? observed
            : await control.status({ signal })),
          scope: 'isolated-session',
        };
      }
      // Retain both addresses even if launch/SSH is interrupted or ambiguous.
      await writeFileDurable(
        file,
        formatIndented({
          id: 'runnerBinding',
          obj: {
            version: 1,
            profile: runnerProfileData(targets),
          },
        })
      );
      return {
        ...(await control.act(action, mode, { signal })),
        scope: 'isolated-session',
      };
    } finally {
      await lease.release();
    }
  },
});
