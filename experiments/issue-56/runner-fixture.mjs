/** Finite backend fixture: no installed screen, provider, SSH account or server. */
import { encodeWire, LINO_TEXT } from '../../js/src/transport/lino.js';
export const runnerProfile = () => ({
  session: 'meta-sovereign-test',
  local: {
    directory: '/fixture/local',
    cli: '/fixture/local/cli.js',
    store: '/fixture/local/store',
    port: 8123,
  },
  server: {
    host: 'fixture@example.invalid',
    directory: '/fixture/remote',
    cli: '/fixture/remote/cli.js',
    store: '/fixture/remote/store',
    port: 8124,
  },
});

export const screenResult = (state, session = 'meta-sovereign-test') => {
  if (state === 'unknown') {
    return { code: 255, stdout: '', stderr: 'PRIVATE transport failure' };
  }
  return state === 'stopped'
    ? {
        code: 1,
        stdout: 'No Sockets found in /run/screen/S-fixture.\n',
        stderr: '',
      }
    : {
        code: 0,
        stdout: `There is a screen on:\n\t123.${session}\t(11/15/26 12:00:00)\t(Detached)\n1 Socket in /run/screen/S-fixture.\n`,
        stderr: '',
      };
};

export const runnerFixture = (
  initial = {},
  { stopFails = [], launchState = 'running', launchCode = 0 } = {}
) => {
  const state = { local: 'stopped', server: 'stopped', ...initial };
  const calls = [];
  const targets = [];
  const health = { local: 'ready', server: 'ready' };
  const run = async (target, argv, { signal } = {}) => {
    const mode = target.host ? 'server' : 'local';
    const action =
      argv[0] === 'screen'
        ? 'probe'
        : argv.includes('health')
          ? 'health'
          : argv[1] === '--stop'
            ? 'stop'
            : 'start';
    calls.push([mode, action]);
    targets.push(target);
    if (signal?.aborted) {
      return { code: 'ABORT_ERR', aborted: true, stdout: '', stderr: '' };
    }
    if (action === 'probe') {
      return screenResult(state[mode], target.session);
    }
    if (action === 'health') {
      return {
        code: health[mode] === 'unknown' ? 1 : 0,
        stdout: encodeWire(
          {
            ok: health[mode] !== 'unknown',
            scope: 'application-worker',
            state: health[mode],
          },
          LINO_TEXT
        ),
      };
    }
    if (action === 'stop') {
      if (!stopFails.includes(mode)) {
        state[mode] = 'stopped';
      }
      return { code: 0 };
    }
    state[mode] = launchState;
    return { code: launchCode };
  };
  return { run, state, health, calls, targets };
};
