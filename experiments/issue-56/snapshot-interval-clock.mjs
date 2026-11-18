/** Await real snapshot I/O while controlling only its bounded scheduling clock. */
export const snapshotIntervalClock = () => {
  let time = 1_000_000;
  let nextId = 0;
  const timers = new Map();
  const clock = {
    now: () => time,
    setTimeout(fn, ms) {
      const token = { id: ++nextId, unref() {} };
      timers.set(token.id, { token, at: time + ms, fn });
      return token;
    },
    clearTimeout: (token) => timers.delete(token?.id),
    get pending() {
      return timers.size;
    },
    async advance(ms, cost = 0) {
      const end = time + ms;
      for (let steps = 0; steps < 10; steps++) {
        const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
        if (!next || next.at > end) {
          time = Math.max(time, end);
          return;
        }
        timers.delete(next.token.id);
        time = Math.max(time, next.at);
        const writing = next.fn();
        if (typeof writing?.then !== 'function') {
          throw new Error('A snapshot timer must expose its write completion');
        }
        time += cost;
        cost = 0;
        await writing;
      }
      throw new Error('Snapshot clock exhausted its finite timer budget');
    },
  };
  return clock;
};
