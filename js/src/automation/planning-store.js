import { collectSelfIds } from '../crm/reengage.js';

const isMessage = (link) =>
  link?.id?.startsWith('msg:') && link.chat !== undefined && link.chat !== null;

// Planning needs message text and reachability flags, never provider media or
// edit snapshots. In particular, do not copy their packed bytes out of disk.
const summary = (link) => {
  const record = {};
  for (const key of Object.keys(link)) {
    if (!['raw', 'snapshot', 'tokens', 'children'].includes(key)) {
      Object.defineProperty(record, key, {
        value: link[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return record;
};

export const planningRecords = async (store, { targets, self = [] } = {}) => {
  const wanted = Array.isArray(targets)
    ? new Set(targets.map((target) => `${target.source}:${target.chat}`))
    : null;
  const owner = collectSelfIds(self);
  const records = [];
  const project = (link) => {
    if (isMessage(link)) {
      // Keep global owner inference even when only one chat is requested.
      owner.add(link);
      if (wanted && !wanted.has(`${link.source}:${link.chat}`)) {
        return null;
      }
    }
    return summary(link);
  };
  if (store.scan) {
    await store.scan(
      null,
      2048,
      async (batch) => {
        for (const link of batch) {
          if (link) {
            records.push(link);
          }
        }
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      },
      project
    );
  } else {
    // Lightweight in-memory/browser stores may not expose a projection scan.
    const found = await store.query((link) => {
      if (isMessage(link)) {
        owner.add(link);
        return !wanted || wanted.has(`${link.source}:${link.chat}`);
      }
      return true;
    });
    for (const record of found) {
      records.push(summary(record));
    }
  }
  return { records, self: [...owner.finish()] };
};
