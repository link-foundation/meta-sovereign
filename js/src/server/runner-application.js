import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dockerRunnerApplicationCheck } from './runner-docker.js';

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
    return true;
  }
  try {
    const program = await readFile(
      new URL('./runner-tools/check-application.mjs', import.meta.url),
      'utf8'
    );
    const args = ['--input-type=module', '--eval', program, target.cli];
    const argv =
      target.isolation === 'docker'
        ? dockerRunnerApplicationCheck(target, runtime.node, args)
        : [runtime.node, ...args];
    const reply = await run(target, argv, options);
    return (
      reply.code === 0 &&
      !reply.aborted &&
      !reply.stderr?.trim() &&
      ['loaded', 'custom'].includes(reply.stdout)
    );
  } catch {
    return false;
  }
};
