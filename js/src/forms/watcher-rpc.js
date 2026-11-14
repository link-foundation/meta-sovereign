import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { createFormChannel } from './local-channel.js';

export const watcherRequest = async (metadata, operation, value) => {
  if (
    !Number.isInteger(metadata.port) ||
    metadata.port < 1 ||
    metadata.port > 65535 ||
    typeof metadata.token !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(metadata.token)
  ) {
    throw new Error('Invalid form watcher connection metadata.');
  }
  const channel = createFormChannel(net.connect(metadata.port, '127.0.0.1'));
  try {
    await channel.send({ version: 1, token: metadata.token, operation, value });
    const response = await channel.next();
    if (response.error) {
      throw Object.assign(new Error(response.error.message), response.error);
    }
    return response.result;
  } finally {
    channel.close();
  }
};

/** Each short control request is private, authenticated and bounded. */
export const createWatcherControl = async ({ token, dispatch }) => {
  const sockets = new Set();
  const tasks = new Set();
  let closing = false;
  const server = net.createServer((socket) => {
    if (closing || sockets.size >= 4) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const channel = createFormChannel(socket);
    const task = (async () => {
      try {
        const request = await channel.next();
        if (
          request?.version !== 1 ||
          typeof request.token !== 'string' ||
          Buffer.byteLength(request.token) !== Buffer.byteLength(token) ||
          !timingSafeEqual(Buffer.from(request.token), Buffer.from(token))
        ) {
          throw new Error('Invalid form watcher request.');
        }
        const result = await dispatch(request.operation, request.value);
        await channel.send({ result });
      } catch (error) {
        await channel
          .send({
            error: {
              code: error.code ?? 'form-watcher-failed',
              message: error.message,
            },
          })
          .catch(() => {});
      } finally {
        channel.close();
      }
    })();
    tasks.add(task);
    void task.then(() => {
      sockets.delete(socket);
      tasks.delete(task);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    async close() {
      closing = true;
      server.close();
      for (const socket of sockets) {
        socket.destroy();
      }
      await Promise.allSettled([...tasks]);
    },
  };
};
