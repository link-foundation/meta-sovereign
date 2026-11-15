/** Browser-safe acceptance history, independent of the replaceable person ledger. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';

const serialize = createStoreQueue();
const BASE = 'provider-friend-initial:vk:';
const EVENT = 'provider-friend-acceptance:vk:';
const LEDGER = 'provider-friend:vk:';
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const accepted = (row) =>
  row?.status === 'confirmed' &&
  row.outcome === 'accepted' &&
  row.receipt === 2 &&
  positive(row.accountId) &&
  positive(row.userId);
const eventId = (row) =>
  `${EVENT}${row.accountId}:${row.planId ?? row.attemptedAt ?? 'legacy'}:${row.userId}`;

export const friendStatPeriod = (time) => {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Valid friend statistics date required');
  }
  const month = date.toISOString().slice(0, 7);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return { month, week: date.toISOString().slice(0, 10) };
};

export const observeInitialFriendCount = (store, accountId, count, time) =>
  serialize(store, async () => {
    if (!positive(accountId) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Valid account and initial friend count required');
    }
    const id = `${BASE}${accountId}`;
    if (!(await store.get(id))) {
      await saveAcknowledgedRecord(store, {
        id,
        accountId,
        initialFriendsCount: count,
        observedAt: new Date(time).toISOString(),
      });
    }
  });

/** Idempotent; archive a previous receipt before any later action overwrites it. */
export const retainFriendAcceptance = (store, row) =>
  serialize(store, async () => {
    if (!accepted(row)) {
      return;
    }
    const id = eventId(row);
    if (!(await store.get(id))) {
      await saveAcknowledgedRecord(store, {
        id,
        accountId: row.accountId,
        userId: row.userId,
        planId: row.planId ?? null,
        status: 'confirmed',
        outcome: 'accepted',
        receipt: 2,
        // Existing receipts without confirmation time contribute only to totals.
        confirmedAt: row.confirmedAt ?? null,
      });
    }
  });

export const readVkFriendStats = async (store, time = Date.now()) => {
  const period = friendStatPeriod(time);
  const rows = await store.query(
    (row) =>
      row.id.startsWith(BASE) ||
      row.id.startsWith(EVENT) ||
      row.id.startsWith(LEDGER)
  );
  const accounts = new Map();
  const account = (id) => {
    if (!accounts.has(id)) {
      accounts.set(id, {
        accountId: id,
        initialFriendsCount: null,
        observedAt: null,
        total: 0,
        month: 0,
        week: 0,
        undated: 0,
      });
    }
    return accounts.get(id);
  };
  const seen = new Set();
  // Prefer immutable events if a later person ledger has changed.
  for (const row of rows.filter((item) => item.id.startsWith(BASE))) {
    if (positive(row.accountId)) {
      Object.assign(account(row.accountId), {
        initialFriendsCount: row.initialFriendsCount,
        observedAt: row.observedAt,
      });
    }
  }
  for (const row of [
    ...rows.filter((item) => item.id.startsWith(EVENT)),
    ...rows.filter((item) => item.id.startsWith(LEDGER)),
  ]) {
    const identity = row.id.startsWith(EVENT) ? row.id : eventId(row);
    if (!accepted(row) || seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    const summary = account(row.accountId);
    summary.total++;
    if (!row.confirmedAt || !Number.isFinite(Date.parse(row.confirmedAt))) {
      summary.undated++;
      continue;
    }
    const at = friendStatPeriod(row.confirmedAt);
    summary.month += Number(at.month === period.month);
    summary.week += Number(at.week === period.week);
  }
  return {
    ok: true,
    timezone: 'UTC',
    ...period,
    accounts: [...accounts.values()].sort((a, b) => a.accountId - b.accountId),
  };
};
