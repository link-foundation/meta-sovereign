/** Select the CLI consumer before loading its command/provider graph. */
import { runCliCommand } from './command-runner.js';

export const runCli = async (argv, options = {}) => {
  if (argv[0] === 'serve') {
    const began = globalThis.performance.now();
    const { serveCmd } = await import('./serve-command.js');
    if (process.env.MS_LIFECYCLE_DEBUG === '1') {
      console.error(
        `[cli] serve command ready after ${Math.round(globalThis.performance.now() - began)} ms`
      );
    }
    return runCliCommand(argv, serveCmd, options);
  }
  const commands = await import('./commands.js');
  return commands.runCli(argv, options);
};
