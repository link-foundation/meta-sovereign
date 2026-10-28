import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startFakeGithub } from './helpers/fake-github.mjs';
import { waitFor } from './helpers/wait-for.js';

const connect = (port) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => resolve(socket));
    socket.on('error', reject);
  });

test(
  'fake GitHub closes owned connections without waiting for clients',
  { timeout: 5000 },
  async () => {
    const fake = await startFakeGithub();
    const port = Number(new URL(fake.baseUrl).port);
    const socket = await connect(port);
    let closing;
    let timer;
    try {
      // Headers reach the fixture, but the client deliberately never sends its
      // body. server.close alone waits for the client or the runtime deadline.
      socket.write(
        'POST /unfinished HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\n\r\n'
      );
      await waitFor(() => fake.state.requests.length === 1, {
        timeoutMs: 1000,
      });
      closing = fake.close();
      await Promise.race([
        closing,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Fixture shutdown waited for its client')),
            500
          );
        }),
      ]);
      await waitFor(() => socket.destroyed, { timeoutMs: 1000 });
      assert.equal(socket.destroyed, true);
    } finally {
      clearTimeout(timer);
      socket.destroy();
      await (closing ?? fake.close());
    }
  }
);
