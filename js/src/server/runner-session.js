import {
  dockerRunnerLaunch,
  dockerRunnerObservation,
  dockerRunnerProbe,
} from './runner-docker.js';

/** Live backend observations, never a launch wrapper's optimistic exit status. */
export const runnerProbe = (target) =>
  target?.isolation === 'docker'
    ? dockerRunnerProbe(target)
    : ['screen', '-ls'];

export const observedRunnerState = (target, result) => {
  if (target.isolation === 'docker') {
    return dockerRunnerObservation(target, result).state;
  }
  if (result.aborted) {
    return 'unknown';
  }
  const text = String(result.stdout ?? '').trim();
  if (![0, 1].includes(result.code)) {
    return 'unknown';
  }
  const output = `${text}\n${result.stderr ?? ''}`.trim();
  if (result.code === 1 && /^No Sockets found in [^\r\n]+\.$/.test(output)) {
    return 'stopped';
  }
  if (
    result.code !== 0 ||
    !/^There (?:is a screen|are screens) on:\r?\n/.test(output)
  ) {
    return 'unknown';
  }
  const lines = output.split(/\r?\n/);
  const count = lines
    .at(-1)
    .trim()
    .match(/^(\d+) Sockets? in [^\r\n]+\.$/);
  if (!count) {
    return 'unknown';
  }
  const sessions = lines.slice(1, -1).filter((line) => line.trim());
  const parsed = sessions.map((line) =>
    line.trim().match(/^\d+\.([^\s]+)\s+.+\((?:Attached|Detached)\)$/)
  );
  if (Number(count[1]) !== parsed.length || parsed.some((line) => !line)) {
    return 'unknown';
  }
  return parsed.some((line) => line[1] === target.session)
    ? 'running'
    : 'stopped';
};

const applicationCommand = (target) => [
  target.node ?? 'node',
  '--',
  target.cli,
  'serve',
  `--store=${target.store}`,
  `--port=${target.port}`,
  '--open=false',
  '--trust=false',
  '--tls=false',
  '--local-ui=true',
];

export const runnerLaunch = (target) => [
  target.start ?? '$',
  '--isolated',
  target.isolation ?? 'screen',
  '--session',
  target.session,
  '--detached',
  ...(target.isolation === 'docker'
    ? dockerRunnerLaunch(target, applicationCommand(target))
    : ['--', ...applicationCommand(target)]),
];
