import { mergeReactionActors } from '../sources/reaction-data.js';

// Initial indexing never rewrites the archive. Preserve observations before a
// provider update drops them, coalescing writes and retaining failed work.
export const createFeedbackEvidence = (store, log = () => {}) => {
  const pending = new Map();
  let writing = null;
  let timer = null;
  let closed = false;
  const drain = async () => {
    let count = 0;
    while (pending.size) {
      const [id, row] = pending.entries().next().value;
      const recordId = `feedback-authors:${id}`;
      const saved = await store.get(recordId);
      const actors = mergeReactionActors(saved?.actors ?? [], row.actors);
      if (JSON.stringify(actors) !== JSON.stringify(saved?.actors ?? [])) {
        await store.put({
          ...saved,
          id: recordId,
          messageId: id,
          source: row.source,
          chat: row.chat,
          actors,
          status: saved?.status ?? 'observed',
          observedAt: saved?.observedAt ?? new Date().toISOString(),
        });
      }
      if (pending.get(id) === row) {
        pending.delete(id);
      }
      if (++count % 20 === 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      }
    }
  };
  const flush = () => {
    writing ??= Promise.resolve()
      .then(drain)
      .finally(() => {
        writing = null;
      });
    return writing;
  };
  const retry = () => {
    flush().catch((error) => {
      log?.({
        level: 'warn',
        event: 'feedback_evidence_failed',
        code: error.code ?? 'write-failed',
        pending: pending.size,
      });
      if (!closed && !timer) {
        timer = globalThis.setTimeout(() => {
          timer = null;
          retry();
        }, 30_000);
        timer.unref?.();
      }
    });
  };
  return {
    preserve(row) {
      pending.set(row.id, {
        ...row,
        actors: mergeReactionActors(
          pending.get(row.id)?.actors ?? [],
          row.actors
        ),
      });
      retry();
    },
    flush,
    close() {
      closed = true;
      globalThis.clearTimeout(timer);
    },
  };
};
