import { messageVersionPrefix } from '../storage/message-version-id.js';

const MAX_MESSAGE_REVISIONS = 128;
const MAX_ARCHIVE_REVISIONS = 4096;
const MAX_ARCHIVE_REVISION_BYTES = 8 * 1024 ** 2;
const projection = (project) => (record) => ({
  id: record.id,
  kind: record.kind,
  messageId: record.messageId,
  previous: record.previous,
  snapshot: record.snapshot && project(record.snapshot),
});
const matchingSnapshot = (record, cursor, message) => {
  const original = record?.snapshot;
  return (
    record?.kind === 'message-version' &&
    record.id === cursor &&
    record.messageId === message.id &&
    original?.id === message.id &&
    original.source === message.source &&
    String(original.chat) === String(message.chat) &&
    original.timestamp === message.timestamp
  );
};

/** Read only the reachable snapshots of each outgoing message. */
export const createArchiveRevisionReader = (store, project) => {
  let inspected = 0;
  let bytes = 0;
  let incomplete = 0;
  const select = projection(project);
  return {
    get incomplete() {
      return incomplete;
    },
    async read(message) {
      const revisions = [];
      const seen = new Set();
      let partial = message.versionPartial === true;
      let cursor = message.versionHead;
      const prefix = messageVersionPrefix(message.id);
      while (cursor) {
        if (!cursor.startsWith?.(prefix) || seen.has(cursor)) {
          partial = true;
          break;
        }
        if (
          seen.size >= MAX_MESSAGE_REVISIONS ||
          ++inspected > MAX_ARCHIVE_REVISIONS
        ) {
          throw new Error(
            'answer revision capacity exceeded; no proposals applied'
          );
        }
        seen.add(cursor);
        const record = await store.get(cursor, select);
        if (!matchingSnapshot(record, cursor, message)) {
          partial = true;
          break;
        }
        if (cursor !== message.versionHead) {
          const snapshot = project(record.snapshot);
          const linkBytes = (snapshot.links ?? []).reduce(
            (size, link) => size + link.length * 2 + 32,
            0
          );
          bytes +=
            snapshot.body.length * 2 + cursor.length * 2 + linkBytes + 256;
          if (bytes > MAX_ARCHIVE_REVISION_BYTES) {
            throw new Error(
              'answer revision capacity exceeded; no proposals applied'
            );
          }
          revisions.push({ ...snapshot, revisionId: cursor });
        }
        cursor = record.previous;
      }
      incomplete += Number(partial);
      return revisions;
    },
  };
};
