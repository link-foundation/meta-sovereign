// Owned native process fixture shared by wire and durable-restart checks.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

export const nativeServer = async (t, binary, { args = [], cwd } = {}) => {
  const env = {
    ...process.env,
    MS_JSON_COMPATIBILITY: '0',
    MS_LOG_FORMAT: 'none',
  };
  delete env.MS_NATIVE_DATA_DIR;
  const server = spawn(binary, ['serve', '--port', '0', ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  const finished = once(server, 'close');
  const output = createInterface({ input: server.stdout });
  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-65536);
  });
  const stop = async () => {
    output.close();
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
    }
    await finished;
  };
  t.after(stop);
  const stopped = finished.then(([code]) => {
    throw new Error(`native server exited during startup: ${code} ${stderr}`);
  });
  stopped.catch(() => {});
  const [line] = await Promise.race([
    once(output, 'line', { signal: t.signal }),
    stopped,
  ]);
  const port = Number(line.match(/:(\d+)$/u)?.[1]);
  if (!(port > 0)) {
    throw new Error(`native startup: ${line} ${stderr}`);
  }
  return { base: `http://127.0.0.1:${port}`, server, finished, output, stop };
};
