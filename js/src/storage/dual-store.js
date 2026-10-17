/**
 * DualStore — write-through to both the binary (Doublets) and text
 * (`.lino`) backends so the unified database is always available in
 * both forms (R-A3). Reads are served from the binary side because it
 * is faster; the text side is treated as an authoritative export.
 *
 * `verify()` cross-checks the two backends and returns the set of
 * links that disagree; this is the primitive the backup job runs
 * before snapshotting (R-A4).
 *
 * The text side is the durable log; the binary side is a snapshot
 * written on an interval. `reconcile()` brings the binary side back in
 * line with the text (a snapshot that missed the last writes before a
 * crash) and is run when the server opens the store.
 */

const putEach = async (store, links) => {
  for (const link of links) {
    await store.put(link);
  }
};

export const createDualStore = ({ binary, text }) => ({
  async put(link) {
    await binary.put(link);
    await text.put(link);
    return link;
  },
  async putMany(links) {
    await (binary.putMany ? binary.putMany(links) : putEach(binary, links));
    await (text.putMany ? text.putMany(links) : putEach(text, links));
    return links;
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
  async reconcile() {
    const textLinks = await text.query();
    const binaryById = new Map((await binary.query()).map((l) => [l.id, l]));
    const stale = textLinks.filter((link) => {
      const other = binaryById.get(link.id);
      return !other || JSON.stringify(other) !== JSON.stringify(link);
    });
    for (const link of textLinks) {
      binaryById.delete(link.id);
    }
    const extra = [...binaryById.keys()];
    await (binary.putMany ? binary.putMany(stale) : putEach(binary, stale));
    for (const id of extra) {
      await binary.delete(id);
    }
    if (stale.length > 0 || extra.length > 0) {
      await binary.flush?.();
    }
    return { put: stale.length, deleted: extra.length };
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
