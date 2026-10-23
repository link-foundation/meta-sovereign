// A user's emoji status, as Telegram's apps show it (R-Y162; learned,
// never copied): the custom emoji after the name, hidden once its `until`
// (Unix seconds) has passed. Pure, so it is tested without a browser.

/** The durations the picker offers, in seconds (null: until changed). */
export const DURATIONS = Object.freeze([
  { key: 'hour1', seconds: 3600 },
  { key: 'hour2', seconds: 7200 },
  { key: 'hour8', seconds: 8 * 3600 },
  { key: 'day2', seconds: 2 * 86_400 },
  { key: 'forever', seconds: null },
]);

/** `{ id, until? }` while it shows at `nowMs`, else null. */
export const activeStatus = (status, nowMs = Date.now()) => {
  const id = status?.id === undefined ? '' : String(status.id);
  if (!/^\d{1,20}$/.test(id)) {
    return null;
  }
  const until = Number(status.until ?? 0);
  return until > 0 && until * 1000 <= nowMs ? null : { id, until };
};

/**
 * The status a stored link carries: a message's author (`prefix`
 * `senderEmoji`) or a person (`emoji`), as `<prefix>Status` and
 * `<prefix>Until`. Null when there is none.
 */
export const statusOfLink = (link, prefix) => {
  const id = link?.[`${prefix}Status`];
  if (!id) {
    return null;
  }
  const until = link[`${prefix}Until`];
  return { id: String(id), ...(until ? { until: Number(until) } : {}) };
};

/** When picking `seconds` from `nowMs`: the `until` to send, or undefined. */
export const untilOf = (seconds, nowMs = Date.now()) =>
  seconds ? Math.floor(nowMs / 1000) + seconds : undefined;
