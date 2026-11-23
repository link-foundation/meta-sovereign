import path from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import { acquireStoreLock } from '../storage/store-lock.js';
import { writeFileDurable } from '../storage/durable.js';
import { readReadableConfiguration } from '../cli/readable-configuration.js';
import {
  runnerProfileData,
  validateRunnerProfile,
} from '../cli/runner-profile.js';
import { createRunnerControl } from './runner-control.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { runnerProfileOperation } from './runner-profile-store.js';
import { readRunnerInspection } from './runner-inspection.js';
import { readRunnerConfiguration } from '../cli/runner-configuration.js';
import { createRunnerLauncherPreparation } from './runner-dependencies.js';
import { createRunnerRuntimePreparation } from './runner-node.js';

export const defaultRunnerDirectory = () =>
  path.dirname(
    defaultStoreDir({
      env: { ...process.env, META_SOVEREIGN_STORE_DIR: '' },
    })
  );

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
const profileFailure = (desired) =>
  desired ? 'runner-profile-change-blocked' : 'runner-profile-unavailable';
const profileMismatch = (bound, desired, states) =>
  !desired || (bound && !same(bound, desired) && !stopped(states));
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
const validAction = (action, mode, overrides) => {
  if (action === 'configure' && Object.keys(overrides).length) {
    return false;
  }
  return ['status', 'profile', 'configure'].includes(action)
    ? mode === undefined
    : ['start', 'stop', 'inspect'].includes(action) &&
        ['local', 'server'].includes(mode);
};
const profileReader =
  ({ load, file, profile, localDirectory, overrides }) =>
  async () =>
    load
      ? {
          targets: await load(file, { optional: profile === undefined }),
          file,
        }
      : await readRunnerConfiguration(file, {
          localFile:
            profile === undefined
              ? path.join(localDirectory(), 'runner.lino')
              : undefined,
          optional: profile === undefined,
          overrides,
        });

/** Serialize all callers and retain target identity across profile edits/crashes. */
export const createRunnerController = ({
  directory = defaultRunnerDirectory,
  localDirectory = () => path.join(process.cwd(), '.meta-sovereign'),
  run,
  prepareLauncher = createRunnerLauncherPreparation({ probe: run }),
  prepareRuntime = createRunnerRuntimePreparation({ probe: run }),
  load,
  lock = acquireStoreLock,
}) => ({
  async execute({
    action,
    mode,
    profile,
    signal,
    document,
    revision,
    overrides = {},
  }) {
    if (!validAction(action, mode, overrides)) {
      return { ok: false, code: 'invalid-runner-action' };
    }
    const dir = path.join(directory(), 'runner-control');
    const lease = await lock(dir, { exclusive: true });
    try {
      const profileFile = profile ?? path.join(directory(), 'runner.lino');
      const read = profileReader({
        load,
        file: profileFile,
        profile,
        localDirectory,
        overrides,
      });
      if (['profile', 'configure'].includes(action)) {
        return await runnerProfileOperation(
          profileFile,
          {
            action,
            document,
            revision,
            signal,
          },
          undefined,
          read
        );
      }
      const file = path.join(dir, 'binding.lino');
      const bound = await readBinding(file);
      const desired = await loadDesired(
        profileFile,
        async () => (await read()).targets,
        bound,
        profile === undefined
      );
      let control = createRunnerControl({ targets: bound ?? desired, run });
      const observed = await control.status({ signal });
      const mismatch = profileMismatch(bound, desired, observed.states);
      if (mismatch && !['stop', 'inspect'].includes(action)) {
        return {
          ...observed,
          ok: action === 'status',
          code: profileFailure(desired),
          scope: 'isolated-session',
        };
      }
      const targets = mismatch ? bound : desired;
      control = createRunnerControl({
        targets,
        run,
        prepareLauncher,
        prepareRuntime,
      });
      if (action === 'status') {
        return {
          ...(targets === (bound ?? desired)
            ? observed
            : await control.status({ signal })),
          scope: 'isolated-session',
        };
      }
      if (action === 'inspect') {
        return await readRunnerInspection({
          control,
          targets,
          mode,
          run,
          resolveRuntime: prepareRuntime,
          signal,
          code: mismatch ? profileFailure(desired) : undefined,
        });
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
