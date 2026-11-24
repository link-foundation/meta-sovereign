import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';

// Recover one owned fixture launched with a closed stdin. Never target an app.
const pid = Number(process.argv[2]);
assert.ok(Number.isInteger(pid) && pid > 1);
const command = await readFile(`/proc/${pid}/cmdline`, 'utf8');
assert.ok(
  command.includes('experiments/issue-56/vacancy-corpus-mcp-server.mjs')
);
await assert.rejects(fetch('http://127.0.0.1:9229/json/list'));
process.kill(pid, 'SIGUSR1');
let endpoint;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    endpoint = (
      await (await fetch('http://127.0.0.1:9229/json/list')).json()
    )[0];
    break;
  } catch {
    await pause(100);
  }
}
assert.ok(
  endpoint?.url.endsWith('/experiments/issue-56/vacancy-corpus-mcp-server.mjs')
);
const connection = new globalThis.WebSocket(endpoint.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  connection.addEventListener('error', reject, { once: true });
  connection.addEventListener(
    'open',
    () =>
      connection.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression:
              "setImmediate(() => process.stdin.emit('data', Buffer.from('\\n'))); 'draining'",
          },
        })
      ),
    { once: true }
  );
  connection.addEventListener('message', (event) => {
    const result = JSON.parse(event.data);
    if (result.id === 1) {
      connection.close();
      if (result.result?.result?.value === 'draining') {
        resolve();
      } else {
        reject(new Error(JSON.stringify(result)));
      }
    }
  });
});
console.log(JSON.stringify({ pid, normalFixtureDrainRequested: true }));
