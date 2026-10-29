import { historyOrder } from './history-order.js';
import { scanReplyHistory } from './reply-history.js';
const chatKey = (source, chat) => `${source}\u0000${chat}`;
const boundedMap = (limit, maxBytes) => {
  const entries = new Map();
  let bytes = 0;
  const remove = (key) => {
    bytes -= entries.get(key)?.bytes ?? 0;
    entries.delete(key);
  };
  return {
    get: (key) => entries.get(key)?.message,
    put(key, message) {
      const known = entries.get(key)?.message;
      if (known && historyOrder(message, known) < 0) {
        return;
      }
      remove(key);
      const size = JSON.stringify(message).length * 2 + 128;
      if (size > maxBytes) {
        return;
      }
      entries.set(key, { message, bytes: size });
      bytes += size;
      while (entries.size > limit || bytes > maxBytes) {
        remove(entries.keys().next().value);
      }
    },
    clear() {
      entries.clear();
      bytes = 0;
    },
    stats: () => ({ messages: entries.size, bytes }),
  };
};

export const createReplyContext = ({
  isSelf,
  now,
  windowMs,
  limit = 8192,
  maxBytes = 8 * 1024 ** 2,
  store,
  filter,
  project,
}) => {
  const any = boundedMap(limit, maxBytes);
  const incoming = boundedMap(limit, maxBytes);
  const context = {
    remember(message) {
      const key = chatKey(message.source, message.chat);
      any.put(key, message);
      if (!isSelf(message.sender)) {
        incoming.put(key, message);
      }
    },
    toAnswer(source, chat) {
      const last = any.get(chatKey(source, chat));
      const at = Date.parse(last?.timestamp ?? '');
      const stale = Number.isFinite(at) && now() - at > windowMs;
      return last && !isSelf(last.sender) && !stale ? last.body : '';
    },
    incoming: (source, chat) => incoming.get(chatKey(source, chat)) ?? null,
    async ensure(source, chat) {
      if (!store || any.get(chatKey(source, chat))) {
        return;
      }
      // An old conversation may fall outside the learning window. Read just
      // its compact context on demand; never restore a full-archive cache.
      await scanReplyHistory(
        store,
        (link) =>
          filter(link) &&
          link.source === source &&
          String(link.chat) === String(chat),
        project,
        (batch) => batch.forEach(context.remember)
      );
    },
    clear() {
      any.clear();
      incoming.clear();
    },
    stats: () => ({ last: any.stats(), incoming: incoming.stats() }),
  };
  return context;
};
