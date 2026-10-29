import { createBoundedHistory } from './bounded-history.js';
import { historyOrder } from './history-order.js';

export const scanReplyHistory = async (store, filter, project, accept) => {
  if (store.scan) {
    await store.scan(filter, 500, accept, project);
  } else {
    await accept((await store.query(filter)).map(project));
  }
};

export const createReplyHistory = ({ store, self, budget }) => {
  const own = createBoundedHistory(budget);
  const other = createBoundedHistory(budget);
  const owners = new Set(['me', ...self.map(String)]);
  let seeded = false;
  const put = (message) => {
    const target = owners.has(String(message.sender)) ? own : other;
    (target === own ? other : own).remove(message.id);
    return target.add(message);
  };
  return {
    get seeded() {
      return seeded;
    },
    async seed(filter, project) {
      if (seeded) {
        return;
      }
      const accept = (batch) => batch.forEach(put);
      await scanReplyHistory(store, filter, project, accept);
      seeded = true;
    },
    setSelf: (ids) => ids.forEach((id) => owners.add(String(id))),
    put,
    get: (id) => own.get(id) ?? other.get(id),
    remove(id) {
      own.remove(id);
      other.remove(id);
    },
    values: () => [...own.values(), ...other.values()].sort(historyOrder),
    stats: () => ({ own: own.stats(), other: other.stats() }),
    clear() {
      own.clear();
      other.clear();
      seeded = false;
    },
  };
};
