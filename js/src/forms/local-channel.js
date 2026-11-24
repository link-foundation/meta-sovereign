import { encodeWire, decodeWire } from '../transport/lino.js';

const MAX_FRAME = 4 * 1024 ** 2;

/** Bounded private process messages, using the shared text Lino codec. */
export const createFormChannel = (socket, { timeoutMs = 15000 } = {}) => {
  let header = Buffer.alloc(4);
  let offset = 0;
  let body = null;
  let waiting = null;
  let closed = null;
  const queue = [];
  const fail = (error) => {
    closed ??= error;
    waiting?.reject(closed);
    waiting = null;
  };
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('Form process connection closed.')));
  socket.setTimeout(timeoutMs, () =>
    socket.destroy(new Error('Form process response timed out.'))
  );
  const deliver = (bytes) => {
    const value = decodeWire(bytes);
    if (waiting) {
      const { resolve } = waiting;
      waiting = null;
      resolve(value);
    } else if (queue.length < 2) {
      queue.push(value);
    } else {
      throw new Error('Too many pending form process messages.');
    }
  };
  socket.on('data', (chunk) => {
    try {
      let start = 0;
      while (start < chunk.length) {
        const target = body ?? header;
        const size = Math.min(target.length - offset, chunk.length - start);
        chunk.copy(target, offset, start, start + size);
        offset += size;
        start += size;
        if (offset !== target.length) {
          continue;
        }
        offset = 0;
        if (body) {
          const complete = body;
          body = null;
          header = Buffer.alloc(4);
          deliver(complete);
        } else {
          const length = header.readUInt32BE();
          if (!length || length > MAX_FRAME) {
            throw new Error('Form process message exceeds its limit.');
          }
          body = Buffer.alloc(length);
        }
      }
    } catch (error) {
      socket.destroy(error);
    }
  });
  return {
    async send(value) {
      if (closed) {
        throw closed;
      }
      const bytes = Buffer.from(encodeWire(value));
      if (!bytes.length || bytes.length > MAX_FRAME) {
        throw new Error('Form process message exceeds its limit.');
      }
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32BE(bytes.length);
      await new Promise((resolve, reject) => {
        socket.write(Buffer.concat([prefix, bytes]), (error) =>
          error ? reject(error) : resolve()
        );
      });
    },
    next() {
      if (queue.length) {
        return Promise.resolve(queue.shift());
      }
      if (closed) {
        return Promise.reject(closed);
      }
      if (waiting) {
        return Promise.reject(
          new Error('Another form process read is pending.')
        );
      }
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject };
      });
    },
    close: () => socket.destroy(),
  };
};
