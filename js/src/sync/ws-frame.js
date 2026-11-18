/** RFC 6455 framing for bounded text/binary Lino messages and control frames. */

import crypto from 'node:crypto';
import { MAX_SYNC_BYTES } from './wire.js';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const acceptKey = (clientKey) =>
  crypto.createHash('sha1').update(`${clientKey}${GUID}`).digest('base64');

export const isWebSocketUpgrade = (req) =>
  String(req.headers.upgrade ?? '').toLowerCase() === 'websocket' &&
  String(req.headers.connection ?? '')
    .toLowerCase()
    .includes('upgrade') &&
  typeof req.headers['sec-websocket-key'] === 'string';

export const writeAcceptHandshake = (socket, req, protocol = '') => {
  const key = req.headers['sec-websocket-key'];
  const accept = acceptKey(key);
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      ...(protocol ? [`Sec-WebSocket-Protocol: ${protocol}`] : []),
      '',
      '',
    ].join('\r\n')
  );
};

const encodeFrame = (data, opcode, masked) => {
  const payload = Buffer.from(data);
  const len = payload.length;
  if (len > MAX_SYNC_BYTES) {
    throw new RangeError('WebSocket message exceeds 4 MiB');
  }
  const head = [0x80 | opcode];
  const maskBit = masked ? 0x80 : 0;
  if (len < 126) {
    head.push(maskBit | len);
  } else if (len < 0x10000) {
    head.push(maskBit | 126, (len >> 8) & 0xff, len & 0xff);
  } else {
    head.push(
      maskBit | 127,
      0,
      0,
      0,
      0,
      (len >>> 24) & 0xff,
      (len >>> 16) & 0xff,
      (len >>> 8) & 0xff,
      len & 0xff
    );
  }
  if (!masked) {
    return Buffer.concat([Buffer.from(head), payload]);
  }
  const mask = crypto.randomBytes(4);
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i += 1) {
    body[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([Buffer.from(head), mask, body]);
};
export const encodeTextFrame = (text) => encodeFrame(text, 1, false);
export const encodeClientTextFrame = (text) => encodeFrame(text, 1, true);
export const encodeBinaryFrame = (bytes) => encodeFrame(bytes, 2, false);
export const encodeClientBinaryFrame = (bytes) => encodeFrame(bytes, 2, true);
export const encodePongFrame = (bytes, masked = false) =>
  encodeFrame(bytes, 10, masked);

const decodeMaskedPayload = (buf, offset, len, mask) => {
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i += 1) {
    out[i] = buf[offset + i] ^ mask[i % 4];
  }
  return out;
};

const readLength = (buf, b2) => {
  const short = b2 & 0x7f;
  if (short < 126) {
    return { len: short, offset: 2 };
  }
  if (short === 126) {
    if (buf.length < 4) {
      return null;
    }
    return { len: (buf[2] << 8) | buf[3], offset: 4 };
  }
  if (buf.length < 10) {
    return null;
  }
  const len = buf.readUInt32BE(2) === 0 ? buf.readUInt32BE(6) : Infinity;
  return { len, offset: 10 };
};

const readMask = (buf, offset, masked) => {
  if (!masked) {
    return { mask: undefined, offset };
  }
  if (buf.length < offset + 4) {
    return null;
  }
  return { mask: buf.subarray(offset, offset + 4), offset: offset + 4 };
};

const readFrame = (buf, fragmentBytes, fragmentCount) => {
  const opcode = buf[0] & 0x0f;
  const fin = (buf[0] & 0x80) !== 0;
  if ((buf[0] & 0x70) !== 0 || ![0, 1, 2, 8, 9, 10].includes(opcode)) {
    throw new Error('unsupported WebSocket frame');
  }
  const lenInfo = readLength(buf, buf[1]);
  if (!lenInfo) {
    return null;
  }
  const { len } = lenInfo;
  if (
    len > MAX_SYNC_BYTES ||
    (opcode >= 8 && (!fin || len > 125)) ||
    (opcode < 8 && len + fragmentBytes > MAX_SYNC_BYTES)
  ) {
    throw new Error('invalid WebSocket message length');
  }
  if (opcode < 8 && fragmentCount >= 1024) {
    throw new Error('too many WebSocket fragments');
  }
  const masked = (buf[1] & 0x80) !== 0;
  const maskInfo = readMask(buf, lenInfo.offset, masked);
  if (!maskInfo) {
    return null;
  }
  const { mask, offset } = maskInfo;
  if (buf.length < offset + len) {
    return null;
  }
  return {
    opcode,
    fin,
    payload: masked
      ? decodeMaskedPayload(buf, offset, len, mask)
      : buf.subarray(offset, offset + len),
    tail: buf.subarray(offset + len),
  };
};

export const createFrameReader = (handlers) => {
  let buf = Buffer.alloc(0);
  let fragments = [];
  let fragmentBytes = 0;
  let fragmentOpcode = 0;
  let stopped = false;
  const fail = () => {
    stopped = true;
    buf = Buffer.alloc(0);
    fragments = [];
    handlers.onClose?.();
  };
  const deliver = (opcode, payload) => {
    if (opcode === 1) {
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
      } catch {
        fail();
        return;
      }
      handlers.onText?.(text);
    } else {
      handlers.onBinary?.(payload);
    }
  };
  return (chunk) => {
    if (stopped) {
      return;
    }
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2 && !stopped) {
      let frame;
      try {
        frame = readFrame(buf, fragmentBytes, fragments.length);
      } catch {
        fail();
        return;
      }
      if (!frame) {
        return;
      }
      const { opcode, fin, payload } = frame;
      buf = frame.tail;
      if (opcode === 8) {
        fail();
        return;
      }
      if (opcode === 9) {
        handlers.onPing?.(payload);
        continue;
      }
      if (opcode === 10) {
        continue;
      }
      if ((opcode === 0) !== (fragmentOpcode !== 0)) {
        fail();
        return;
      }
      if (!fin || fragmentOpcode) {
        if (opcode) {
          fragmentOpcode = opcode;
        }
        fragments.push(payload);
        fragmentBytes += payload.length;
        if (!fin) {
          continue;
        }
        const whole = Buffer.concat(fragments, fragmentBytes);
        const type = fragmentOpcode;
        fragments = [];
        fragmentBytes = 0;
        fragmentOpcode = 0;
        deliver(type, whole);
      } else {
        deliver(opcode, payload);
      }
    }
  };
};

/**
 * A page on another website must not join the sync (it could write any
 * link into the store): `verifyOrigin(req)` decides, as for HTTP
 * (see server/cors.js). Returns true when the socket was rejected.
 */
export const rejectForeignOrigin = (req, socket, verifyOrigin) => {
  if (!verifyOrigin || verifyOrigin(req)) {
    return false;
  }
  socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  socket.destroy();
  return true;
};
