// Legacy JSON fixtures remain readable; real browser traffic uses Lino.
import {
  LINO_TEXT,
  encodeWire,
  decodeWire,
  readWireResponse,
} from '../../src/transport/lino.js';

export const createWirePost =
  (base, endpoint, type) =>
  async (path, body, origin = base) => {
    const response = await fetch(`${base}${endpoint}${path}`, {
      method: 'POST',
      headers: { 'content-type': type, accept: type, origin },
      body: encodeWire(body, type),
    });
    return {
      status: response.status,
      answer: await readWireResponse(response),
    };
  };

export const requestBody = (request) =>
  decodeWire(
    request.postDataBuffer() ?? new Uint8Array(),
    request.headers()['content-type'],
    { jsonCompatibility: true }
  );

export const fulfilWire = (route, options) => {
  const type = options.contentType ?? options.headers?.['content-type'];
  if (type?.startsWith('application/json')) {
    options = {
      ...options,
      contentType: LINO_TEXT,
      headers: { ...options.headers, 'content-type': LINO_TEXT },
      body: encodeWire(JSON.parse(options.body)),
    };
  }
  return route.fulfill(options);
};
