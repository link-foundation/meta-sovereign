import { lookupRunnerExecutable } from './runner-node.js';
import { runRunnerCommand } from './runner-transport.js';

const backendProbe = {
  screen: {
    args: ['-v'],
    accepts: /^Screen version \d+(?:\.\d+){1,3}(?: \(GNU\))? [^\r\n]{1,80}$/u,
  },
  docker: {
    args: ['info', '--format', '{{json .ServerVersion}}'],
    accepts: /^"\d+(?:\.\d+){1,3}[0-9A-Za-z.+-]{0,48}"$/u,
  },
};

const backendResponded = (probe, { code, stdout, stderr, aborted }) =>
  code === 0 &&
  !aborted &&
  !stderr?.trim() &&
  probe.accepts.test(stdout?.trim());

/** Read isolation availability even when the application checkout is absent. */
export const inspectRunnerBackend = async (
  target,
  run = runRunnerCommand,
  options = {}
) => {
  const kind = target?.isolation;
  const probe = Object.hasOwn(backendProbe, kind) ? backendProbe[kind] : null;
  if (!probe || (!target.host && process.platform === 'win32')) {
    return undefined;
  }
  const host = { ...target, directory: '/' };
  const outcome = (state) => ({ kind, state });
  try {
    const executable = await lookupRunnerExecutable(run, host, kind, options);
    if (executable !== 'present') {
      return outcome(executable === 'missing' ? 'missing' : 'unknown');
    }
    const result = await run(host, [kind, ...probe.args], options);
    return outcome(backendResponded(probe, result) ? 'ready' : 'unavailable');
  } catch {
    return outcome('unknown');
  }
};
