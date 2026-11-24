import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Verify the existing wrappers still initialize and drain through the shared owner.
for (const name of ['application-salary', 'salary-ladder']) {
  const child = spawn(
    process.execPath,
    [new URL(`./${name}-mcp-server.mjs`, import.meta.url).pathname],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const output = [];
  let errors = '';
  let ready = false;
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    output.push(line);
    if (line.startsWith('{') && JSON.parse(line).base) {
      ready = true;
      child.stdin.end('stop\n');
    }
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), 60000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(code, 0, `${name}: ${errors}`);
    assert(ready, `${name} never initialized`);
    assert.deepEqual(JSON.parse(output.at(-1)), {
      resourcesClosed: true,
      liveProvider: false,
    });
    console.log(JSON.stringify({ name, ready, resourcesClosed: true }));
  } finally {
    clearTimeout(timer);
    lines.close();
  }
}
