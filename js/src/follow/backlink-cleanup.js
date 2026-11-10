import { publicationId } from '../sources/publication-receipt.js';
import { markDeleted } from '../storage/soft-delete.js';
import { backlinkError, backlinkFailure } from './backlink-shape.js';
const checkedReceipt = (value, row) =>
  value?.chat === row.chat && publicationId(value.id) === row.messageId;
const incomingIds = (value, row, limit) => {
  if (
    !Array.isArray(value) ||
    value.length > limit ||
    value.some(
      (id) =>
        typeof id !== 'string' || !publicationId(id) || id === row.messageId
    ) ||
    new Set(value).size !== value.length
  ) {
    throw backlinkFailure('provider-response');
  }
  return value;
};
const projectDeleted = async (store, job, row, ids) => {
  const confirmed = new Set(ids);
  if (!confirmed.size) {
    return;
  }
  await store.scan(
    (link) =>
      link.id?.startsWith('msg:') &&
      link.source === job.config.source &&
      String(link.chat) === row.chat &&
      !link.outgoing &&
      !link.out &&
      link.raw?.out === 0 &&
      !link.service &&
      confirmed.has(String(link.raw?.id ?? link.messageId)),
    32,
    async (batch) => {
      for (const link of batch) {
        await store.put(
          markDeleted(link, {
            by: job.config.source,
            reason: 'follow-incoming-cleanup',
          })
        );
      }
    }
  );
};

export const createBacklinkCleanup = ({
  store,
  adapter,
  job,
  fresh,
  read,
  remember,
  cancelled,
}) => {
  const verify = async (row) => {
    await fresh(row);
    const receipt = await read(() =>
      adapter.inspect({ chat: row.chat, id: row.messageId })
    );
    if (!checkedReceipt(receipt, row) || receipt.state !== 'present') {
      throw backlinkFailure('provider-response');
    }
  };
  const clean = async (row) => {
    if (
      !job.config.deleteIncoming ||
      row.status !== 'survived' ||
      row.cleanup
    ) {
      return;
    }
    await verify(row);
    const ids = incomingIds(
      await read(() =>
        adapter.incoming({
          chat: row.chat,
          limit: job.config.historyLimit,
        })
      ),
      row,
      job.config.historyLimit
    );
    // History reads may take time: recheck the post and account at the
    // deletion boundary, then persist the intent before issuing the write.
    if (ids.length) {
      await verify(row);
    }
    row.cleanup = {
      status: ids.length ? 'sending' : 'confirmed',
      ids,
      confirmed: [],
    };
    await remember(row);
    if (!ids.length) {
      return;
    }
    if (cancelled()) {
      // The intent is conservative: it remains unreplayed even if cancellation
      // arrived at the boundary just before issuing the provider write.
      throw backlinkFailure('cancelled');
    }
    try {
      const result = await adapter.deleteIncoming({ chat: row.chat, ids });
      const confirmed = Array.isArray(result?.confirmed)
        ? [...new Set(result.confirmed.filter((id) => ids.includes(id)))]
        : [];
      row.cleanup = {
        status: confirmed.length === ids.length ? 'confirmed' : 'unknown',
        ids,
        confirmed,
      };
      await remember(row);
      await projectDeleted(store, job, row, confirmed);
    } catch (error) {
      row.cleanup = {
        ...row.cleanup,
        status: 'unknown',
        ...backlinkError(error, { write: true }),
      };
      await remember(row);
    }
  };
  return clean;
};
