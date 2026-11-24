import assert from 'node:assert/strict';
import { readFile, readlink } from 'node:fs/promises';

// Recover only this owned fixture when its tool-created stdin pipe is closed.
const pid = Number(process.argv[2]);
assert(Number.isSafeInteger(pid) && pid > 1);
assert.equal(await readlink(`/proc/${pid}/cwd`), process.cwd());
const command = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
assert.equal(
  command[1],
  'experiments/issue-56/discovery-memory-mcp-server.mjs'
);
await assert.rejects(fetch('http://127.0.0.1:9229/json/list'));
process.kill(pid, 'SIGUSR1');
let targets;
for (let attempt = 0; attempt < 20; attempt += 1) {
  targets = await fetch('http://127.0.0.1:9229/json/list')
    .then((response) => response.json())
    .catch(() => null);
  if (targets?.length) {
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}
assert.equal(targets?.length, 1);
const socket = new globalThis.WebSocket(targets[0].webSocketDebuggerUrl);
try {
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const response = new Promise((resolve) =>
    socket.addEventListener('message', resolve, { once: true })
  );
  socket.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: "process.stdin.emit('data', Buffer.from('close'))",
        returnByValue: true,
      },
    })
  );
  await response;
  console.log('Owned native MCP fixture requested its normal awaited cleanup.');
} finally {
  socket.close();
}
