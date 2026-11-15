const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const FAILURES = new Set([
  'invalid-token-input',
  'invalid-token-redirect',
  'authorization-refused',
  'authorization-navigation-refused',
  'authorization-unavailable',
  'authorization-cleanup-failed',
  'invalid-user-token',
  'token-account-mismatch',
  'token-save-failed',
  'authorization-failed',
]);
const only = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));
const identity = (value) =>
  only(value, ['id', 'name', 'messages', 'offline']) &&
  /^[1-9][0-9]{0,15}$/.test(value.id ?? '') &&
  typeof value.name === 'string' &&
  value.name.length <= 200 &&
  typeof value.messages === 'boolean' &&
  typeof value.offline === 'boolean';
const stateFields = (value) => {
  if (value.state === 'idle') {
    return (
      value.id === null &&
      value.code === undefined &&
      value.identity === undefined
    );
  }
  if (!UUID.test(value.id ?? '')) {
    return false;
  }
  if (value.state === 'saved') {
    return (
      identity(value.identity) &&
      value.code === (value.identity.messages ? 'saved' : 'saved-no-messages')
    );
  }
  if (value.identity !== undefined) {
    return false;
  }
  if (['waiting', 'validating'].includes(value.state)) {
    return value.code === undefined;
  }
  return value.state === 'failed'
    ? FAILURES.has(value.code)
    : value.state === 'cancelled' &&
        ['authorization-expired', 'authorization-cancelled'].includes(
          value.code
        );
};
/** Reject unknown public fields before CLI or UI renders an untrusted receipt. */
export const isVkTokenStatus = (value) =>
  Boolean(
    only(value, ['ok', 'state', 'id', 'code', 'identity', 'capabilities']) &&
    value.ok === true &&
    only(value.capabilities, ['authorize', 'protectedStorage']) &&
    typeof value.capabilities.authorize === 'boolean' &&
    typeof value.capabilities.protectedStorage === 'boolean' &&
    stateFields(value)
  );

export const VK_TOKEN_REFUSALS = new Set([
  'invalid-token-input',
  'invalid-token-redirect',
  'confirmation-required',
  'protected-storage-required',
  'authorization-unavailable',
  'authorization-busy',
  'authorization-closed',
  'authorization-not-current',
  'authorization-refused',
  'invalid-token-request',
  'app-origin-required',
  'method-not-allowed',
]);
export const isVkTokenRefusal = (value) =>
  Boolean(
    only(value, ['ok', 'code', 'error']) &&
    (value.error === undefined ||
      /^request failed \([45][0-9]{2}\)$/.test(value.error)) &&
    value.ok === false &&
    VK_TOKEN_REFUSALS.has(value.code)
  );
