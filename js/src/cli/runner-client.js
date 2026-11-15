import { encodeWire, readWireResponse, LINO_TEXT } from '../transport/lino.js';
import { runnerReceipt } from '../transport/runner-receipt.js';

export const requestRunner = async (
  { url, action, mode, signal },
  fetchImpl = fetch
) => {
  if (
    action === 'status'
      ? mode !== undefined
      : !['start', 'stop'].includes(action) ||
        !['local', 'server'].includes(mode)
  ) {
    throw new Error('Invalid runner action.');
  }
  const origin = new URL(url);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('Runner URL must be an HTTP(S) origin.');
  }
  const response = await fetchImpl(
    new URL(
      action === 'status' ? '/api/runner' : `/api/runner/${action}`,
      origin
    ),
    {
      signal,
      redirect: 'error',
      headers: { accept: LINO_TEXT, 'content-type': LINO_TEXT },
      ...(action === 'status'
        ? {}
        : { method: 'POST', body: encodeWire({ mode }, LINO_TEXT) }),
    }
  );
  if (!response.ok) {
    throw new Error('Runner operation unavailable.');
  }
  return runnerReceipt(await readWireResponse(response), action, mode);
};
