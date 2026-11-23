import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRunnerTransport, runRunnerCommand } from './runner-transport.js';

export const configuredRunnerLauncher = (target) => [target.start ?? '$'];
const defaultProbe = [
  'sh',
  '-c',
  'if command -v "$1" >/dev/null 2>&1; then printf present; else printf missing; fi',
  'sh',
  '$',
];
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
  ({ probe = runRunnerCommand, run = prepareCommand } = {}) =>
  async (target, options) => {
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
      const [program, lock] = await assets();
      const node =
        target.isolation === 'docker' ? 'node' : (target.node ?? 'node');
      const reply = await run(
        target,
        [node, '--input-type=module', '--eval', program, lock],
        options
      );
      return preparedLauncher(target, reply);
    } catch {
      return null;
    }
  };
