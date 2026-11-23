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
  const imageId = `sha256:${'a'.repeat(64)}`;
  let image = options.image ?? 'present';
  let keepContainer = true;
  const run = async (target, argv, supplied) => {
    calls.push(argv);
    if (target.isolation !== 'docker') {
      return screen.run(target, argv, supplied);
    }
    if (argv[1] === 'image') {
      if (argv[2] === 'pull') {
        image = options.imageAfterPull ?? 'present';
        return { code: options.pullExit ?? 0 };
      }
      if (image === 'present') {
        return { code: 0, stdout: `${imageId}\n` };
      }
      const stderr =
        image === 'missing'
          ? `Error response from daemon: No such image: ${target.image}\n`
          : 'Docker daemon unavailable';
      return { code: 1, stdout: '\n', stderr };
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
      // start-command removes successful exits unless explicitly retained.
      container = keepContainer ? 'exited' : 'missing';
    } else {
      keepContainer = argv.includes('--keep-container');
      container = options.launchState ?? 'running';
    }
    return { code: options.launchCode ?? 0 };
  };
  return { screen, run, calls, imageId };
};
