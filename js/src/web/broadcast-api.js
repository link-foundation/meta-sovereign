import { broadcastOutcome } from '../broadcast/outcomes.js';

// Once a write leaves the browser, a lost response cannot prove non-delivery.
// Keep this separate from read recovery: publishing must never auto-retry.
export const createBroadcastApi =
  (postConfirmed) => async (text, networks, ask) => {
    const result = await postConfirmed(
      '/api/broadcast',
      { text, networks },
      ask,
      { network: true }
    );
    if (!result) {
      return {
        status: 'unavailable',
        code: 'server-required',
        body: text,
        results: [],
      };
    }
    if (result.code !== 'network') {
      return { body: text, ...result };
    }
    const results = networks.map((network) => ({
      network,
      status: 'unknown',
      error: result.error,
    }));
    return {
      ...result,
      body: text,
      networks,
      results,
      ...broadcastOutcome(results),
    };
  };
