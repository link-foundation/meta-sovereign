// Apply only at our server boundary: provider APIs keep their own protocols.
import {
  LINO_TEXT,
  JSON_MEDIA,
  mediaType,
  encodeWire,
  readWireResponse,
} from './lino.js';

export const WIRE_RESPONSE = Symbol('lino-response');

const wrapResponse = (response, options) =>
  new Proxy(response, {
    get(target, key) {
      if (key === WIRE_RESPONSE) {
        return options;
      }
      if (key === 'json') {
        return () => readWireResponse(target, options);
      }
      if (key === 'clone') {
        return () => wrapResponse(target.clone(), options);
      }
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

// Existing callers pass structured objects through JSON.stringify. Convert at
// this boundary while retaining Response's raw bytes, streams and clone rules.
export const createLinoFetch =
  (fetchImpl, { type = LINO_TEXT, jsonCompatibility = false } = {}) =>
  async (url, init = {}) => {
    const headers = new globalThis.Headers(init.headers);
    headers.set('accept', type);
    let body = init.body;
    if (
      body !== undefined &&
      mediaType(headers.get('content-type')) === JSON_MEDIA
    ) {
      body = encodeWire(JSON.parse(body), type, { jsonCompatibility });
      headers.set('content-type', type);
    }
    const response = await fetchImpl(url, { ...init, headers, body });
    return wrapResponse(response, { jsonCompatibility });
  };
