import { encodeWire, LINO_TEXT } from '../transport/lino.js';
import { createRunnerController } from '../server/runner-controller.js';
import { requestRunner } from './runner-client.js';
import { readRunnerProfile, runnerProfileData } from './runner-profile.js';
import { formatIndented } from 'lino-objects-codec';
import { runnerHealthCommand } from './runner-health-command.js';
import { runnerDeploymentAction } from '../transport/runner-deployment-receipt.js';
import {
  runnerConfigurationOverrides,
  runnerOverrideOptions,
} from './runner-configuration.js';

const validSelection = (args) => {
  if (args.url !== undefined) {
    return (
      typeof args.url === 'string' &&
      Boolean(args.url) &&
      args.profile === undefined
    );
  }
  return (
    args.profile === undefined ||
    (typeof args.profile === 'string' && Boolean(args.profile))
  );
};
const validConfiguration = (args, action) => {
  const revision =
    typeof args.revision === 'string' && /^[a-f0-9]{64}$/u.test(args.revision);
  if (action === 'configure') {
    return typeof args.input === 'string' && Boolean(args.input) && revision;
  }
  return (
    args.input === undefined &&
    (action === 'deploy' ? revision : args.revision === undefined)
  );
};
const selectedOverrides = (args, action) => {
  const overrides = runnerConfigurationOverrides(args);
  if (
    Object.keys(overrides).length &&
    (args.url !== undefined || action === 'configure')
  ) {
    throw new Error('Invalid runner overrides.');
  }
  return overrides;
};

/** Do not open the application's store or install/launch anything on a read. */
export const createRunnerCommand =
  (options = {}) =>
  async (args, log) => {
    const [action, mode, extra] = args._;
    if (action === 'health') {
      return runnerHealthCommand(args, log);
    }
    if (
      extra ||
      (!['status', 'start', 'stop', 'inspect', 'profile', 'configure'].includes(
        action
      ) &&
        !runnerDeploymentAction(action)) ||
      (['status', 'profile', 'configure'].includes(action)
        ? mode !== undefined
        : !['local', 'server'].includes(mode)) ||
      Object.keys(args).some(
        (key) =>
          !['_', 'profile', 'url', 'input', 'revision'].includes(key) &&
          !runnerOverrideOptions.has(key)
      ) ||
      !validSelection(args) ||
      !validConfiguration(args, action)
    ) {
      log(
        'Use runner status, start|stop|inspect local|server, profile, configure --input=<file> --revision=<saved-revision>, deploy-plan local|server, or deploy local|server --revision=<plan-revision>. Select --profile=<file> or --url=<server-origin> when needed.'
      );
      return 1;
    }
    const abort = new AbortController();
    const cancel = () => abort.abort();
    process.on('SIGINT', cancel);
    process.on('SIGTERM', cancel);
    try {
      const overrides = selectedOverrides(args, action);
      const input = {
        action,
        mode,
        profile: args.profile,
        signal: abort.signal,
        overrides,
        revision: args.revision,
        ...(action === 'configure'
          ? {
              document: formatIndented({
                id: 'runner',
                obj: runnerProfileData(await readRunnerProfile(args.input)),
              }),
            }
          : {}),
      };
      const answer =
        args.url !== undefined
          ? await requestRunner({ ...input, url: args.url }, options.fetchImpl)
          : await createRunnerController(options).execute(input);
      log(encodeWire(answer, LINO_TEXT));
      return answer.ok && !abort.signal.aborted ? 0 : 1;
    } catch {
      // Never print SSH stderr, supplied profile content or local private paths.
      log(
        'Runner operation was not confirmed. Read saved profile or status before trying again.'
      );
      return 1;
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    }
  };
