import path from 'node:path';
import { quoteRunnerArgument } from './runner-transport.js';

export const dockerRunnerProbe = (target) => [
  'docker',
  'container',
  'ls',
  '--all',
  '--filter',
  `name=^/${target.session.replaceAll('.', '\\.')}$`,
  '--format',
  '{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Label "meta-sovereign.runner"}}',
];

/** A same-named foreign container must never authorize Stop or cleanup. */
export const dockerRunnerObservation = (target, result) => {
  const unknown = { state: 'unknown' };
  if (result.aborted || result.code !== 0 || result.stderr?.trim()) {
    return unknown;
  }
  const output = String(result.stdout ?? '').trim();
  if (!output) {
    return { state: 'stopped', id: null };
  }
  const [id, name, state, owner, ...extra] = output.split('\t');
  if (
    extra.length ||
    !/^[a-f0-9]{12,64}$/.test(id) ||
    name !== target.session ||
    owner !== target.session
  ) {
    return unknown;
  }
  return state === 'running'
    ? { state: 'running', id }
    : ['exited', 'dead'].includes(state)
      ? { state: 'stopped', id }
      : unknown;
};

const mount = (directory) =>
  ['type=bind', `source=${directory}`, `target=${directory}`]
    .map((cell) => `"${cell.replaceAll('"', '""')}"`)
    .join(',');

export const dockerRunnerLaunch = (target, command) => {
  const mounts = [target.directory];
  const relative = path.posix.relative(target.directory, target.store);
  if (relative === '..' || relative.startsWith('../')) {
    mounts.push(target.store);
  }
  return [
    '--image',
    target.image,
    '--label',
    `meta-sovereign.runner=${target.session}`,
    '--init',
    ...mounts.flatMap((directory) => ['--mount', mount(directory)]),
    '--',
    'sh',
    '-c',
    `cd ${quoteRunnerArgument(target.directory)} && exec "$@"`,
    'runner',
    ...command,
  ];
};

/** Only an observed, owned, exited container may release its reusable name. */
export const prepareDockerRunner = async (target, run, options) => {
  const observe = async () =>
    dockerRunnerObservation(
      target,
      await run(target, dockerRunnerProbe(target), options)
    );
  const before = await observe();
  if (before.state !== 'stopped' || options.signal?.aborted) {
    return false;
  }
  if (!before.id) {
    return true;
  }
  const result = await run(
    target,
    ['docker', 'container', 'rm', before.id],
    options
  );
  if (result.code !== 0 || result.aborted || result.stderr?.trim()) {
    return false;
  }
  const after = await observe();
  return (
    after.state === 'stopped' && after.id === null && !options.signal?.aborted
  );
};

/** Keep mutations bound to the verified container even if its name is reused. */
export const stopDockerRunner = async (target, run, options) => {
  const current = dockerRunnerObservation(
    target,
    await run(target, dockerRunnerProbe(target), options)
  );
  if (current.state === 'running' && !options.signal?.aborted) {
    await run(target, ['docker', 'container', 'stop', current.id], options);
  }
};

export const dockerRunnerInspection = async (target, run, options) => {
  const current = dockerRunnerObservation(
    target,
    await run(target, dockerRunnerProbe(target), options)
  );
  return current.state === 'running' && !options.signal?.aborted
    ? ['docker', 'exec', current.id]
    : null;
};
