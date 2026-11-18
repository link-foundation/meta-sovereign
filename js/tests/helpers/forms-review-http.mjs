import { startServer } from '../../src/server/index.js';
import { encodeWire, readWireResponse } from '../../src/transport/lino.js';

/** An isolated forms server with the same negotiated transport as the UI. */
export const formReviewHttp = async (options, media) => {
  const server = await startServer({
    ...options,
    port: 0,
    localUi: false,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
    forms: options,
    log: null,
  });
  const base = `http://127.0.0.1:${server.port}`;
  const post = async (action, body, headers = {}) =>
    readWireResponse(
      await fetch(`${base}/api/forms/sessions/${action}`, {
        method: 'POST',
        headers: { 'content-type': media, accept: media, ...headers },
        body: encodeWire(body, media),
      })
    );
  return { server, base, post };
};
