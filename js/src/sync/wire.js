/** Portable sync codecs. The negotiated protocol fixes the format for a connection. */
import {
  LINO_TEXT,
  LINO_BINARY,
  JSON_MEDIA,
  encodeWire,
  decodeWire,
  WireError,
} from '../transport/lino.js';

export const SYNC_PROTOCOL = 'meta-sovereign-sync.lino.v2';
export const SYNC_BINARY_PROTOCOL = 'meta-sovereign-sync.lino-binary.v2';
export const SYNC_JSON_PROTOCOL = 'meta-sovereign-sync.v1';
export const MAX_SYNC_BYTES = 4 * 1024 * 1024;
const protocols = new Map([
  [LINO_TEXT, SYNC_PROTOCOL],
  [LINO_BINARY, SYNC_BINARY_PROTOCOL],
  [JSON_MEDIA, SYNC_JSON_PROTOCOL],
]);
const byteLength = (data) =>
  typeof data === 'string'
    ? new TextEncoder().encode(data).byteLength
    : data.byteLength;
const bounded = (data) => {
  if (byteLength(data) > MAX_SYNC_BYTES) {
    throw new WireError('sync message exceeds 4 MiB', 'too-large');
  }
  return data;
};

export const syncWire = ({
  format = LINO_TEXT,
  jsonCompatibility = false,
} = {}) => {
  const protocol = protocols.get(format);
  if (!protocol || (format === JSON_MEDIA && !jsonCompatibility)) {
    throw new WireError(
      `unsupported sync format: ${format}`,
      'unsupported-media'
    );
  }
  return {
    format,
    protocol,
    binary: format === LINO_BINARY,
    encode: (event) =>
      bounded(encodeWire(event, format, { jsonCompatibility })),
    decode(data) {
      if ((typeof data === 'string') === (format === LINO_BINARY)) {
        throw new WireError(
          'sync frame does not match negotiated format',
          'unsupported-media'
        );
      }
      const event = decodeWire(bounded(data), format, { jsonCompatibility });
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new WireError('sync message must be an object', 'bad-lino');
      }
      return event;
    },
  };
};

export const negotiateSync = (offered, { jsonCompatibility = false } = {}) => {
  const requested = String(offered ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (requested.length === 0) {
    return {
      wire: syncWire({
        format: jsonCompatibility ? JSON_MEDIA : LINO_TEXT,
        jsonCompatibility,
      }),
      protocol: '',
    };
  }
  for (const protocol of requested) {
    for (const [format, supported] of protocols) {
      if (
        protocol === supported &&
        (format !== JSON_MEDIA || jsonCompatibility)
      ) {
        return { wire: syncWire({ format, jsonCompatibility }), protocol };
      }
    }
  }
  return null;
};

/** Bound disconnected queues too; overflow is an explicit send error. */
export const syncQueue = () => {
  const pending = [];
  const wire = syncWire();
  let bytes = 0;
  return {
    push(event) {
      const data = wire.encode(event);
      const size = byteLength(data);
      if (bytes + size > MAX_SYNC_BYTES) {
        throw new WireError('pending sync messages exceed 4 MiB', 'too-large');
      }
      pending.push(data);
      bytes += size;
    },
    drain(send) {
      while (pending.length) {
        const data = pending[0];
        send(wire.decode(data));
        pending.shift();
        bytes -= byteLength(data);
      }
    },
    clear() {
      pending.length = 0;
      bytes = 0;
    },
  };
};
