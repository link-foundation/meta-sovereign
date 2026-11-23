/** Select the CLI consumer before loading its command/provider graph. */
import { runCliCommand } from './command-runner.js';
import { ordinaryCommandNames } from './command-names.js';

const loadConsumer = async (name, load) => {
  const began = globalThis.performance.now();
  const consumer = await load();
  if (process.env.MS_LIFECYCLE_DEBUG === '1') {
    console.error(
      `[cli] ${name} ready after ${Math.round(globalThis.performance.now() - began)} ms`
    );
  }
  return consumer;
};

export const runCli = async (argv, options = {}) => {
  if (argv[0] === 'runner') {
    const { createRunnerCommand } = await loadConsumer(
      'runner command',
      () => import('./runner-command.js')
    );
    return runCliCommand(argv, createRunnerCommand(options.runner), options);
  }
  if (['version', '--version', '-v'].includes(argv[0])) {
    const { versionCmd } = await loadConsumer(
      'version command',
      () => import('./version-command.js')
    );
    return runCliCommand(argv, versionCmd, options);
  }
  if (argv[0] === 'serve') {
    const { serveCmd } = await loadConsumer(
      'serve command',
      () => import('./serve-command.js')
    );
    return runCliCommand(argv, serveCmd, options);
  }
  if (argv[0] === 'serve-cloud') {
    const { serveCloud } = await loadConsumer(
      'serve-cloud command',
      () => import('./cloud-serve.js')
    );
    return runCliCommand(argv, serveCloud, options);
  }
  const help = [undefined, 'help', '--help', '-h'].includes(argv[0]);
  if (help || !ordinaryCommandNames.has(argv[0])) {
    const { HELP } = await loadConsumer(
      'help command',
      () => import('./help.js')
    );
    if (!help) {
      // Unknown commands historically print usage before parsing their flags.
      (options.log ?? console.log)(HELP);
      return 1;
    }
    return runCliCommand(
      argv,
      async (_args, log) => {
        log(HELP);
        return 0;
      },
      options
    );
  }
  const commands = await loadConsumer(
    'ordinary commands',
    () => import('./commands.js')
  );
  return commands.runCli(argv, options);
};
