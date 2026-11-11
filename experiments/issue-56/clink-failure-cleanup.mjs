// Drop exactly one loopback query to exercise the real reconnect test's
// failure path. The child has a finite two-second observation budget.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const probeClinkFailure = async ({
  observationMs = 2000,
  dropQuery = true,
  debug = '1',
} = {}) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-clink-cleanup-'));
  const preload = path.join(dir, 'drop-query.mjs');
  await writeFile(
    preload,
    `
import net from 'node:net';
const write = net.Socket.prototype.write;
let dropped = ${!dropQuery};
net.Socket.prototype.write = function (chunk, ...args) {
  if (!dropped && chunk === 'a\\n.\\n') {
    dropped = true;
    console.error('[clink-fixture] dropped one query');
    return true;
  }
  return write.call(this, chunk, ...args);
};
`
  );
  const env = { ...process.env, MS_CLINK_DEBUG: debug };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(
    'node',
    [
      '--import',
      preload,
      '--test',
      '--test-concurrency=1',
      '--test-name-pattern=startClinkServer serialises',
      'js/tests/reply-store-clink.test.js',
    ],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  let exceeded = false;
  const timer = setTimeout(() => {
    exceeded = true;
    child.kill('SIGTERM');
  }, observationMs);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    return { ...result, exceededObservation: exceeded, output };
  } finally {
    clearTimeout(timer);
    child.kill('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await probeClinkFailure();
  process.stdout.write(result.output);
  console.log(JSON.stringify({ ...result, output: undefined }));
  assert.match(result.output, /dropped one query/);
  assert.equal(
    result.exceededObservation,
    false,
    'failed reconnect assertion leaked its fixture server'
  );
  assert.equal(
    result.code,
    1,
    'the injected query failure must stay a failure'
  );
  assert.match(result.output, /clink query timed out/);
}
