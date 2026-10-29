// Small synthetic V8 fixture. No archive data or running application is used.
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createRawPacking,
  rawMediaTypeOf,
} from '../../src/storage/raw-packing.js';

const packing = createRawPacking();
const fixture = () => {
  const input = `${'synthetic padding '.repeat(1000)}MessageMediaPhoto`;
  return packing.retain({
    id: 'msg:ownership:1',
    raw: {
      media: { className: input.slice(-17) },
      message: 'synthetic payload '.repeat(100),
    },
  });
};
globalThis.metaSummaryOwnershipProbe = {
  name: rawMediaTypeOf(fixture()),
};
assert.equal(globalThis.metaSummaryOwnershipProbe.name, 'MessageMediaPhoto');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-owned-summary-'));
let heap;
try {
  const file = path.join(dir, 'synthetic.heapsnapshot');
  v8.writeHeapSnapshot(file);
  heap = JSON.parse(await fs.readFile(file, 'utf8'));
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
const nodeFields = heap.snapshot.meta.node_fields;
const edgeFields = heap.snapshot.meta.edge_fields;
const nodeWidth = nodeFields.length;
const edgeWidth = edgeFields.length;
const nodeIndex = (name) => nodeFields.indexOf(name);
const edgeIndex = (name) => edgeFields.indexOf(name);
const starts = new Map();
let offset = 0;
for (let node = 0; node < heap.nodes.length; node += nodeWidth) {
  starts.set(node, offset);
  offset += heap.nodes[node + nodeIndex('edge_count')] * edgeWidth;
}
const property = (node, name) => {
  const end =
    starts.get(node) + heap.nodes[node + nodeIndex('edge_count')] * edgeWidth;
  for (let edge = starts.get(node); edge < end; edge += edgeWidth) {
    const type = heap.snapshot.meta.edge_types[0][heap.edges[edge]];
    if (
      type === 'property' &&
      heap.strings[heap.edges[edge + edgeIndex('name_or_index')]] === name
    ) {
      return heap.edges[edge + edgeIndex('to_node')];
    }
  }
  return null;
};
let probe = null;
for (
  let node = 0;
  node < heap.nodes.length && probe === null;
  node += nodeWidth
) {
  probe = property(node, 'metaSummaryOwnershipProbe');
}
assert.notEqual(probe, null);
const name = property(probe, 'name');
assert.notEqual(name, null);
const type = heap.snapshot.meta.node_types[0][heap.nodes[name]];
assert.equal(type, 'string', 'a media summary must not retain an input slice');
delete globalThis.metaSummaryOwnershipProbe;
