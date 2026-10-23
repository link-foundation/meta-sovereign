// What a call is called and how the calls list is grouped, as Telegram
// Desktop does it (R-Y163; learned, never copied). Pure: no React, so the
// message renderer and the list share it and tests can import it alone.

/**
 * The kind of a call from its direction and the reason it ended:
 * 'incoming', 'outgoing', 'missed' (incoming, missed or busy) or
 * 'cancelled' (outgoing, nobody answered). `reason` is a class name
 * (PhoneCallDiscardReasonMissed ...) or its short form.
 */
export const callKind = (out, reason) => {
  const ended = String(reason ?? '').replace('PhoneCallDiscardReason', '');
  const unanswered = ended === 'Missed' || ended === 'Busy';
  if (out) {
    return unanswered ? 'cancelled' : 'outgoing';
  }
  return unanswered ? 'missed' : 'incoming';
};

/** "1:05" or "1:02:03" for seconds; empty when there were none. */
export const formatCallDuration = (seconds) => {
  const total = Math.floor(Number(seconds) || 0);
  if (total <= 0) {
    return '';
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const dayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

// What makes two calls one row: the same person, the same day and the
// same kind (direction, missed or not, video or not).
const sameRow = (a, b) =>
  a.chat === b.chat &&
  dayOf(a.date) === dayOf(b.date) &&
  a.out === b.out &&
  a.missed === b.missed &&
  a.video === b.video;

/**
 * Rows for the list: consecutive calls of the same person on the same day
 * (and kind) become one row, the newest call's, with `count`.
 */
export const groupCalls = (calls) => {
  const rows = [];
  for (const call of calls) {
    const last = rows.at(-1);
    if (last && sameRow(last, call)) {
      last.count += 1;
    } else {
      rows.push({ ...call, count: 1 });
    }
  }
  return rows;
};

/** The service line's key and duration for a call message. */
export const callLine = (link) => {
  const action = link?.raw?.action ?? {};
  const out = link?.outgoing ?? link?.raw?.out ?? false;
  const kind = callKind(Boolean(out), action.reason?.className);
  return {
    key: `chat.service.call.${action.video ? 'video.' : ''}${kind}`,
    duration: Number(action.duration) || 0,
  };
};
