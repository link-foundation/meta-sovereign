import {
  runnerLaunch,
  runnerProbe,
  observedRunnerState,
} from './runner-session.js';
import { runRunnerCommand } from './runner-transport.js';

const refused = (code, states) => ({ ok: false, code, states });

/** The caller owns a cross-process controller lease for each mutation. */
export const createRunnerControl = ({ targets, run = runRunnerCommand }) => {
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
    await run(target, [target.start ?? '$', '--stop', target.session], options);
    current[mode] = await observe(mode, options);
    return current[mode] === 'stopped';
  };
  const start = async (mode, current, options) => {
    if (
      !['running', 'stopped'].includes(current[mode]) ||
      options.signal?.aborted
    ) {
      return refused('runner-state-unconfirmed', current);
    }
    const other = mode === 'local' ? 'server' : 'local';
    if (
      current[other] !== 'unconfigured' &&
      !(await stop(other, current, options))
    ) {
      return refused('other-runner-stop-unconfirmed', current);
    }
    if (options.signal?.aborted) {
      return refused('runner-state-unconfirmed', current);
    }
    // A stop may also affect this target (e.g. SSH points to this machine).
    current[mode] = await observe(mode, options);
    if (current[mode] === 'running') {
      return { ok: true, states: current };
    }
    if (current[mode] !== 'stopped' || options.signal?.aborted) {
      return refused('runner-state-unconfirmed', current);
    }
    const reply = await run(
      targets[mode],
      runnerLaunch(targets[mode]),
      options
    );
    current[mode] = await observe(mode, options);
    return reply.code === 0 && current[mode] === 'running'
      ? { ok: true, states: current }
      : refused('runner-start-unconfirmed', current);
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
