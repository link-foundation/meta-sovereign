import { evidenceHash } from './vk-reengage-evidence.js';
import { refuseFriendAction } from './vk-friends-records.js';
import {
  isTombstone,
  markDeleted,
  unmarkDeleted,
} from '../storage/soft-delete.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { SYNC_STAMP } from '../sync/register.js';
const localIdentity = (row) => {
  if (!row) {
    return evidenceHash(null);
  }
  const { vc: _clock, [SYNC_STAMP]: _stamp, ...payload } = row;
  return evidenceHash(payload);
};
export const retentionLocal = async (store, peer, messages) => {
  const rows = [];
  for (const message of messages) {
    const row = message.id > 0 ? await store.get(`msg:vk:${message.id}`) : null;
    if (
      row?.source === 'vk' &&
      String(row.chat) === String(peer) &&
      row.body === message.text &&
      Date.parse(row.timestamp) === message.date * 1000 &&
      !isTombstone(row)
    ) {
      rows.push({ id: row.id, fingerprint: await localIdentity(row) });
    }
  }
  return rows;
};
const ownTombstone = async (current, row, ledgerId) =>
  current?.deleted?.by === 'vk-retention' &&
  current.deleted.reason === ledgerId &&
  (await localIdentity(unmarkDeleted(current))) === row.fingerprint;
export const verifyRetentionLocal = async (store, item, ledgerId) => {
  for (const row of item.local) {
    const current = await store.get(row.id);
    if (
      (await localIdentity(current)) !== row.fingerprint &&
      !(await ownTombstone(current, row, ledgerId))
    ) {
      refuseFriendAction('Reviewed local history changed; review again');
    }
  }
};
export const retentionHistoryMatches = (item, current, deleted = []) => {
  if (!current.complete) {
    return false;
  }
  const indexed = new Map(current.messages.map((m) => [m.cmid, m]));
  const acknowledged = new Set(deleted);
  return item.messages.every((row) => {
    const found = indexed.get(row.cmid);
    return acknowledged.has(row.cmid)
      ? !found
      : JSON.stringify(found) === JSON.stringify(row);
  });
};
export const clearRetentionLocal = async (
  context,
  state,
  item,
  guard,
  persist
) => {
  await verifyRetentionLocal(context.store, item, state.ledger.id);
  const done = new Set(state.ledger.localDone);
  for (const row of item.local) {
    await guard();
    if (!done.has(row.id)) {
      const current = await context.store.get(row.id);
      if (!(await ownTombstone(current, row, state.ledger.id))) {
        if ((await localIdentity(current)) !== row.fingerprint) {
          refuseFriendAction('Reviewed local history changed');
        }
        await saveAcknowledgedRecord(
          context.store,
          markDeleted(current, {
            at: new Date(context.now()).toISOString(),
            by: 'vk-retention',
            reason: state.ledger.id,
          })
        );
      }
      done.add(row.id);
    }
  }
  await persist({ localDone: [...done] });
};
