import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  configuredRunnerRuntime,
  createRunnerRuntimePreparation,
  lookupRunnerExecutable,
} from './runner-node.js';
import { createRunnerTransport, runRunnerCommand } from './runner-transport.js';

export const configuredRunnerLauncher = (target) => [target.start ?? '$'];
const prepareCommand = createRunnerTransport({ deadlineMs: 100000 });
const assets = () =>
  Promise.all(
    ['prepare.mjs', 'locked-dependencies.json'].map((file) =>
      readFile(new URL(`./runner-tools/${file}`, import.meta.url), 'utf8')
    )
  );

const requiresPackageManager = (reply) =>
  reply.code === 1 &&
  reply.stdout === 'npm-unavailable\n' &&
  !reply.aborted &&
  !reply.stderr?.trim();

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
      const found = await lookupRunnerExecutable(probe, target, '$', options);
      if (found === 'present') {
        const verified = await probe(
          target,
          [...configured, '--version'],
          options
        );
        return verified.code === 0 && !verified.aborted ? configured : null;
      }
      if (found !== 'missing') {
        return null;
      }
      const docker = target.isolation === 'docker';
      const hostTarget = docker
        ? { ...target, isolation: 'screen', node: 'node' }
        : target;
      const host = docker
        ? await prepareHostRuntime(hostTarget, {
            ...options,
            installMissing: true,
          })
        : runtime;
      if (!host) {
        return null;
      }
      const [program, lock] = await assets();
      const prepare = ({ node, npm = '' }) =>
        run(
          target,
          [node, '--input-type=module', '--eval', program, lock, npm],
          options
        );
      let reply = await prepare(host);
      if (!host.npm && requiresPackageManager(reply)) {
        const bundled = await prepareHostRuntime(hostTarget, {
          ...options,
          installMissing: true,
          requireNpm: true,
        });
        if (!bundled?.npm) {
          return null;
        }
        reply = await prepare(bundled);
      }
      return preparedLauncher(target, reply);
    } catch {
      return null;
    }
  };
