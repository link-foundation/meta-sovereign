import { encodeWire, readWireResponse, LINO_TEXT } from '../transport/lino.js';
import { runnerReceipt } from '../transport/runner-receipt.js';
import { runnerProfileReceipt } from '../transport/runner-profile-receipt.js';

const validAction = (action, mode) =>
  ['status', 'profile', 'configure'].includes(action)
    ? mode === undefined
    : ['start', 'stop'].includes(action) && ['local', 'server'].includes(mode);

export const requestRunner = async (
  { url, action, mode, signal, document, revision },
  fetchImpl = fetch
) => {
  if (!validAction(action, mode)) {
    throw new Error('Invalid runner action.');
  }
  if (action === 'configure') {
    runnerProfileReceipt({ ok: true, document, revision });
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
      ...(['status', 'profile'].includes(action)
        ? {}
        : {
            method: 'POST',
            body: encodeWire(
              action === 'configure' ? { document, revision } : { mode },
              LINO_TEXT
            ),
          }),
    }
  );
  if (!response.ok) {
    throw new Error('Runner operation unavailable.');
  }
  const value = await readWireResponse(response);
  return ['profile', 'configure'].includes(action)
    ? runnerProfileReceipt(value)
    : runnerReceipt(value, action, mode);
};
