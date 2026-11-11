import { encodeWire, readWireResponse } from '../../src/transport/lino.js';

/** Exercise the real negotiated question routes and retain their status. */
export const postQuestion = async (base, action, body, media) => {
  const response = await fetch(`${base}/api/automations/answers/${action}`, {
    method: 'POST',
    headers: { accept: media, 'content-type': media },
    body: encodeWire(body, media),
  });
  return { status: response.status, body: await readWireResponse(response) };
};
