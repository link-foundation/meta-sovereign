// Where does binary-archive time go? pack() layout vs direct Section vs toBytes.
import { performance } from 'node:perf_hooks';
import {
  ArityRange,
  DecodeLimits,
  LinksPacket,
  PacketReader,
  Section,
} from 'links-notation';
const n = Number(process.argv[2] ?? 24000);
const links = Array.from({ length: n }, (_, i) => [
  i + 1,
  [Math.max(1, i - 3), Math.max(1, i)],
]);
let t = performance.now();
const packed = LinksPacket.pack(false, links, true);
console.log('pack', (performance.now() - t).toFixed(1));
t = performance.now();
const width = n < 256 ? 1 : n < 65536 ? 2 : 4;
const direct = new LinksPacket(false, [
  new Section(
    0n,
    new ArityRange(2, 2),
    width,
    links.map(([, r]) => r)
  ),
]);
console.log('direct', (performance.now() - t).toFixed(1));
t = performance.now();
const b1 = direct.toBytes(DecodeLimits.unlimited());
console.log('toBytes', (performance.now() - t).toFixed(1), b1.length);
t = performance.now();
const p = new PacketReader(b1).read(DecodeLimits.unlimited());
console.log('read', (performance.now() - t).toFixed(1));
t = performance.now();
const l = p.links();
console.log('links()', (performance.now() - t).toFixed(1), l.length);
void packed;
