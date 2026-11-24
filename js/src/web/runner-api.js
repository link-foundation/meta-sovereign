import {
  runnerReceipt,
  runnerRequestPath,
} from '../transport/runner-receipt.js';
import { runnerProfileReceipt } from '../transport/runner-profile-receipt.js';
import { runnerInspectionReceipt } from '../transport/runner-health-receipt.js';
import {
  runnerDeploymentAction,
  runnerDeploymentReceipt,
} from '../transport/runner-deployment-receipt.js';

/** The wire bridge encodes Lino; every mutation is issued once. */
export const createRunnerApi = ({ serverResponse }) => ({
  runnerDeploymentRequest: async (action, mode, revision, signal) => {
    if (
      !runnerDeploymentAction(action) ||
      !['local', 'server'].includes(mode)
    ) {
      throw new Error('Invalid runner source action.');
    }
    const response = await serverResponse(
      runnerRequestPath(action, mode),
      {
        signal,
        ...(action === 'deploy'
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ mode, revision }),
            }
          : {}),
      },
      { network: true, recover: false }
    );
    if (!response?.ok) {
      throw new Error('Runner source was not confirmed.');
    }
    return runnerDeploymentReceipt(await response.json(), action, mode);
  },
  runnerProfileRequest: async (action, input, signal) => {
    if (!['profile', 'configure'].includes(action)) {
      throw new Error('Invalid runner profile action.');
    }
    if (action === 'configure') {
      runnerProfileReceipt({ ok: true, ...input });
    }
    const response = await serverResponse(
      `/api/runner/${action}`,
      {
        signal,
        ...(action === 'configure'
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(input),
            }
          : {}),
      },
      { network: true, recover: false }
    );
    if (!response?.ok) {
      throw new Error('Runner profile was not confirmed.');
    }
    return runnerProfileReceipt(await response.json());
  },
  runnerRequest: async (action, mode, signal) => {
    if (
      action === 'status'
        ? mode !== undefined
        : !['start', 'stop', 'inspect'].includes(action) ||
          !['local', 'server'].includes(mode)
    ) {
      throw new Error('Invalid runner action.');
    }
    const response = await serverResponse(
      runnerRequestPath(action, mode),
      {
        signal,
        ...(['status', 'inspect'].includes(action)
          ? {}
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ mode }),
            }),
      },
      { network: true, recover: false }
    );
    if (!response?.ok) {
      throw new Error('Runner operation unavailable.');
    }
    const value = await response.json();
    return action === 'inspect'
      ? runnerInspectionReceipt(value, mode)
      : runnerReceipt(value, action, mode);
  },
});
