import {
  LINO_BINARY,
  LINO_TEXT,
  encodeWire,
  readWireResponse,
} from '../transport/lino.js';

export const localOrSecureOrigin = (value) => {
  const url = new URL(value ?? 'http://127.0.0.1:8787');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return url;
};

export const cliServerClient = (origin, binary) => {
  const type = binary ? LINO_BINARY : LINO_TEXT;
  return async (path, body) => {
    const response = await fetch(new URL(path, origin), {
      redirect: 'error',
      headers: {
        accept: type,
        ...(body === undefined ? {} : { 'content-type': type }),
      },
      ...(body === undefined
        ? {}
        : { method: 'POST', body: encodeWire(body, type) }),
    });
    return {
      ok: response.ok,
      status: response.status,
      answer: await readWireResponse(response),
    };
  };
};
