/** One cancellable read at a time; failed reads retain acknowledged counts. */
export const VK_FRIEND_STATS_UPDATED = 'ms-vk-friend-stats-updated';
const count = (value) => Number.isSafeInteger(value) && value >= 0;
export const isVkFriendStats = (value) =>
  value?.ok === true &&
  value.timezone === 'UTC' &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month) &&
  /^\d{4}-\d{2}-\d{2}$/.test(value.week) &&
  new Date(`${value.week}T00:00:00Z`).getUTCDay() === 1 &&
  Array.isArray(value.accounts) &&
  value.accounts.length <= 1000 &&
  value.accounts.every(
    (row) =>
      row &&
      Number.isSafeInteger(row.accountId) &&
      row.accountId > 0 &&
      ['total', 'month', 'week', 'undated'].every((key) => count(row[key])) &&
      row.month <= row.total &&
      row.week <= row.total &&
      row.undated <= row.total &&
      (row.initialFriendsCount === null || count(row.initialFriendsCount))
  ) &&
  new Set(value.accounts.map((row) => row.accountId)).size ===
    value.accounts.length;

export const followVkFriendStats = ({
  read,
  update,
  fail,
  clock = globalThis,
}) => {
  const controller = new AbortController();
  let timer;
  let active = false;
  let queued = false;
  let failures = 0;
  let snapshot;
  const refresh = async () => {
    if (controller.signal.aborted) {
      return;
    }
    if (active) {
      queued = true;
      return;
    }
    active = true;
    clock.clearTimeout(timer);
    try {
      const answer = await read(controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      if (
        !isVkFriendStats(answer) ||
        (answer.cached && snapshot && !snapshot.cached)
      ) {
        throw new Error('friend statistics unavailable');
      }
      snapshot = answer;
      failures = 0;
      update(answer);
    } catch {
      if (!controller.signal.aborted) {
        failures++;
        fail();
      }
    } finally {
      active = false;
      if (!controller.signal.aborted) {
        const delay = queued
          ? 0
          : Math.min(60000, 15000 * 2 ** Math.min(failures, 2));
        queued = false;
        timer = clock.setTimeout(refresh, delay);
      }
    }
  };
  void refresh();
  return {
    refresh,
    close() {
      controller.abort();
      clock.clearTimeout(timer);
    },
  };
};
