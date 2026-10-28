// Only the OS user can request an upgrade over this private local socket.
// No HTTP route accepts executable paths or controls the server lifecycle.
import net from 'node:net';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { rollingDirectory, verifyRelease } from './rolling-release.js';
import { writeFileDurable } from '../storage/durable.js';

export const controlAddress = (storeDir) =>
  process.platform === 'win32'
    ? `\\\\.\\pipe\\meta-sovereign-${createHash('sha256').update(path.resolve(storeDir)).digest('hex').slice(0, 24)}`
    : path.join(rollingDirectory(storeDir), 'control.sock');
const infoFile = (storeDir) =>
  path.join(rollingDirectory(storeDir), 'server.json');
const MAX_MESSAGE = 64 * 1024;
const protocol = 1;

export const requestServerControl = (
  storeDir,
  command,
  { timeoutMs = 600_000 } = {}
) =>
  new Promise((resolve, reject) => {
    const socket = net.connect(controlAddress(storeDir));
    let response = '';
    socket.setTimeout(timeoutMs, () =>
      socket.destroy(
        Object.assign(new Error('server upgrade is still preparing'), {
          code: 'HOST_TIMEOUT',
        })
      )
    );
    socket.once('connect', () =>
      socket.write(`${JSON.stringify({ protocol, ...command })}\n`)
    );
    socket.on('data', (chunk) => {
      response += String(chunk);
      if (response.length > MAX_MESSAGE) {
        socket.destroy(new Error('invalid server control reply'));
        return;
      }
      const end = response.indexOf('\n');
      if (end < 0) {
        return;
      }
      // One complete frame is the whole reply. Close both halves explicitly;
      // Deno can otherwise retain an IPC socket after its writer ends.
      socket.destroy();
      try {
        const answer = JSON.parse(response.slice(0, end));
        if (answer.protocol !== protocol) {
          throw new Error('incompatible server control protocol');
        }
        if (answer.error) {
          reject(
            Object.assign(new Error(answer.error.message), {
              code: answer.error.code,
            })
          );
        } else {
          resolve(answer.result);
        }
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', reject);
    socket.once('end', () => {
      if (!response.includes('\n')) {
        reject(new Error('server control closed without an answer'));
      }
    });
  });

const cleanStaleSocket = async (storeDir) => {
  if (process.platform === 'win32') {
    return;
  }
  const address = controlAddress(storeDir);
  const existing = await fs.stat(address).catch(() => null);
  if (!existing) {
    return;
  }
  try {
    await requestServerControl(
      storeDir,
      { operation: 'status' },
      { timeoutMs: 2000 }
    );
    throw Object.assign(new Error('a server host is already running'), {
      code: 'HOST_RUNNING',
    });
  } catch (error) {
    if (!['ECONNREFUSED', 'ENOENT'].includes(error.code)) {
      throw error;
    }
  }
  if (process.getuid && existing.uid !== process.getuid()) {
    throw new Error('the server control socket has another owner');
  }
  await fs.unlink(address);
};

export const createServerControl = async ({
  storeDir,
  handle,
  log = () => {},
  writeInfo = writeFileDurable,
}) => {
  await fs.mkdir(rollingDirectory(storeDir), { recursive: true, mode: 0o700 });
  await cleanStaleSocket(storeDir);
  let saving = Promise.resolve();
  const save = () => {
    const data = JSON.stringify({
      protocol,
      hostPid: process.pid,
      ...handle.status(),
    });
    saving = saving
      .catch(() => {})
      .then(() => writeInfo(infoFile(storeDir), data));
    return saving;
  };
  const perform = async (command) => {
    // A socket can accept before its startup metadata has finished writing,
    // especially on Windows. Readiness must include that durable write.
    await initialized;
    if (command.protocol !== protocol) {
      throw new Error('incompatible server control protocol');
    }
    if (command.operation === 'status') {
      return handle.status();
    }
    if (command.operation !== 'upgrade') {
      throw new Error('unknown server control operation');
    }
    if (Number(command.port) > 0 && Number(command.port) !== handle.port) {
      throw new Error('the running host uses another port; it remains active');
    }
    const release = await verifyRelease(storeDir, command.release);
    const result = await handle.upgrade(release, command.changes ?? {});
    await save();
    return result;
  };
  const connections = new Set();
  const server = net.createServer((socket) => {
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
    let input = '';
    let handling = false;
    socket.setTimeout(600_000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      if (handling) {
        return;
      }
      input += String(chunk);
      if (input.length > MAX_MESSAGE) {
        socket.destroy();
        return;
      }
      const end = input.indexOf('\n');
      if (end < 0) {
        return;
      }
      handling = true;
      Promise.resolve()
        .then(() => JSON.parse(input.slice(0, end)))
        .then(perform)
        .then(
          (result) => socket.end(`${JSON.stringify({ protocol, result })}\n`),
          (error) => {
            log({
              level: 'warn',
              event: 'server_control_failed',
              code: error.code,
              error: error.message,
            });
            socket.end(
              `${JSON.stringify({ protocol, error: { message: error.message, code: error.code } })}\n`
            );
          }
        );
    });
  });
  let listening = false;
  const close = async () => {
    // Stop accepting immediately, then destroy every control connection.
    // Deno's net.Server can omit the close callback after Unix IPC traffic;
    // worker shutdown must not depend on that compatibility event.
    server.close();
    connections.forEach((socket) => socket.destroy());
    if (process.platform !== 'win32') {
      await fs.unlink(controlAddress(storeDir)).catch(() => {});
    }
    await fs.unlink(infoFile(storeDir)).catch(() => {});
  };
  const initialized = (async () => {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(controlAddress(storeDir), resolve);
    });
    listening = true;
    if (process.platform !== 'win32') {
      await fs.chmod(controlAddress(storeDir), 0o600);
    }
    await save();
  })();
  try {
    await initialized;
  } catch (error) {
    if (listening) {
      await close();
    }
    throw error;
  }
  return { close };
};
