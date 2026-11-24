import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dockerRunnerApplicationCommand } from './runner-docker.js';
import { createRunnerTransport } from './runner-transport.js';

const installCommand = createRunnerTransport({ deadlineMs: 100000 });
const tool = (name) =>
  readFile(new URL(`./runner-tools/${name}`, import.meta.url), 'utf8');

const usesProductEntry = (target) => {
  const paths = target.host ? path.posix : path;
  const directory = paths.dirname(target.cli);
  return (
    paths.basename(target.cli) === 'meta-sovereign.js' &&
    paths.basename(directory) === 'bin' &&
    paths.basename(paths.dirname(directory)) === 'js'
  );
};

/** Confirm the checked-in CLI and worker module graph before switching. */
export const verifyRunnerApplication = async (
  target,
  runtime,
  run,
  options
) => {
  if (!usesProductEntry(target)) {
    return !target.applicationLock;
  }
  try {
    const program = await tool('check-application.mjs');
    const args = ['--input-type=module', '--eval', program, target.cli];
    if (target.applicationLock) {
      args.push(target.applicationLock);
    }
    const argv =
      target.isolation === 'docker'
        ? dockerRunnerApplicationCommand(target, runtime.node, args)
        : [runtime.node, ...args];
    const reply = await run(target, argv, options);
    return (
      reply.code === 0 &&
      !reply.aborted &&
      !reply.stderr?.trim() &&
      (reply.stdout === 'loaded' ||
        (!target.applicationLock && reply.stdout === 'custom'))
    );
  } catch {
    return false;
  }
};

const confirmed = (reply, code) =>
  reply.code === code && !reply.aborted && !reply.stderr?.trim();
const needsHostNpm = (target, runtime, result) =>
  target.isolation !== 'docker' &&
  !runtime.npm &&
  confirmed(result, 1) &&
  result.stdout === 'npm-unavailable';

const dockerOwner = async (target, run, options) => {
  const result = await run(
    target,
    ['sh', '-c', 'printf \'%s:%s\' "$(id -u)" "$(id -g)"'],
    options
  );
  return confirmed(result, 0) && /^\d{1,10}:\d{1,10}$/u.test(result.stdout)
    ? result.stdout
    : undefined;
};

/** A reviewed lock allows explicit Start to prepare an otherwise cold checkout. */
export const createRunnerApplicationPreparation =
  ({ install = installCommand } = {}) =>
  async (target, runtime, run, options, prepareRuntime) => {
    const verify = () => verifyRunnerApplication(target, runtime, run, options);
    if (await verify()) {
      return true;
    }
    if (!target.applicationLock || options.signal?.aborted) {
      return false;
    }
    try {
      const docker = target.isolation === 'docker';
      const installAs = docker && (await dockerOwner(target, run, options));
      if (docker && !installAs) {
        return false;
      }
      const [program, check] = await Promise.all([
        tool('prepare-application.mjs'),
        tool('check-application.mjs'),
      ]);
      const prepare = ({ node, npm = '' }) => {
        const args = [
          '--input-type=module',
          '--eval',
          program,
          target.cli,
          target.applicationLock,
          npm,
          check,
        ];
        return install(
          target,
          docker
            ? dockerRunnerApplicationCommand(target, node, args, { installAs })
            : [node, ...args],
          options
        );
      };
      let result = await prepare(runtime);
      if (needsHostNpm(target, runtime, result)) {
        const privateRuntime = await prepareRuntime(target, {
          ...options,
          installMissing: true,
          requireNpm: true,
        });
        if (!privateRuntime?.npm) {
          return false;
        }
        result = await prepare(privateRuntime);
      }
      return (
        confirmed(result, 0) &&
        ['prepared', 'present'].includes(result.stdout) &&
        (await verify())
      );
    } catch {
      return false;
    }
  };
