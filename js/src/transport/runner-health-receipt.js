import { runnerReceipt } from './runner-receipt.js';

const healthStates = new Set(['ready', 'locked', 'degraded', 'unknown']);
const backendStates = new Set(['ready', 'missing', 'unavailable', 'unknown']);

export const runnerHealthReceipt = (value) => {
  if (
    value?.scope !== 'application-worker' ||
    !healthStates.has(value.state) ||
    value.ok !== (value.state !== 'unknown')
  ) {
    throw new Error('Application health was not confirmed.');
  }
  return { ok: value.ok, scope: value.scope, state: value.state };
};

export const runnerInspectionReceipt = (value, mode) => {
  if (!['local', 'server'].includes(mode)) {
    throw new Error('Invalid runner selection.');
  }
  const answer = runnerReceipt(value, 'status');
  const backend = value.backend;
  const state = value.application?.state;
  const session = answer.states[mode];
  const expected = ['stopped', 'unconfigured'].includes(session)
    ? state === session
    : healthStates.has(state);
  if (
    value.application?.mode !== mode ||
    !expected ||
    answer.ok !== (state !== 'unknown')
  ) {
    throw new Error('Application inspection was not confirmed.');
  }
  if (
    backend !== undefined &&
    (session !== 'unknown' ||
      !['screen', 'docker'].includes(backend?.kind) ||
      !backendStates.has(backend?.state))
  ) {
    throw new Error('Runner backend inspection was not confirmed.');
  }
  return {
    ...answer,
    application: { mode, state },
    ...(backend
      ? { backend: { kind: backend.kind, state: backend.state } }
      : {}),
  };
};
