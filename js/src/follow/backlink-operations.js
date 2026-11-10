import { publicationId } from '../sources/publication-receipt.js';
import { withFollowRetry } from './retry.js';
import { backlinkError, backlinkFailure } from './backlink-shape.js';
import {
  recoverBacklinkRow,
  saveBacklink,
  saveBacklinkIntent,
} from './backlink-journal.js';
import { createBacklinkCleanup } from './backlink-cleanup.js';
const checkedReceipt = (value, row) =>
  value?.chat === row.chat && publicationId(value.id) === row.messageId;
export const createBacklinkOperations = ({
  store,
  adapter,
  job,
  control,
  now,
  sleep,
  trace,
}) => {
  const cancelled = () => control.signal.aborted;
  const read = (use) =>
    withFollowRetry(use, {
      policy: job.config.retry,
      cancelled,
      sleep: (ms) => sleep(ms, control.signal),
      trace,
    });
  const save = () => saveBacklink(store, job);
  const remember = async (row) => {
    await saveBacklinkIntent(store, job, row);
    await save();
  };
  const fresh = async (row, write = false) => {
    const target = await read(() => adapter.describe(row.chat));
    if (target?.owner !== job.owner || target?.chat !== row.chat) {
      throw backlinkFailure('account-changed');
    }
    if (write && target.canWrite !== true) {
      throw backlinkFailure('not-writable');
    }
    if (cancelled()) {
      throw backlinkFailure('cancelled');
    }
  };
  const deliver = async (row) => {
    const recovered = await recoverBacklinkRow(store, job, row);
    Object.assign(row, recovered);
    if (row.status !== 'ready') {
      return;
    }
    await fresh(row, true);
    row.status = 'sending';
    row.key = `${job.id}:${row.chat}`;
    await remember(row);
    // No replay of an ambiguous send. The stable key is retained in the intent
    // for provider-side reconciliation, including a crash before this receipt.
    try {
      if (cancelled()) {
        throw backlinkFailure('cancelled');
      }
      const result = await adapter.post({
        chat: row.chat,
        backlink: job.config.backlink,
        key: row.key,
        cancelled,
        read,
      });
      if (result?.chat !== row.chat || !publicationId(result.id)) {
        throw backlinkFailure('outcome-unknown');
      }
      Object.assign(row, {
        status: 'monitoring',
        messageId: String(result.id),
        sentAt: now(),
        checks: 0,
      });
    } catch (error) {
      const failure = backlinkError(error, { write: true });
      const refused =
        failure.providerCode !== undefined ||
        failure.providerError !== undefined ||
        [
          'cancelled',
          'account-changed',
          'not-connected',
          'not-writable',
          'unsupported',
        ].includes(failure.code);
      Object.assign(row, failure, {
        status: refused ? 'failed' : 'unknown',
      });
    }
    await remember(row);
  };
  const observe = async (row) => {
    await fresh(row);
    const result = await read(() =>
      adapter.inspect({ chat: row.chat, id: row.messageId })
    );
    if (
      !checkedReceipt(result, row) ||
      !['present', 'removed'].includes(result.state)
    ) {
      throw backlinkFailure('provider-response');
    }
    row.checks += 1;
    row.checkedAt = now();
    delete row.code;
    delete row.providerCode;
    delete row.providerError;
    if (result.state === 'removed') {
      row.status = 'rejected';
      try {
        row.skipRetry =
          (await read(() => adapter.retryNotice(row.chat))) === true;
      } catch (error) {
        row.notice = backlinkError(error);
      }
    } else if (row.checkedAt >= row.sentAt + job.config.monitorMs) {
      row.status = 'survived';
    }
    await remember(row);
  };
  const clean = createBacklinkCleanup({
    store,
    adapter,
    job,
    fresh,
    read,
    remember,
    cancelled,
  });
  return { deliver, observe, clean, save, cancelled };
};
