/** Select the CLI consumer before loading its command/provider graph. */
import { runCliCommand } from './command-runner.js';

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
  const commands = await loadConsumer(
    'ordinary commands',
    () => import('./commands.js')
  );
  return commands.runCli(argv, options);
};
