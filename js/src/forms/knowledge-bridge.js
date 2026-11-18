import net from 'node:net';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { encodeWire, decodeWire } from '../transport/lino.js';
import { ensurePrivateDir, writeFileDurable } from '../storage/durable.js';
import { createFormChannel } from './local-channel.js';
import { learnFormAnswerPairs } from './answer-learning.js';

export const formBridgeFile = (directory, pid = process.pid) =>
  path.join(directory, 'forms', `knowledge-${pid}.lino`);
const errorResult = (error) => ({
  code: error.code ?? 'form-learning-failed',
  message: error.message,
  ...(error.partial ? { partial: error.partial } : {}),
});
const authorized = (request, token) =>
  request?.version === 1 &&
  typeof request.token === 'string' &&
  Buffer.byteLength(request.token) === Buffer.byteLength(token) &&
  timingSafeEqual(Buffer.from(request.token), Buffer.from(token));

const serveLearning = async ({ channel, token, store, isClosing }) => {
  try {
    const request = await channel.next();
    if (
      !authorized(request, token) ||
      request.operation !== 'learn' ||
      typeof request.profileId !== 'string' ||
      request.profileId.length > 512
    ) {
      throw new Error('Invalid form knowledge request.');
    }
    const check = async () => {
      if (isClosing()) {
        throw new Error('The form knowledge owner is stopping.');
      }
      await channel.send({ type: 'check' });
      const response = await channel.next();
      if (response?.type !== 'checked' || response.ok !== true || isClosing()) {
        throw Object.assign(new Error('The observed form answer changed.'), {
          code: 'form-learning-changed',
        });
      }
    };
    const result = await learnFormAnswerPairs(store, request.pairs, {
      profileId: request.profileId,
      check,
    });
    await channel.send({ type: 'result', result });
  } catch (error) {
    await channel
      .send({ type: 'error', error: errorResult(error) })
      .catch(() => {});
  } finally {
    channel.close();
  }
};

/** The current store writer applies proposals in its existing knowledge queue. */
const openFormKnowledgeBridge = async ({
  store,
  directory,
  timeoutMs = 15000,
}) => {
  await ensurePrivateDir(path.join(directory, 'forms'));
  const token = randomBytes(32).toString('hex');
  const file = formBridgeFile(directory);
  const sockets = new Set();
  const pending = new Set();
  let closing = false;
  const server = net.createServer((socket) => {
    if (closing || sockets.size >= 4) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const task = serveLearning({
      channel: createFormChannel(socket, { timeoutMs }),
      token,
      store,
      isClosing: () => closing,
    });
    pending.add(task);
    void task.then(() => {
      sockets.delete(socket);
      pending.delete(task);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  server.unref();
  const metadata = {
    version: 1,
    pid: process.pid,
    port: server.address().port,
    token,
  };
  const close = async () => {
    closing = true;
    server.close();
    for (const socket of sockets) {
      socket.destroy();
    }
    await Promise.allSettled([...pending]);
    const current = await fs
      .readFile(file, 'utf8')
      .then(decodeWire)
      .catch(() => null);
    if (current?.token === token) {
      await fs.rm(file, { force: true });
    }
  };
  try {
    await writeFileDurable(file, encodeWire(metadata));
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
};

const owners = new Map();
export const createFormKnowledgeBridge = async (options) => {
  const directory = path.resolve(options.directory);
  let owner = owners.get(directory);
  if (owner && owner.store !== options.store) {
    throw new Error('Another form knowledge owner is already active.');
  }
  if (!owner) {
    owner = { store: options.store, users: 0 };
    owner.ready = openFormKnowledgeBridge({ ...options, directory });
    owners.set(directory, owner);
  }
  owner.users++;
  let bridge;
  try {
    bridge = await owner.ready;
  } catch (error) {
    if (owners.get(directory) === owner) {
      owners.delete(directory);
    }
    throw error;
  }
  let closed = false;
  return {
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      if (--owner.users === 0) {
        owners.delete(directory);
        await bridge.close();
      }
    },
  };
};

const ownerMetadata = async (directory, pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('Invalid form knowledge owner PID.');
  }
  const file = formBridgeFile(directory, pid);
  const info = await fs.stat(file);
  if (!info.isFile() || info.size > 4096) {
    throw new Error('Invalid form knowledge owner metadata.');
  }
  const text = await fs.readFile(file, 'utf8');
  if (Buffer.byteLength(text) > 4096) {
    throw new Error('Invalid form knowledge owner metadata.');
  }
  const metadata = decodeWire(text);
  if (
    metadata.version !== 1 ||
    metadata.pid !== pid ||
    !Number.isInteger(metadata.port) ||
    metadata.port < 1 ||
    metadata.port > 65535 ||
    typeof metadata.token !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(metadata.token)
  ) {
    throw new Error('Invalid form knowledge owner metadata.');
  }
  return metadata;
};

export const requestFormKnowledge = async (
  directory,
  pid,
  pairs,
  { profileId = '', check = () => {} } = {}
) => {
  if (
    !Array.isArray(pairs) ||
    pairs.length > 1000 ||
    JSON.stringify(pairs).length * 2 > 2 * 1024 ** 2
  ) {
    throw new Error('Form learning capacity exceeded; no proposals applied.');
  }
  const metadata = await ownerMetadata(directory, pid);
  const socket = net.connect(metadata.port, '127.0.0.1');
  const channel = createFormChannel(socket);
  let changed = null;
  try {
    await channel.send({
      version: 1,
      token: metadata.token,
      operation: 'learn',
      pairs,
      profileId,
    });
    for (let step = 0; step < 1003; step++) {
      const response = await channel.next();
      if (response.type === 'check') {
        try {
          if (changed) {
            throw changed;
          }
          await check();
          await channel.send({ type: 'checked', ok: true });
        } catch (error) {
          changed = error;
          await channel.send({ type: 'checked', ok: false });
        }
      } else if (response.type === 'result') {
        return response.result;
      } else if (response.type === 'error') {
        throw Object.assign(new Error(response.error.message), response.error);
      } else {
        throw new Error('Invalid form knowledge response.');
      }
    }
    throw new Error('Form knowledge checks exceeded their limit.');
  } finally {
    channel.close();
  }
};
