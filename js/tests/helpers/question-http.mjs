import { encodeWire, readWireResponse } from '../../src/transport/lino.js';

/** Exercise the real negotiated question routes and retain their status. */
export const postQuestion = async (base, action, body, media, headers = {}) => {
  const response = await fetch(`${base}/api/automations/answers/${action}`, {
    method: 'POST',
    headers: { accept: media, 'content-type': media, ...headers },
    body: encodeWire(body, media),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type')?.split(';')[0],
    body: await readWireResponse(response),
  };
};
