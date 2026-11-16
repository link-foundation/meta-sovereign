import { runnerReceipt } from '../transport/runner-receipt.js';

/** The wire bridge encodes Lino; every mutation is issued once. */
export const createRunnerApi = ({ serverResponse }) => ({
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
