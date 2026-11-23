import {
  runnerLaunch,
  runnerProbe,
  observedRunnerState,
} from './runner-session.js';
import { runRunnerCommand } from './runner-transport.js';
import { prepareDockerRunner, stopDockerRunner } from './runner-docker.js';
import { stopScreenRunner } from './runner-screen.js';
import { setTimeout as delay } from 'node:timers/promises';
import { configuredRunnerLauncher } from './runner-dependencies.js';
import { configuredRunnerRuntime } from './runner-node.js';

const refused = (code, states) => ({ ok: false, code, states });
const cancelled = (options) => options.signal?.aborted === true;
const startReceipt = (reply, mode, current, options) =>
  reply.code === 0 && current[mode] === 'running' && !cancelled(options)
    ? { ok: true, states: current }
    : refused('runner-start-unconfirmed', current);
const prepareRunner = async (target, run, options) => {
  if (
    target.isolation === 'docker' &&
    !(await prepareDockerRunner(target, run, options))
  ) {
    return false;
  }
  return !cancelled(options);
};

/** The caller owns a cross-process controller lease for each mutation. */
export const createRunnerControl = ({
  targets,
  run = runRunnerCommand,
  prepareLauncher = configuredRunnerLauncher,
  prepareRuntime = configuredRunnerRuntime,
  now = () => globalThis.performance.now(),
  pause = delay,
  trace = (event) => {
    if (process.env.MS_RUNNER_CONTROL_DEBUG === '1') {
      console.error(`[runner-control] ${event}`);
    }
  },
}) => {
  const observe = async (mode, options) => {
    const target = targets[mode];
    if (!target) {
      return 'unconfigured';
    }
    try {
      return observedRunnerState(
        target,
        await run(target, runnerProbe(target), options)
      );
    } catch {
      return 'unknown';
    }
  };
  const states = async (options) => ({
    local: await observe('local', options),
    server: await observe('server', options),
  });
  const stop = async (mode, current, options) => {
    if (current[mode] === 'stopped') {
      return true;
    }
    if (current[mode] !== 'running') {
      return false;
    }
    const target = targets[mode];
    if (target.isolation === 'docker') {
      await stopDockerRunner(target, run, options);
    } else {
      await stopScreenRunner(target, run, options);
    }
    const deadline = now() + 10000;
    current[mode] = await observe(mode, options);
    // start-command acknowledges the signal, not the application's cleanup.
    // Keep the controller lease until the exact session disappears or refuses.
    while (
      current[mode] === 'running' &&
      !cancelled(options) &&
      now() < deadline
    ) {
      trace('stop-wait');
      await pause(Math.min(100, deadline - now()), undefined, {
        signal: options.signal,
      });
      current[mode] = await observe(mode, options);
    }
    trace(current[mode] === 'stopped' ? 'stop-stopped' : 'stop-unconfirmed');
    return current[mode] === 'stopped';
  };
  const prepareStart = async (target, options) => {
    const runtime = await prepareRuntime(target, {
      ...options,
      installMissing: true,
    });
    if (cancelled(options)) {
      return { code: 'runner-state-unconfirmed' };
    }
    if (!runtime) {
      return { code: 'runner-runtime-unavailable' };
    }
    const launcher = await prepareLauncher(target, options, runtime);
    if (!launcher) {
      return { code: 'runner-launcher-unavailable' };
    }
    if (!(await prepareRunner(target, run, options))) {
      return { code: 'runner-state-unconfirmed' };
    }
    return { launcher, runtime };
  };
  const start = async (mode, current, options) => {
    if (!['running', 'stopped'].includes(current[mode]) || cancelled(options)) {
      return refused('runner-state-unconfirmed', current);
    }
    const other = mode === 'local' ? 'server' : 'local';
    if (current[other] === 'unknown') {
      return refused('other-runner-stop-unconfirmed', current);
    }
    const target = targets[mode];
    let prepared;
    if (current[mode] === 'stopped') {
      prepared = await prepareStart(target, options);
      if (prepared.code) {
        return refused(prepared.code, await states(options));
      }
    }
    if (cancelled(options)) {
      return refused('runner-state-unconfirmed', current);
    }
    if (
      current[other] !== 'unconfigured' &&
      !(await stop(other, current, options))
    ) {
      return refused('other-runner-stop-unconfirmed', current);
    }
    if (cancelled(options)) {
      return refused('runner-state-unconfirmed', current);
    }
    // A stop may also affect this target (e.g. SSH points to this machine).
    current[mode] = await observe(mode, options);
    current[other] = await observe(other, options);
    if (!['stopped', 'unconfigured'].includes(current[other])) {
      return refused('other-runner-stop-unconfirmed', current);
    }
    if (cancelled(options)) {
      return refused('runner-state-unconfirmed', current);
    }
    if (current[mode] === 'running') {
      return { ok: true, states: current };
    }
    if (current[mode] !== 'stopped' || cancelled(options)) {
      return refused('runner-state-unconfirmed', current);
    }
    prepared ??= await prepareStart(target, options);
    if (prepared.code) {
      return refused(prepared.code, await states(options));
    }
    if (cancelled(options)) {
      return refused('runner-state-unconfirmed', await states(options));
    }
    const reply = await run(
      target,
      runnerLaunch(target, prepared.launcher, prepared.runtime),
      options
    );
    current[mode] = await observe(mode, options);
    // Launching can reveal a shared backend or a concurrently changed peer.
    current[other] = await observe(other, options);
    if (!['stopped', 'unconfigured'].includes(current[other])) {
      return refused('other-runner-stop-unconfirmed', current);
    }
    return startReceipt(reply, mode, current, options);
  };
  return {
    status: async (options) => ({ ok: true, states: await states(options) }),
    async act(action, mode, options = {}) {
      if (
        !['start', 'stop'].includes(action) ||
        !['local', 'server'].includes(mode)
      ) {
        return refused('invalid-runner-action');
      }
      const current = await states(options);
      if (!targets[mode]) {
        return refused('runner-unconfigured', current);
      }
      try {
        if (action === 'stop') {
          return (await stop(mode, current, options))
            ? { ok: true, states: current }
            : refused('runner-stop-unconfirmed', current);
        }
        return await start(mode, current, options);
      } catch {
        return refused('runner-control-unconfirmed', await states(options));
      }
    },
  };
};
