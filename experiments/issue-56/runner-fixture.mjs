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

const isScreenStop = (argv) => argv[0] === 'screen' && argv[1] === '-S';

const fixtureAction = (argv) =>
  argv[0] === 'screen' && argv[1] === '-ls'
    ? 'probe'
    : argv.includes('health')
      ? 'health'
      : argv[1] === '--stop' || isScreenStop(argv)
        ? 'stop'
        : 'start';

const executableProbe = (argv) => {
  if (
    argv[0] === 'sh' &&
    argv[1] === '-c' &&
    ['$', 'node', 'screen', 'docker'].includes(argv.at(-1))
  ) {
    return { code: 0, stdout: 'present' };
  }
  if (argv[0] === '$' && argv[1] === '--version') {
    return { code: 0, stdout: 'start-command version: 0.44.0' };
  }
  if (argv[0] === 'screen' && argv[1] === '-v') {
    return { code: 0, stdout: 'Screen version 4.09.00 (GNU) 30-Jan-22' };
  }
  return null;
};

export const runnerFixture = (
  initial = {},
  { stopFails = [], launchState = 'running', launchCode = 0 } = {}
) => {
  const state = { local: 'stopped', server: 'stopped', ...initial };
  const calls = [];
  const targets = [];
  const health = { local: 'ready', server: 'ready' };
  const application = { local: true, server: true };
  const run = async (target, argv, { signal } = {}) => {
    const mode = target.host ? 'server' : 'local';
    if (argv[0] === 'sh' && argv[3] === 'runner-application') {
      return application[mode] ? { code: 0, stdout: 'readable' } : { code: 1 };
    }
    const executable = executableProbe(argv);
    if (executable) {
      return executable;
    }
    const action = fixtureAction(argv);
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
    if (!application[mode]) {
      return { code: 1 };
    }
    state[mode] = launchState;
    return { code: launchCode };
  };
  return { run, state, health, application, calls, targets };
};
