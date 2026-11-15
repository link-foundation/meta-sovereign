const states = new Set(['unconfigured', 'stopped', 'running', 'unknown']);
const refusals = new Set([
  'invalid-runner-action',
  'runner-profile-change-blocked',
  'runner-profile-unavailable',
  'runner-state-unconfirmed',
  'other-runner-stop-unconfirmed',
  'runner-start-unconfirmed',
  'runner-unconfigured',
  'runner-stop-unconfirmed',
  'runner-control-unconfirmed',
]);

const valid = (value) =>
  !(
    typeof value?.ok !== 'boolean' ||
    value.scope !== 'isolated-session' ||
    !states.has(value.states?.local) ||
    !states.has(value.states?.server) ||
    (value.code !== undefined && !refusals.has(value.code))
  );
const confirmed = (value, action, mode) => {
  const other = mode === 'local' ? 'server' : 'local';
  return (
    value.states[mode] === (action === 'start' ? 'running' : 'stopped') &&
    (action !== 'start' ||
      ['stopped', 'unconfigured'].includes(value.states[other]))
  );
};

/** Project known fields; remote diagnostics must not leak into CLI/UI output. */
export const runnerReceipt = (value, action, mode) => {
  if (!valid(value)) {
    throw new Error('Runner state unavailable.');
  }
  if (
    value.ok &&
    value.code !== undefined &&
    (action !== 'status' ||
      !['runner-profile-change-blocked', 'runner-profile-unavailable'].includes(
        value.code
      ))
  ) {
    throw new Error('Contradictory runner receipt.');
  }
  if (value.ok && action !== 'status') {
    if (!confirmed(value, action, mode)) {
      throw new Error('Runner action was not confirmed.');
    }
  }
  return {
    ok: value.ok,
    scope: value.scope,
    states: { local: value.states.local, server: value.states.server },
    ...(value.code === undefined ? {} : { code: value.code }),
  };
};
