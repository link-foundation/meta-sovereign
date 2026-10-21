/**
 * A poll and a checklist as Telegram's apps show them (R-Y74), from the
 * stored `messageMediaPoll` / `messageMediaToDo` (layer 225).
 *
 * - An answer's `option` is bytes, stored as base64 (R-Y28): it is what
 *   a vote names.
 * - Results come apart from the poll: `chosen` (our vote), `correct` (a
 *   quiz's right answer, known once we answered or it closed), `voters`
 *   per answer and `totalVoters`.
 * - Shares are whole percents adding up to 100, as Telegram Desktop
 *   shows them (largest remainders), when each voter chose one answer.
 */

const textOf = (value) =>
  typeof value === 'string' ? value : (value?.text ?? '');

const keyOf = (option) => option?.bytes ?? JSON.stringify(option ?? null);

const numberOr = (value, fallback = null) =>
  value === null || value === undefined || value === ''
    ? fallback
    : Number(value);

/** A Peer as the chat id the app names it by. */
export const peerKeyOf = (peer) => {
  if (!peer) {
    return null;
  }
  if (peer.userId !== undefined) {
    return String(peer.userId);
  }
  if (peer.chatId !== undefined) {
    return `-${peer.chatId}`;
  }
  return peer.channelId === undefined ? null : `-100${peer.channelId}`;
};

/**
 * Whole percents of `total` for each count. When the counts add up to
 * the total (one answer each), they add up to 100: the floors, then one
 * more each for the largest remainders.
 */
export const nicePercents = (counts, total) => {
  if (!(total > 0)) {
    return counts.map(() => 0);
  }
  const exact = counts.map((c) => ((c ?? 0) * 100) / total);
  const sum = counts.reduce((n, c) => n + (c ?? 0), 0);
  if (sum !== total) {
    return exact.map((p) => Math.round(p));
  }
  const shares = exact.map(Math.floor);
  let left = 100 - shares.reduce((n, p) => n + p, 0);
  const order = exact
    .map((p, i) => [p - Math.floor(p), i])
    .filter(([rest]) => rest > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) {
      break;
    }
    shares[i] += 1;
    left -= 1;
  }
  return shares;
};

const flagsOf = (poll) => ({
  quiz: Boolean(poll.quiz),
  closed: Boolean(poll.closed),
  publicVoters: Boolean(poll.publicVoters),
  multipleChoice: Boolean(poll.multipleChoice),
  revotingDisabled: Boolean(poll.revotingDisabled),
  hideResultsUntilClose: Boolean(poll.hideResultsUntilClose),
  creator: Boolean(poll.creator),
  closePeriod: numberOr(poll.closePeriod),
  closeDate: numberOr(poll.closeDate),
});

/** `messageMediaPoll` as the app draws it. */
export const parsePoll = (m) => {
  const poll = m?.poll ?? {};
  const results = m?.results ?? {};
  const byOption = new Map(
    (results.results ?? []).map((r) => [keyOf(r.option), r])
  );
  const answers = (poll.answers ?? []).map((a) => {
    const r = byOption.get(keyOf(a.option));
    return {
      text: textOf(a.text),
      option: a.option?.bytes ?? null,
      voters: r ? numberOr(r.voters, 0) : null,
      chosen: Boolean(r?.chosen),
      correct: Boolean(r?.correct),
    };
  });
  return {
    kind: 'poll',
    id: poll.id === undefined ? null : String(poll.id),
    question: textOf(poll.question),
    ...flagsOf(poll),
    total: numberOr(results.totalVoters),
    answers,
    voted: answers.some((a) => a.chosen),
    recentVoters: (results.recentVoters ?? []).map(peerKeyOf).filter(Boolean),
    solution: results.solution || null,
    canViewStats: Boolean(results.canViewStats),
  };
};

/** Whether the poll shows its results: voted, closed, or ours to see. */
export const showsResults = (poll) =>
  Boolean(poll) &&
  (poll.closed || poll.voted) &&
  !(poll.hideResultsUntilClose && !poll.closed);

/** Whether our vote can be taken back (not in a quiz, not once closed). */
export const canRetract = (poll) =>
  Boolean(poll?.voted) && !poll.closed && !poll.quiz && !poll.revotingDisabled;

/** Whether this user may stop the poll: its author, while it is open. */
export const canStop = (poll, message) =>
  Boolean(poll) &&
  !poll.closed &&
  (poll.creator || Boolean(message?.raw?.out)) &&
  message?.source === 'telegram' &&
  !message.pending;

/** The poll in a stored message, or null. */
export const pollOfMessage = (message) =>
  message?.raw?.media?.className === 'MessageMediaPoll'
    ? parsePoll(message.raw.media)
    : null;

/** `messageMediaToDo` (a checklist) as the app draws it. */
export const parseTodo = (m) => {
  const done = new Map(
    (m?.completions ?? []).map((c) => [
      Number(c.id),
      { by: peerKeyOf(c.completedBy), date: numberOr(c.date) },
    ])
  );
  const todo = m?.todo ?? {};
  return {
    kind: 'todo',
    title: textOf(todo.title),
    othersCanAppend: Boolean(todo.othersCanAppend),
    othersCanComplete: Boolean(todo.othersCanComplete),
    items: (todo.list ?? []).map((item) => ({
      id: Number(item.id),
      text: textOf(item.title),
      done: done.has(Number(item.id)),
      by: done.get(Number(item.id))?.by ?? null,
    })),
  };
};
