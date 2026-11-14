import assert from 'node:assert/strict';
import test from 'node:test';
import {
  syncWire,
  syncQueue,
  negotiateSync,
  SYNC_PROTOCOL,
  SYNC_BINARY_PROTOCOL,
  SYNC_JSON_PROTOCOL,
} from '../src/sync/wire.js';
import { LINO_TEXT, LINO_BINARY, JSON_MEDIA } from '../src/transport/lino.js';
import {
  createFrameReader,
  encodeTextFrame,
  encodeBinaryFrame,
  encodeClientBinaryFrame,
} from '../src/sync/ws-frame.js';

test('sync protocol preferences are explicit and JSON cannot be autodetected', () => {
  assert.equal(negotiateSync().wire.format, LINO_TEXT);
  assert.equal(
    negotiateSync(
      `${SYNC_JSON_PROTOCOL}, ${SYNC_BINARY_PROTOCOL}, ${SYNC_PROTOCOL}`
    ).wire.format,
    LINO_BINARY
  );
  assert.equal(negotiateSync(SYNC_JSON_PROTOCOL), null);
  assert.equal(negotiateSync('unknown'), null);
  assert.equal(
    negotiateSync(SYNC_JSON_PROTOCOL, { jsonCompatibility: true }).wire.format,
    JSON_MEDIA
  );
  assert.throws(() => syncWire().decode('{"type":"hello"}'));
  assert.throws(() => syncWire({ format: JSON_MEDIA }));
  assert.throws(() => syncWire().decode(new Uint8Array([1])));
  assert.throws(() => syncWire({ format: LINO_BINARY }).decode('not binary'));
});

test('pending sync records are snapshots and clear on close', () => {
  const queue = syncQueue();
  const event = { type: 'hello', values: ['first'] };
  queue.push(event);
  event.values[0] = 'changed';
  const seen = [];
  queue.drain((value) => seen.push(value));
  assert.deepEqual(seen, [{ type: 'hello', values: ['first'] }]);
  queue.push(event);
  queue.clear();
  queue.drain((value) => seen.push(value));
  assert.equal(seen.length, 1);
});

test('WebSocket text, binary, masking and fragmented Unicode preserve exact bytes', () => {
  const seen = [];
  const reader = createFrameReader({
    onText: (value) => seen.push(value),
    onBinary: (value) => seen.push([...value]),
    onClose: () => assert.fail('valid frame closed'),
  });
  const text = encodeTextFrame('你好🚀');
  reader(text.subarray(0, 3));
  reader(text.subarray(3));
  reader(encodeClientBinaryFrame(new Uint8Array([0, 255, 128])));
  const bytes = Buffer.from('🚀');
  reader(Buffer.from([0x01, 2, ...bytes.subarray(0, 2)]));
  reader(Buffer.from([0x89, 0])); // control frames may interrupt a message
  reader(Buffer.from([0x80, 2, ...bytes.subarray(2)]));
  reader(encodeBinaryFrame(new Uint8Array([9])));
  assert.deepEqual(seen, ['你好🚀', [0, 255, 128], '🚀', [9]]);
});

test('WebSocket rejects oversized and malformed headers without allocating their payloads', () => {
  for (const header of [
    [0x82, 127, 0, 0, 0, 1, 0, 0, 0, 0], // high length word
    [0x82, 127, 0, 0, 0, 0, 0, 64, 0, 1], // 4 MiB + 1
    [0xc1, 0], // unsolicited extension
    [0x80, 0], // orphan continuation
    [0x09, 0], // fragmented control
    [0x81, 1, 0xff], // invalid UTF-8
  ]) {
    let closed = 0;
    const reader = createFrameReader({ onClose: () => closed++ });
    reader(Buffer.from(header));
    reader(encodeTextFrame('ignored after failure'));
    assert.equal(closed, 1);
  }
});
