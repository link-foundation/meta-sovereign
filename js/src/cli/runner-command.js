import { encodeWire, LINO_TEXT } from '../transport/lino.js';
import { createRunnerController } from '../server/runner-controller.js';
import { requestRunner } from './runner-client.js';
import { readRunnerProfile, runnerProfileData } from './runner-profile.js';
import { formatIndented } from 'lino-objects-codec';
import { runnerHealthCommand } from './runner-health-command.js';

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
const validConfiguration = (args, action) =>
  action === 'configure'
    ? typeof args.input === 'string' &&
      Boolean(args.input) &&
      typeof args.revision === 'string' &&
      /^[a-f0-9]{64}$/.test(args.revision)
    : args.input === undefined && args.revision === undefined;

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
      !['status', 'start', 'stop', 'inspect', 'profile', 'configure'].includes(
        action
      ) ||
      (['status', 'profile', 'configure'].includes(action)
        ? mode !== undefined
        : !['local', 'server'].includes(mode)) ||
      Object.keys(args).some(
        (key) => !['_', 'profile', 'url', 'input', 'revision'].includes(key)
      ) ||
      !validSelection(args) ||
      !validConfiguration(args, action)
    ) {
      log(
        'Use runner status|start local|start server|stop local|stop server|inspect local|inspect server|profile|configure --input=<file> --revision=<saved-revision> [--profile=<file> | --url=<server-origin>].'
      );
      return 1;
    }
    const abort = new AbortController();
    const cancel = () => abort.abort();
    process.on('SIGINT', cancel);
    process.on('SIGTERM', cancel);
    try {
      const input = {
        action,
        mode,
        profile: args.profile,
        signal: abort.signal,
        ...(action === 'configure'
          ? {
              document: formatIndented({
                id: 'runner',
                obj: runnerProfileData(await readRunnerProfile(args.input)),
              }),
              revision: args.revision,
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
