// A derived suggestion window; archive records remain in the durable store.
// A min-heap selects recent messages regardless of import/backfill order.
import { historyOrder } from './history-order.js';
export const createBoundedHistory = ({
  maxMessages = 12500,
  maxBytes = 8 * 1024 ** 2,
  maxChars = 4096,
} = {}) => {
  const heap = [];
  const positions = new Map();
  let bytes = 0;
  const before = (a, b) =>
    a.at < b.at || (a.at === b.at && historyOrder(a.message, b.message) < 0);
  const swap = (a, b) => {
    [heap[a], heap[b]] = [heap[b], heap[a]];
    positions.set(heap[a].message.id, a);
    positions.set(heap[b].message.id, b);
  };
  const up = (start) => {
    let at = start;
    while (at > 0) {
      const parent = Math.floor((at - 1) / 2);
      if (!before(heap[at], heap[parent])) {
        break;
      }
      swap(at, parent);
      at = parent;
    }
    return at;
  };
  const down = (start) => {
    let at = start;
    while (at * 2 + 1 < heap.length) {
      let next = at * 2 + 1;
      if (next + 1 < heap.length && before(heap[next + 1], heap[next])) {
        next += 1;
      }
      if (!before(heap[next], heap[at])) {
        break;
      }
      swap(at, next);
      at = next;
    }
  };
  const remove = (id) => {
    const at = positions.get(id);
    if (at === undefined) {
      return;
    }
    bytes -= heap[at].bytes;
    positions.delete(id);
    const last = heap.pop();
    if (at < heap.length) {
      heap[at] = last;
      positions.set(last.message.id, at);
      down(up(at));
    }
  };
  return {
    add(message) {
      remove(message.id);
      const size = JSON.stringify(message).length * 2 + 128;
      if (
        message.body.length > maxChars ||
        size > maxBytes ||
        maxMessages < 1
      ) {
        return false;
      }
      const value = Number(message.timestamp);
      const at = Number.isFinite(value)
        ? value
        : Date.parse(message.timestamp) || 0;
      heap.push({ message, at, bytes: size });
      bytes += size;
      positions.set(message.id, heap.length - 1);
      up(heap.length - 1);
      while (heap.length > maxMessages || bytes > maxBytes) {
        remove(heap[0].message.id);
      }
      return positions.has(message.id);
    },
    get: (id) => heap[positions.get(id)]?.message,
    remove,
    values: () => heap.map((entry) => entry.message),
    stats: () => ({ messages: heap.length, bytes, maxMessages, maxBytes }),
    clear() {
      heap.length = 0;
      positions.clear();
      bytes = 0;
    },
  };
};
