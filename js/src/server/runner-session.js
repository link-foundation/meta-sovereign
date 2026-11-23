import {
  dockerRunnerLaunch,
  dockerRunnerObservation,
  dockerRunnerProbe,
} from './runner-docker.js';
import { screenRunnerObservation } from './runner-screen.js';
import { configuredRunnerLauncher } from './runner-dependencies.js';

/** Live backend observations, never a launch wrapper's optimistic exit status. */
export const runnerProbe = (target) =>
  target?.isolation === 'docker'
    ? dockerRunnerProbe(target)
    : ['screen', '-ls'];

export const observedRunnerState = (target, result) =>
  (target.isolation === 'docker'
    ? dockerRunnerObservation(target, result)
    : screenRunnerObservation(target, result)
  ).state;

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

export const runnerLaunch = (
  target,
  launcher = configuredRunnerLauncher(target)
) => [
  ...launcher,
  '--isolated',
  target.isolation ?? 'screen',
  '--session',
  target.session,
  '--detached',
  ...(target.isolation === 'docker'
    ? dockerRunnerLaunch(target, applicationCommand(target))
    : ['--', ...applicationCommand(target)]),
];
