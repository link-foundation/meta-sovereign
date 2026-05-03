/**
 * RFC 6455 WebSocket framing — minimal text-frame implementation.
 *
 * The full spec defines binary frames, fragmentation, ping/pong,
 * extensions, and a handful of close codes. We use WebSockets only
 * to ship newline-delimited JSON sync events between an http server
 * and a browser, so we narrow to single-fragment text frames with
 * lengths up to 64KiB; pings get a pong reply and other control
 * frames are ignored.
 *
 * Keeping the implementation in-tree avoids pulling the `ws` package
 * (and a transitive native build) into the dependency surface — the
 * issue calls for "no premature optimisation" and the simplest
 * possible code.
 */

import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const acceptKey = (clientKey) =>
  crypto.createHash('sha1').update(`${clientKey}${GUID}`).digest('base64');

export const isWebSocketUpgrade = (req) =>
  String(req.headers.upgrade ?? '').toLowerCase() === 'websocket' &&
  String(req.headers.connection ?? '')
    .toLowerCase()
    .includes('upgrade') &&
  typeof req.headers['sec-websocket-key'] === 'string';

export const writeAcceptHandshake = (socket, req) => {
  const key = req.headers['sec-websocket-key'];
  const accept = acceptKey(key);
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n')
  );
};

export const encodeTextFrame = (text) => {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const head = [];
  head.push(0x81); // FIN + text opcode
  if (len < 126) {
    head.push(len);
  } else if (len < 0x10000) {
    head.push(126, (len >> 8) & 0xff, len & 0xff);
  } else {
    head.push(127, 0, 0, 0, 0);
    head.push(
      (len >>> 24) & 0xff,
      (len >>> 16) & 0xff,
      (len >>> 8) & 0xff,
      len & 0xff
    );
  }
  return Buffer.concat([Buffer.from(head), payload]);
};

const encodeMaskedTextFrame = (text) => {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const mask = crypto.randomBytes(4);
  const head = [];
  head.push(0x81);
  if (len < 126) {
    head.push(0x80 | len);
  } else if (len < 0x10000) {
    head.push(0x80 | 126, (len >> 8) & 0xff, len & 0xff);
  } else {
    head.push(0x80 | 127, 0, 0, 0, 0);
    head.push(
      (len >>> 24) & 0xff,
      (len >>> 16) & 0xff,
      (len >>> 8) & 0xff,
      len & 0xff
    );
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i += 1) {
    masked[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([Buffer.from(head), mask, masked]);
};

export const encodeClientTextFrame = encodeMaskedTextFrame;

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
  // We treat this as a 32-bit length — bigger frames are not used here.
  const len = (buf[6] << 24) | (buf[7] << 16) | (buf[8] << 8) | buf[9];
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

const dispatchFrame = (opcode, payload, handlers) => {
  if (opcode === 0x1) {
    handlers.onText?.(payload.toString('utf8'));
  } else if (opcode === 0x8) {
    handlers.onClose?.();
  } else if (opcode === 0x9) {
    handlers.onPing?.(payload);
  }
  // opcode 0xA (pong) and others are ignored.
};

export const createFrameReader = (handlers) => {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      const lenInfo = readLength(buf, buf[1]);
      if (!lenInfo) {
        return;
      }
      const maskInfo = readMask(buf, lenInfo.offset, masked);
      if (!maskInfo) {
        return;
      }
      const { len } = lenInfo;
      const { mask, offset } = maskInfo;
      if (buf.length < offset + len) {
        return;
      }
      const payload = masked
        ? decodeMaskedPayload(buf, offset, len, mask)
        : buf.subarray(offset, offset + len);
      buf = buf.subarray(offset + len);
      dispatchFrame(opcode, payload, handlers);
    }
  };
};
