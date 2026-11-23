import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runnerFixture } from './runner-fixture.mjs';
import { runRunnerCommand } from '../../js/src/server/runner-transport.js';

/** A standard product entry whose server import initially misses a module. */
export const runnerGraphFixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'runner module graph-'));
  const cli = join(directory, 'js', 'bin', 'meta-sovereign.js');
  const server = 'js/src/server/index.js';
  const command = 'js/src/cli/index.js';
  const put = (name, content) => writeFile(join(directory, name), content);
  const close = () => rm(directory, { recursive: true, force: true });
  try {
    await Promise.all([
      ...['js/bin', 'js/src/server', 'js/src/cli'].map((name) =>
        mkdir(join(directory, name), { recursive: true })
      ),
      put(
        'package.json',
        JSON.stringify({
          name: 'meta-sovereign',
          type: 'module',
          bin: { 'meta-sovereign': 'js/bin/meta-sovereign.js' },
          exports: { './server': `./${server}`, './cli': `./${command}` },
        })
      ),
    ]);
    await Promise.all([
      put('js/bin/meta-sovereign.js', 'import "../src/cli/index.js";\n'),
      put(server, 'export { startServer } from "./required.js";\n'),
      put(command, 'export const runCli = () => {};\n'),
      put('js/src/cli/serve-command.js', 'export const serveCmd = () => {};\n'),
    ]);
    return {
      target: { directory, cli },
      repair: () =>
        put(
          'js/src/server/required.js',
          'export const startServer = () => {};\n'
        ),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
};

/** Use real Node for graph imports, with deterministic isolated session states. */
export const runnerGraphBackend = (options = {}) => {
  const fixture = runnerFixture(
    { local: 'running' },
    options.launchFails ? { launchState: 'stopped', launchCode: 1 } : undefined
  );
  const graphChecks = [];
  const run = async (target, args, context) => {
    if (args[1] !== '--input-type=module' && args[3] !== 'runner-application') {
      return fixture.run(target, args, context);
    }
    const { host: _host, ...local } = target;
    const reply = await (options.execute ?? runRunnerCommand)(
      local,
      args,
      context
    );
    if (args[1] === '--input-type=module') {
      graphChecks.push(reply);
    }
    return reply;
  };
  return { ...fixture, run, graphChecks };
};
