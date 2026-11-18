import { runnerFixture, runnerProfile } from './runner-fixture.mjs';

export const dockerProfile = () => {
  const profile = runnerProfile();
  profile.server.isolation = 'docker';
  profile.server.image = 'registry.example/owner/runtime:26';
  return profile;
};
export const dockerResult = (state, session = 'meta-sovereign-test') => ({
  code: 0,
  stdout:
    state === 'missing'
      ? ''
      : `abcdef123456\t${session}\t${state}\t${session}\n`,
  stderr: '',
});

/** Exercise the shared controller without a daemon, SSH account or provider. */
export const dockerFixture = ({ container = 'missing', ...options } = {}) => {
  const screen = runnerFixture(options.initial);
  const calls = [];
  const run = async (target, argv, supplied) => {
    calls.push(argv);
    if (target.isolation !== 'docker') {
      return screen.run(target, argv, supplied);
    }
    if (argv[2] === 'ls') {
      return dockerResult(container, target.session);
    }
    if (argv[2] === 'rm') {
      if (options.refuseRemove) {
        return { code: 1 };
      }
      container = 'missing';
    } else if (argv[2] === 'stop') {
      container = 'exited';
    } else {
      container = options.launchState ?? 'running';
    }
    return { code: options.launchCode ?? 0 };
  };
  return { screen, run, calls };
};
