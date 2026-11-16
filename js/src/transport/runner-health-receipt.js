import { runnerReceipt } from './runner-receipt.js';

const healthStates = new Set(['ready', 'locked', 'degraded', 'unknown']);

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
  return { ...answer, application: { mode, state } };
};
