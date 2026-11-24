import {
  dockerRunnerLaunch,
  dockerRunnerObservation,
  dockerRunnerProbe,
} from './runner-docker.js';
import { screenRunnerObservation } from './runner-screen.js';
import { configuredRunnerLauncher } from './runner-dependencies.js';
import { configuredRunnerRuntime } from './runner-node.js';

/** Live backend observations, never a launch wrapper's optimistic exit status. */
export const runnerProbe = (target) =>
  target?.isolation === 'docker'
    ? dockerRunnerProbe(target)
    : ['screen', '-ls'];

export const runnerApplicationAvailable = async (target, run, options) => {
  const result = await run(
    target,
    [
      'sh',
      '-c',
      'test -f "$1" && test -r "$1" && printf readable',
      'runner-application',
      target.cli,
    ],
    options
  );
  return (
    result.code === 0 &&
    result.stdout === 'readable' &&
    !result.stderr?.trim() &&
    !result.aborted
  );
};

export const observedRunnerState = (target, result) =>
  (target.isolation === 'docker'
    ? dockerRunnerObservation(target, result)
    : screenRunnerObservation(target, result)
  ).state;

const applicationCommand = (target, runtime) => [
  runtime.node,
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

export const runnerLaunch = (
  target,
  launcher = configuredRunnerLauncher(target),
  runtime = configuredRunnerRuntime(target)
) => [
  ...launcher,
  '--isolated',
  target.isolation ?? 'screen',
  '--session',
  target.session,
  '--detached',
  ...(target.isolation === 'docker'
    ? dockerRunnerLaunch(target, applicationCommand(target, runtime))
    : ['--', ...applicationCommand(target, runtime)]),
];
