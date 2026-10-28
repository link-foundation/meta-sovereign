import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { fixtureServerClose } from './helpers/fixture-server.mjs';
import { waitFor } from './helpers/wait-for.js';

for (const protocol of ['tcp', 'http']) {
  test(
    `${protocol} fixture closes while its client is unfinished`,
    { timeout: 5000 },
    async () => {
      let requested = false;
      const server =
        protocol === 'http'
          ? http.createServer(() => {
              requested = true;
            })
          : net.createServer();
      const close = fixtureServerClose(server, protocol);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const socket = net.createConnection({
        host: '127.0.0.1',
        port: server.address().port,
      });
      let closing;
      let timer;
      try {
        await new Promise((resolve, reject) => {
          socket.once('connect', resolve);
          socket.on('error', reject);
        });
        if (protocol === 'http') {
          socket.write(
            'POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\n\r\n'
          );
          await waitFor(() => requested, { timeoutMs: 1000 });
        }
        closing = close();
        await Promise.race([
          closing,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Fixture waited for its client')),
              500
            );
          }),
        ]);
        await waitFor(() => socket.destroyed, { timeoutMs: 1000 });
        assert.equal(socket.destroyed, true);
      } finally {
        clearTimeout(timer);
        socket.destroy();
        await (closing ?? close());
      }
    }
  );
}
