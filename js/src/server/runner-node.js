import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRunnerTransport, runRunnerCommand } from './runner-transport.js';

export const probeRunnerExecutable = (command) => [
  'sh',
  '-c',
  'if command -v "$1" >/dev/null 2>&1; then printf present; else printf missing; fi',
  'sh',
  command,
];

export const configuredRunnerRuntime = (target) => ({
  node: target.node ?? 'node',
});

const installRuntime = createRunnerTransport({ deadlineMs: 90000 });

const cachedRuntime = (target, result) => {
  if (result.code !== 0 || result.aborted || result.stderr?.trim()) {
    return null;
  }
  const directory = result.stdout.replace(/\n$/u, '');
  const paths = target.host ? path.posix : path;
  if (
    !paths.isAbsolute(directory) ||
    [...directory].some((char) => char < ' ' || char.charCodeAt(0) === 127) ||
    paths.normalize(directory) !== directory ||
    paths.basename(paths.dirname(directory)) !==
      '.meta-sovereign-runner-tools' ||
    !/^node-v\d+\.\d+\.\d+-(?:linux|darwin)-(?:x64|arm64)-[a-f0-9]{64}$/u.test(
      paths.basename(directory)
    )
  ) {
    return null;
  }
  return {
    node: paths.join(directory, 'bin', 'node'),
    npm: paths.join(
      directory,
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js'
    ),
  };
};

/** Resolve the application runtime on the execution host. Only Start may install it. */
export const createRunnerRuntimePreparation =
  ({ probe = runRunnerCommand, install = installRuntime } = {}) =>
  async (target, { installMissing = false, ...options } = {}) => {
    const configured = configuredRunnerRuntime(target);
    if (
      target.isolation === 'docker' ||
      configured.node !== 'node' ||
      (!target.host && process.platform === 'win32')
    ) {
      return configured;
    }
    try {
      const lookup = await probe(
        target,
        probeRunnerExecutable('node'),
        options
      );
      if (lookup.code !== 0 || lookup.aborted || lookup.stderr?.trim()) {
        return null;
      }
      if (lookup.stdout === 'present') {
        return configured;
      }
      if (lookup.stdout !== 'missing') {
        return null;
      }
      const script = await readFile(
        new URL('./runner-tools/prepare-node.sh', import.meta.url),
        'utf8'
      );
      const run = installMissing ? install : probe;
      const result = await run(
        target,
        ['sh', '-c', script, 'sh', installMissing ? 'install' : 'read'],
        options
      );
      return cachedRuntime(target, result);
    } catch {
      return null;
    }
  };
