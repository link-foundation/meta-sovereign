/** Bounded TCP records: a four-byte byte length, then the selected Lino body. */
import { MAX_SYNC_BYTES } from './wire.js';
import { JSON_MEDIA, WireError } from '../transport/lino.js';

const utf8 = new TextDecoder('utf-8', { fatal: true });
export const encodeTcpFrame = (wire, event) => {
  const body = Buffer.from(wire.encode(event));
  if (wire.format === JSON_MEDIA) {
    return Buffer.concat([body, Buffer.from('\n')]);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
};

export const createTcpFrameReader = (wire, onMessage) => {
  const header = Buffer.alloc(4);
  let used = 0;
  let body = null;
  let offset = 0;
  return (chunk) => {
    let at = 0;
    while (at < chunk.length) {
      if (!body) {
        const size = Math.min(4 - used, chunk.length - at);
        chunk.copy(header, used, at, at + size);
        at += size;
        used += size;
        if (used !== 4) {
          continue;
        }
        const length = header.readUInt32BE();
        if (length === 0 || length > MAX_SYNC_BYTES) {
          throw new WireError('invalid TCP sync record length', 'too-large');
        }
        body = Buffer.alloc(length);
      }
      const size = Math.min(body.length - offset, chunk.length - at);
      chunk.copy(body, offset, at, at + size);
      at += size;
      offset += size;
      if (offset === body.length) {
        const event = wire.decode(wire.binary ? body : utf8.decode(body));
        body = null;
        offset = used = 0;
        onMessage(event);
      }
    }
  };
};

/** Explicit legacy mode only. Accumulate bytes before decoding split UTF-8. */
export const createJsonLineReader = (wire, onMessage) => {
  let buffer = Buffer.alloc(1024);
  let used = 0;
  return (chunk) => {
    let at = 0;
    while (at < chunk.length) {
      const newline = chunk.indexOf(10, at);
      const end = newline < 0 ? chunk.length : newline;
      const length = used + end - at;
      if (length > MAX_SYNC_BYTES) {
        throw new WireError('TCP JSON sync line exceeds 4 MiB', 'too-large');
      }
      if (length > buffer.length) {
        const next = Buffer.alloc(
          Math.min(MAX_SYNC_BYTES, Math.max(length, buffer.length * 2))
        );
        buffer.copy(next, 0, 0, used);
        buffer = next;
      }
      chunk.copy(buffer, used, at, end);
      used = length;
      at = end + (newline < 0 ? 0 : 1);
      if (newline >= 0) {
        if (used > 0) {
          onMessage(wire.decode(utf8.decode(buffer.subarray(0, used))));
        }
        used = 0;
      }
    }
  };
};
