/** Finite native screen/start probe; no application store or owner session is used. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRunnerControl } from '../../js/src/server/runner-control.js';
import { createRunnerTransport } from '../../js/src/server/runner-transport.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-screen-stop-'));
const session = `ms-stop-${process.pid}`;
const sockets = path.join(directory, 'sockets');
await fs.mkdir(sockets, { mode: 0o700 });
const commands = [];
const transport = createRunnerTransport({
  exec: (file, args, options, done) =>
    execFile(
      file,
      args,
      {
        ...options,
        env: {
          ...options.env,
          SCREENDIR: sockets,
          START_APP_FOLDER: path.join(directory, 'start'),
          START_LOG_DIR: path.join(directory, 'logs'),
          START_DISABLE_AUTO_ISSUE: '1',
          START_DISABLE_LOG_UPLOAD: '1',
        },
      },
      done
    ),
});
const run = async (target, args, options) => {
  const began = globalThis.performance.now();
  const result = await transport(target, args, options);
  commands.push({
    command: args[0],
    option: args[1],
    elapsedMs: Math.round(globalThis.performance.now() - began),
    code: result.code,
  });
  return result;
};
const cli = path.join(directory, 'fixture.mjs');
const ready = path.join(directory, 'ready');
const drained = path.join(directory, 'drained');
const target = {
  directory,
  session,
  cli,
  node: process.execPath,
  store: path.join(directory, "owner's store"),
  port: 8787,
};
const control = createRunnerControl({ targets: { local: target }, run });
const until = async (read) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await read()) {
      return;
    }
    await delay(100);
  }
  throw new Error('Native fixture did not complete its bounded operation.');
};
try {
  await fs.writeFile(
    cli,
    `
    import { writeFile } from 'node:fs/promises';
    const keep = setInterval(() => {}, 1000);
    process.once('SIGINT', () => {
      setTimeout(async () => {
        await writeFile(${JSON.stringify(drained)}, 'drained');
        clearInterval(keep);
      }, 3500);
    });
    setTimeout(() => process.exit(2), 15000).unref();
    await writeFile(${JSON.stringify(ready)}, String(process.pid));
  `
  );
  assert.deepEqual((await control.status()).states, {
    local: 'stopped',
    server: 'unconfigured',
  });
  const started = await control.act('start', 'local');
  assert.equal(started.ok, true, JSON.stringify(started));
  await until(() =>
    fs.stat(ready).then(
      () => true,
      () => false
    )
  );
  const began = globalThis.performance.now();
  const stopped = await control.act('stop', 'local');
  const elapsedMs = Math.round(globalThis.performance.now() - began);
  const drainedAtReply = await fs.stat(drained).then(
    () => true,
    () => false
  );
  await until(async () => (await control.status()).states.local === 'stopped');
  console.log(
    JSON.stringify({
      started,
      stopped,
      elapsedMs,
      drainedAtReply,
      final: await control.status(),
      isolated: true,
      liveProvider: false,
      commands,
    })
  );
  assert.equal(stopped.ok, true, 'Stop awaits actual native session drainage');
  assert.equal(drainedAtReply, true, 'Stop acknowledges after fixture cleanup');
} finally {
  // Exact private socket directory and name: never target an owner screen session.
  await run(target, ['screen', '-S', session, '-X', 'quit']);
  await until(async () => (await control.status()).states.local === 'stopped');
  await fs.rm(directory, { recursive: true, force: true });
}
