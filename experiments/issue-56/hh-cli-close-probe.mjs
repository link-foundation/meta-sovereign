/** Finite real CLI probe; drain every owned socket even if legacy close waits. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hhCommonFixture } from './hh-common-fixture.mjs';
import { runCli } from '../../js/src/cli/index.js';
import { openDualStore } from '../../js/src/storage/index.js';
import { fixtureServerClose } from '../../js/tests/helpers/fixture-server.mjs';
import { waitFor } from '../../js/tests/helpers/wait-for.js';

const dir = await mkdtemp(join(tmpdir(), 'ms-hh-cli-close-probe-'));
const fake = hhCommonFixture();
const sockets = new Set();
let unfinishedAccepted = false;
const provider = createServer(async (req, res) => {
  if (req.url === '/_fixture/unfinished') {
    unfinishedAccepted = true;
    return;
  }
  const answer = await fake.fetchImpl(`http://127.0.0.1${req.url}`);
  res.writeHead(answer.status, Object.fromEntries(answer.headers));
  res.end(await answer.text());
});
const closeOwned = fixtureServerClose(provider, 'hh-cli-probe');
provider.on('connection', (socket) => {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
});
const phase = (name, started, extra = {}) =>
  console.log(
    JSON.stringify({
      phase: name,
      elapsedMs: Date.now() - started,
      ownedSockets: sockets.size,
      ...extra,
    })
  );
let closing;
let pending;
try {
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const base = [
    'source-pull',
    '--source=hh',
    '--token=fixture-token',
    `--base-url=http://127.0.0.1:${provider.address().port}`,
    '--limit=2',
    '--max-requests=2',
    `--store=${dir}`,
  ];
  const output = [];
  for (const [index, expected] of [2, 3, 2].entries()) {
    const started = Date.now();
    assert.equal(
      await runCli(index === 2 ? [...base, '--restart-history'] : base, {
        log: (text) => output.push(JSON.parse(text)),
      }),
      0
    );
    assert.equal(output.at(-1).history.messagesRead, expected);
    phase(`cli-${index + 1}`, started);
  }
  const started = Date.now();
  const store = await openDualStore(dir);
  try {
    assert.equal((await store.get('msg:hh:chat:41:2')).outgoing, true);
  } finally {
    await store.close();
  }
  phase('store-verified-and-closed', started);
  if (process.argv.includes('--unfinished-request')) {
    pending = createConnection({
      host: '127.0.0.1',
      port: provider.address().port,
    });
    await new Promise((resolve, reject) => {
      pending.once('connect', resolve);
      pending.once('error', reject);
    });
    pending.write(
      'POST /_fixture/unfinished HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\n\r\n'
    );
    await waitFor(() => unfinishedAccepted, { timeoutMs: 1000 });
    phase('unfinished-request-accepted', Date.now());
  }
  let closed = false;
  const owned = process.argv.includes('--owned-close');
  closing = (
    owned
      ? closeOwned()
      : new Promise((resolve, reject) =>
          provider.close((error) => {
            closed = true;
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          })
        )
  ).then(() => {
    closed = true;
  });
  const closeStarted = Date.now();
  let timer;
  await Promise.race([
    closing,
    new Promise((resolve) => {
      timer = setTimeout(resolve, 500);
    }),
  ]);
  clearTimeout(timer);
  phase('close-observed', closeStarted, { closed, owned });
  if (owned) {
    assert.equal(
      closed,
      true,
      'Owned fixture close waited for an unfinished request'
    );
  }
  for (const socket of sockets) {
    socket.destroy();
  }
  await closing;
  phase('owned-sockets-drained', closeStarted);
} finally {
  pending?.destroy();
  for (const socket of sockets) {
    socket.destroy();
  }
  if (closing) {
    await closing;
  } else if (provider.listening) {
    await new Promise((resolve) => provider.close(resolve));
  }
  await rm(dir, { recursive: true, force: true });
}
