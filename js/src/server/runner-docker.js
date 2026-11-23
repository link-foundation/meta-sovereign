import path from 'node:path';
import {
  createRunnerTransport,
  quoteRunnerArgument,
} from './runner-transport.js';

export const pullRunnerImage = createRunnerTransport({ deadlineMs: 90000 });
const imageId = /^sha256:[a-f0-9]{64}$/u;

const inspectImage = async (target, run, options) => {
  const { image } = target;
  const reply = await run(
    target,
    ['docker', 'image', 'inspect', '--format', '{{.Id}}', image],
    options
  );
  if (reply.aborted || options.signal?.aborted) {
    return null;
  }
  const id = reply.stdout?.trim();
  const error = reply.stderr?.trim();
  if (reply.code === 0 && !error && imageId.test(id)) {
    return id;
  }
  if (imageId.test(image) || /^[a-f0-9]{64}$/u.test(image)) {
    return null;
  }
  const normalized = image
    .replace(/^(?:docker\.io|index\.docker\.io)\//u, '')
    .replace(/^library\//u, '');
  const withTag = /[:@]/u.test(normalized.split('/').at(-1))
    ? normalized
    : `${normalized}:latest`;
  return reply.code === 1 &&
    !id &&
    [image, withTag].some(
      (name) => error === `Error response from daemon: No such image: ${name}`
    )
    ? 'missing'
    : null;
};

/** Pull an explicitly configured image only after observing its absence. */
export const prepareDockerImage = async (target, run, pull, options) => {
  const current = await inspectImage(target, run, options);
  if (current !== 'missing') {
    return current;
  }
  if (options.signal?.aborted) {
    return null;
  }
  const result = await pull(
    target,
    ['docker', 'image', 'pull', '--quiet', target.image],
    options
  );
  if (result.code !== 0 || result.aborted || options.signal?.aborted) {
    return null;
  }
  const installed = await inspectImage(target, run, options);
  return installed === 'missing' ? null : installed;
};

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

const mount = (directory, readOnly = false) =>
  [
    'type=bind',
    `source=${directory}`,
    `target=${directory}`,
    ...(readOnly ? ['readonly'] : []),
  ]
    .map((cell) => `"${cell.replaceAll('"', '""')}"`)
    .join(',');

export const dockerRunnerApplicationCommand = (
  target,
  executable,
  args,
  { installAs } = {}
) => [
  'docker',
  'run',
  '--rm',
  '--pull=never',
  '--read-only',
  ...(installAs
    ? ['--user', installAs, '--tmpfs', '/tmp']
    : ['--network=none']),
  '--mount',
  mount(target.directory, !installAs),
  '--workdir',
  target.directory,
  '--entrypoint',
  executable,
  target.image,
  ...args,
];

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
    '--keep-container',
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
