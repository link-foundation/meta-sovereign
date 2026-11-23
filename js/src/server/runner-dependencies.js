import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  configuredRunnerRuntime,
  createRunnerRuntimePreparation,
  probeRunnerExecutable,
} from './runner-node.js';
import { createRunnerTransport, runRunnerCommand } from './runner-transport.js';

export const configuredRunnerLauncher = (target) => [target.start ?? '$'];
const defaultProbe = probeRunnerExecutable('$');
const prepareCommand = createRunnerTransport({ deadlineMs: 100000 });
const assets = () =>
  Promise.all(
    ['prepare.mjs', 'locked-dependencies.json'].map((file) =>
      readFile(new URL(`./runner-tools/${file}`, import.meta.url), 'utf8')
    )
  );

const preparedLauncher = (target, result) => {
  if (result.code !== 0 || result.aborted) {
    return null;
  }
  const value = JSON.parse(result.stdout);
  const absolute = (target.host ? path.posix : path).isAbsolute;
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (entry) =>
        typeof entry === 'string' &&
        absolute(entry) &&
        [...entry].every((char) => char >= ' ' && char.charCodeAt(0) !== 127)
    )
    ? value
    : null;
};

/** Preserve explicit overrides and existing PATH wrappers. Prepare only a proven absence. */
export const createRunnerLauncherPreparation =
  ({
    probe = runRunnerCommand,
    run = prepareCommand,
    prepareHostRuntime = createRunnerRuntimePreparation({
      probe,
      install: run,
    }),
  } = {}) =>
  async (target, options, runtime = configuredRunnerRuntime(target)) => {
    const configured = configuredRunnerLauncher(target);
    if (configured[0] !== '$') {
      return configured;
    }
    try {
      const found = await probe(target, defaultProbe, options);
      if (found.code !== 0 || found.aborted) {
        return null;
      }
      if (found.stdout === 'present') {
        const verified = await probe(
          target,
          [...configured, '--version'],
          options
        );
        return verified.code === 0 && !verified.aborted ? configured : null;
      }
      if (found.stdout !== 'missing') {
        return null;
      }
      const host =
        target.isolation === 'docker'
          ? await prepareHostRuntime(
              { ...target, isolation: 'screen', node: 'node' },
              { ...options, installMissing: true }
            )
          : runtime;
      if (!host) {
        return null;
      }
      const [program, lock] = await assets();
      const reply = await run(
        target,
        [
          host.node,
          '--input-type=module',
          '--eval',
          program,
          lock,
          host.npm ?? '',
        ],
        options
      );
      return preparedLauncher(target, reply);
    } catch {
      return null;
    }
  };
