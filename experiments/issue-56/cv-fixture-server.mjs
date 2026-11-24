import { startServer } from '../../js/src/server/index.js';
import { encodeWire, readWireResponse } from '../../js/src/transport/lino.js';

/** Disposable CV servers never launch real providers or the user's server. */
export const startCvFixtureServer = (options) =>
  startServer({
    ...options,
    port: 0,
    tls: false,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    automations: { scheduler: false },
  });

export const cvFixtureRequest =
  (base, reads) => async (operation, type, input, origin) => {
    const read = reads.includes(operation);
    const response = await fetch(
      `${base}${operation}${read ? `?${new URLSearchParams(input)}` : ''}`,
      {
        method: read ? 'GET' : 'POST',
        headers: {
          accept: type,
          ...(read ? {} : { 'content-type': type }),
          ...(origin ? { origin } : {}),
        },
        ...(read ? {} : { body: encodeWire(input, type) }),
      }
    );
    return { response, row: await readWireResponse(response) };
  };

export const waitForCvFixtureShutdown = async (fixture) => {
  console.log(JSON.stringify({ base: fixture.base, synthetic: true }));
  await new Promise((finish) => {
    const stop = async () => {
      await fixture.close();
      finish();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
};
