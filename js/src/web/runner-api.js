import { runnerReceipt } from '../transport/runner-receipt.js';
import { runnerProfileReceipt } from '../transport/runner-profile-receipt.js';

/** The wire bridge encodes Lino; every mutation is issued once. */
export const createRunnerApi = ({ serverResponse }) => ({
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
        : !['start', 'stop'].includes(action) ||
          !['local', 'server'].includes(mode)
    ) {
      throw new Error('Invalid runner action.');
    }
    const response = await serverResponse(
      action === 'status' ? '/api/runner' : `/api/runner/${action}`,
      {
        signal,
        ...(action === 'status'
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
    return runnerReceipt(await response.json(), action, mode);
  },
});
