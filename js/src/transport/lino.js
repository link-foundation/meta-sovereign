// Portable wire codecs shared by the browser, Node and native web shells.
// Binary bodies contain the typed object AST in the published binary LINO format.
import {
  encode,
  encodeLine,
  encodeCompact,
  decode,
  decodeLine,
  decodeCompact,
} from 'lino-objects-codec';
import {
  BinaryLinoCodec,
  BinaryLinoOptions,
  DecodeLimits,
  Parser,
  formatLinks,
} from 'links-notation';

export const LINO_TEXT = 'text/lino';
export const LINO_BINARY = 'application/lino-binary';
export const JSON_MEDIA = 'application/json';
export const LINO_TYPES = Object.freeze([
  LINO_TEXT,
  LINO_BINARY,
  'text/lino-line',
  'text/lino-compact',
]);
// Preserve the archive endpoint's existing 64 MiB ceiling. Ordinary mutation
// routes retain their smaller 1 MiB streaming limit before decoding.
export const MAX_WIRE_BYTES = 64 * 1024 * 1024;
const limits = new DecodeLimits({
  maxLinks: 1024 * 1024,
  maxReferences: 4 * 1024 * 1024,
  maxNodes: 256 * 1024,
  maxStringBytes: MAX_WIRE_BYTES,
  maxDepth: 64,
});
const binary = new BinaryLinoCodec(new BinaryLinoOptions(), limits);
const parser = new Parser({ maxInputSize: MAX_WIRE_BYTES, maxDepth: 64 });
const utf8 = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export const validateWireText = (input) => {
  const notation =
    typeof input === 'string' ? input : textDecoder.decode(input);
  if (utf8.encode(notation).byteLength > MAX_WIRE_BYTES) {
    throw new WireError('wire body exceeds the decoder limit', 'too-large');
  }
  parser.parse(notation);
  return notation;
};

export const mediaType = (value) =>
  String(value ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
const baseType = (value) => {
  const type = mediaType(value);
  if (type === 'application/problem+lino') {
    return LINO_TEXT;
  }
  return type === 'application/problem+json' ? JSON_MEDIA : type;
};

export class WireError extends Error {
  constructor(message, code = 'bad-lino') {
    super(message);
    this.name = 'WireError';
    this.code = code;
  }
}

// Retain the existing HTTP value semantics for dates, undefined, nonfinite
// numbers and provider bigint IDs. This is normalization, never JSON on the wire.
export const wireValue = (value) =>
  JSON.parse(
    JSON.stringify(value === undefined ? null : value, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item
    )
  );

const supported = (type, jsonCompatibility) => {
  if (
    !LINO_TYPES.includes(type) &&
    !(jsonCompatibility && type === JSON_MEDIA)
  ) {
    throw new WireError(
      `unsupported wire media type: ${type || '(missing)'}`,
      'unsupported-media'
    );
  }
};

export const encodeWire = (
  value,
  type = LINO_TEXT,
  { jsonCompatibility = false } = {}
) => {
  type = baseType(type);
  supported(type, jsonCompatibility);
  const obj = wireValue(value);
  if (type === LINO_BINARY) {
    // encodeText canonicalizes unary containers; preserve the typed AST instead.
    return binary.encode(parser.parse(encodeCompact({ obj })));
  }
  if (type === JSON_MEDIA) {
    return JSON.stringify(obj);
  }
  if (type === 'text/lino-line') {
    return encodeLine({ obj });
  }
  return type === 'text/lino-compact'
    ? encodeCompact({ obj })
    : encode({ obj });
};

export const decodeWire = (
  input,
  type = LINO_TEXT,
  { jsonCompatibility = false } = {}
) => {
  type = baseType(type);
  supported(type, jsonCompatibility);
  const bytes =
    typeof input === 'string' ? utf8.encode(input) : new Uint8Array(input);
  if (bytes.byteLength > MAX_WIRE_BYTES) {
    throw new WireError('wire body exceeds the decoder limit', 'too-large');
  }
  if (type === LINO_BINARY) {
    return decodeCompact({ notation: formatLinks(binary.decode(bytes)) });
  }
  const notation = textDecoder.decode(bytes);
  if (type === JSON_MEDIA) {
    return JSON.parse(notation);
  }
  // Validate syntax and nesting before the object codec's recursive decoder.
  validateWireText(notation);
  return type === 'text/lino-line'
    ? decodeLine({ notation })
    : decode({ notation });
};

export const readWireResponse = async (response, options) => {
  if ([204, 205].includes(response.status)) {
    return null;
  }
  const type = response.headers.get('content-type');
  return decodeWire(await response.arrayBuffer(), type, options);
};
