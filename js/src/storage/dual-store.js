/**
 * DualStore — write-through to both the binary (Doublets) and text
 * (`.lino`) backends so the unified database is always available in
 * both forms (R-A3). Reads are served from the binary side because it
 * is faster; the text side is treated as an authoritative export.
 *
 * `verify()` cross-checks the two backends and returns the set of
 * links that disagree; this is the primitive the backup job runs
 * before snapshotting (R-A4).
 */

export const createDualStore = ({ binary, text }) => ({
  async put(link) {
    await binary.put(link);
    await text.put(link);
    return link;
  },
  async get(id) {
    return binary.get(id);
  },
  async delete(id) {
    const a = await binary.delete(id);
    const b = await text.delete(id);
    return a || b;
  },
  async query(filter) {
    return binary.query(filter);
  },
  subscribe(h) {
    return binary.subscribe(h);
  },
  async flush() {
    await binary.flush?.();
    await text.flush?.();
  },
  async verify() {
    const a = await binary.query();
    const b = await text.query();
    const aMap = new Map(a.map((l) => [l.id, l]));
    const bMap = new Map(b.map((l) => [l.id, l]));
    const diffs = [];
    for (const [id, link] of aMap) {
      const other = bMap.get(id);
      if (!other || JSON.stringify(other) !== JSON.stringify(link)) {
        diffs.push({ id, binary: link, text: other ?? null });
      }
    }
    for (const [id, link] of bMap) {
      if (!aMap.has(id)) {
        diffs.push({ id, binary: null, text: link });
      }
    }
    return diffs;
  },
});
